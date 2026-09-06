-- ═══════════════════════════════════════════════════════════════════════
--  MANT-2 · Registro de cumplimiento y su estado calculado
--
--  §4.4/§4.5 del corte original, sin cambios respecto al Plan aprobado: el
--  registro de evidencia y su semáforo no dependían del rediseño de
--  mant_requisito — solo cambia contra qué requisito_id apuntan.
--
--  Simplificación deliberada frente al texto original del corte: en vez de
--  un `documento_id` con FK a un módulo de gestión documental genérico (que
--  no existe todavía en el repo para este dominio — solo hay
--  `documentos_inmueble`, específico de inmuebles), se usa
--  `evidencia_referencia text not null` — un enlace o una descripción de
--  dónde queda el certificado. Documentado como decisión abierta en
--  MANT_02_INFORME.md: cuando exista un módulo de documentos genérico, este
--  campo se reemplaza por su FK sin tocar la semántica (sigue siendo "sin
--  esto no hay cumplimiento").
-- ═══════════════════════════════════════════════════════════════════════

create type public.cumplimiento_resultado_t as enum ('conforme', 'con_hallazgos', 'no_conforme');
comment on type public.cumplimiento_resultado_t is
  'Resultado de una revisión/certificación de cumplimiento normativo de mantenimiento. Gatilla '
  'cómo se interpreta el semáforo de mant_estado_cumplimiento: un registro con hallazgos o no '
  'conforme sigue contando como cumplido para efectos de vencimiento (se hizo la revisión), '
  'pero la UI lo distingue de uno conforme — no es vocabulario descriptivo suelto.';

create table public.mant_cumplimiento (
  id                          uuid primary key default gen_random_uuid(),
  tenant_id                   uuid not null references public.tenants (id) on delete cascade,
  requisito_id                uuid not null references public.mant_requisito (id),
  -- null cuando el requisito es de copropiedad, no de un activo físico registrado
  -- (mant_requisito.tipo_activo_id is null).
  activo_id                   uuid references public.activos (id),
  fecha_cumplimiento          date not null,
  -- Se calcula por trigger desde mant_requisito.frecuencia_meses; nunca se digita (guard lo
  -- recalcula siempre, ignorando cualquier valor que llegue en el INSERT).
  vence_at                    date,
  ejecutado_por_tercero_id    uuid references public.terceros (id),
  acreditacion_referencia     text,
  resultado                   public.cumplimiento_resultado_t not null default 'conforme',
  evidencia_referencia        text,
  registrado_por              uuid references public.profiles (id),
  created_at                  timestamptz not null default now()
);

create index mant_cumplimiento_tenant_idx on public.mant_cumplimiento (tenant_id);
create index mant_cumplimiento_requisito_idx on public.mant_cumplimiento (requisito_id);
create index mant_cumplimiento_activo_idx on public.mant_cumplimiento (activo_id) where activo_id is not null;
-- El semáforo (mant_estado_cumplimiento) siempre pide "el más reciente por (requisito, activo)".
create index mant_cumplimiento_ultimo_idx
  on public.mant_cumplimiento (requisito_id, activo_id, fecha_cumplimiento desc);

alter table public.mant_cumplimiento enable row level security;
alter table public.mant_cumplimiento force row level security;

create policy mant_cumplimiento_select_miembro
  on public.mant_cumplimiento for select
  to authenticated
  using (public.is_member(tenant_id));

create policy mant_cumplimiento_insert_auxiliar
  on public.mant_cumplimiento for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

-- Sin policy de update ni delete: append-only por diseño (§4.4 — "se corrige con un
-- cumplimiento nuevo"). Un intento de UPDATE de un cliente `authenticated` lo bloquea RLS solo,
-- sin necesitar un guard aparte.

create function public.guard_mant_cumplimiento()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_requisito public.mant_requisito;
  v_activo_tenant uuid;
  v_activo_tipo_id bigint;
begin
  select * into v_requisito from public.mant_requisito where id = new.requisito_id;
  if v_requisito.tenant_id is distinct from new.tenant_id then
    raise exception 'ACTIVO_TENANT_INCONSISTENTE: el requisito % no pertenece al tenant %',
      new.requisito_id, new.tenant_id;
  end if;

  if new.activo_id is not null then
    select tenant_id, tipo_id into v_activo_tenant, v_activo_tipo_id
    from public.activos where id = new.activo_id;
    if v_activo_tenant is distinct from new.tenant_id then
      raise exception 'ACTIVO_TENANT_INCONSISTENTE: el activo % no pertenece al tenant %',
        new.activo_id, new.tenant_id;
    end if;
    if v_requisito.tipo_activo_id is not null and v_activo_tipo_id is distinct from v_requisito.tipo_activo_id then
      raise exception 'CUMPLIMIENTO_ACTIVO_TIPO_INVALIDO: el activo % no es del tipo que exige el requisito %',
        new.activo_id, new.requisito_id;
    end if;
  end if;

  if new.evidencia_referencia is null or btrim(new.evidencia_referencia) = '' then
    raise exception 'CUMPLIMIENTO_SIN_EVIDENCIA: un cumplimiento sin evidencia es una afirmación, no un registro';
  end if;

  if v_requisito.requiere_tercero_acreditado
     and (new.ejecutado_por_tercero_id is null
          or new.acreditacion_referencia is null or btrim(new.acreditacion_referencia) = '') then
    raise exception 'CUMPLIMIENTO_SIN_ACREDITACION: este requisito exige tercero acreditado y su referencia de acreditación';
  end if;

  -- Nunca se digita: siempre se recalcula desde la frecuencia del requisito, sin importar lo
  -- que haya llegado en el INSERT.
  if v_requisito.frecuencia_meses is null then
    new.vence_at := null;
  else
    new.vence_at := (new.fecha_cumplimiento + (v_requisito.frecuencia_meses || ' months')::interval)::date;
  end if;

  return new;
end;
$$;

comment on function public.guard_mant_cumplimiento() is
  'Valida consistencia de tenant entre cumplimiento/requisito/activo, exige evidencia y '
  'acreditación cuando el requisito la requiere, y recalcula vence_at desde '
  'mant_requisito.frecuencia_meses — nunca acepta un vence_at digitado por el cliente.';

create trigger mant_cumplimiento_guard
  before insert on public.mant_cumplimiento
  for each row execute function public.guard_mant_cumplimiento();

-- ═══════════════════════════════════════════════════════════════════════
--  Estado calculado — nunca almacenado (mismo criterio que CO-5/GOB-5: un
--  estado guardado exige un job y alguien lo olvida). Sin scheduler nuevo:
--  es una consulta de solo lectura, se recalcula en cada llamada.
-- ═══════════════════════════════════════════════════════════════════════

create function public.mant_estado_cumplimiento(
  p_tenant_id uuid, p_fecha date default current_date, p_umbral_dias integer default 30
)
returns table (
  requisito_id uuid, requisito_nombre text, activo_id uuid, activo_codigo text,
  ultima_fecha date, vence_at date, estado text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with req as (
    select r.id, r.nombre, r.tipo_activo_id
    from public.mant_requisito r
    where r.tenant_id = p_tenant_id and r.activo
  ),
  alcance as (
    select req.id as requisito_id, req.nombre as requisito_nombre,
           null::uuid as activo_id, null::text as activo_codigo
    from req where req.tipo_activo_id is null
    union all
    select req.id, req.nombre, a.id, a.codigo
    from req
    join public.activos a on a.tenant_id = p_tenant_id and a.tipo_id = req.tipo_activo_id
    where req.tipo_activo_id is not null
  ),
  ultimo as (
    select distinct on (c.requisito_id, coalesce(c.activo_id, '00000000-0000-0000-0000-000000000000'::uuid))
      c.requisito_id, c.activo_id, c.fecha_cumplimiento, c.vence_at
    from public.mant_cumplimiento c
    where c.tenant_id = p_tenant_id
    order by c.requisito_id, coalesce(c.activo_id, '00000000-0000-0000-0000-000000000000'::uuid),
             c.fecha_cumplimiento desc
  )
  select
    alcance.requisito_id, alcance.requisito_nombre, alcance.activo_id, alcance.activo_codigo,
    ultimo.fecha_cumplimiento, ultimo.vence_at,
    case
      when ultimo.fecha_cumplimiento is null then 'nunca_cumplido'
      when ultimo.vence_at is null then 'al_dia'
      when ultimo.vence_at < p_fecha then 'vencido'
      when ultimo.vence_at <= (p_fecha + (p_umbral_dias || ' days')::interval)::date then 'proximo_a_vencer'
      else 'al_dia'
    end as estado
  from alcance
  left join ultimo
    on ultimo.requisito_id = alcance.requisito_id
   and coalesce(ultimo.activo_id, '00000000-0000-0000-0000-000000000000'::uuid)
     = coalesce(alcance.activo_id, '00000000-0000-0000-0000-000000000000'::uuid)
$$;

comment on function public.mant_estado_cumplimiento(uuid, date, integer) is
  'Semáforo de cumplimiento por (requisito, activo) para la fecha dada — calculado en cada '
  'llamada, nunca almacenado, así que ningún job puede dejarlo desactualizado. '
  'p_umbral_dias (default 30) es el límite de "próximo a vencer"; no hay job/scheduler nuevo — '
  'mismo criterio de solo-lectura que contable_estado_financiero (CO-5): un estado guardado '
  'exige un job y alguien lo olvida.';
