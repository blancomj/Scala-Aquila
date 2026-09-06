-- ═══════════════════════════════════════════════════════════════════════
--  MANT-5 · Proveedores, contratos y garantías (9/9)
--  Casos de uso/Tres Modulos/Mantenimiento/MANT_05_proveedores_contratos_garantias.md §4.5
--
--  Una de las funciones que más dinero ahorra: al crear una OT correctiva
--  sobre un activo con garantía vigente, el sistema ADVIERTE (nunca
--  bloquea — "un número calculado nunca es una decisión", principio #4
--  del marco) que puede que no haya que pagar el gasto.
--
--  Vencimiento de garantías de constructora sobre bienes comunes (Ley
--  675/2001, Ley 1796/2016): SIN calcular automáticamente, tal como exige
--  el §4.5 — la fecha se digita con su documento de soporte hasta
--  verificar plazos y alcance exacto contra fuente primaria (pregunta
--  abierta en el informe).
-- ═══════════════════════════════════════════════════════════════════════

create type public.garantia_origen_t as enum ('constructora', 'fabricante', 'proveedor', 'contrato');
comment on type public.garantia_origen_t is
  'MANT-5 §4.5: de dónde nace la garantía. Gatilla guard_mant_garantia — ''contrato'' exige '
  'contrato_id poblado; los demás lo rechazan (misma consistencia de origen que ot_origen_t, '
  'MANT-4). No es vocabulario descriptivo: cada valor determina qué columna es obligatoria.';

create table public.mant_garantias (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  activo_id     uuid not null references public.activos (id),
  origen        public.garantia_origen_t not null,
  tercero_id    uuid references public.terceros (id),
  documento_id  uuid references public.documentos (id),
  vigente_desde date not null,
  vigente_hasta date,
  alcance       text,
  exclusiones   text,
  contrato_id   uuid references public.mant_contratos (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,

  constraint mant_garantias_fechas_validas
    check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);

alter table public.mant_garantias enable row level security;
alter table public.mant_garantias force row level security;

create index mant_garantias_tenant_idx on public.mant_garantias (tenant_id);
create index mant_garantias_activo_idx on public.mant_garantias (activo_id);

comment on table public.mant_garantias is
  'MANT-5 §4.5: garantía vigente sobre un activo — de la constructora, del fabricante, del '
  'proveedor o de un contrato. El vencimiento de garantías de constructora (Ley 675/1796) NO se '
  'calcula automáticamente hasta verificar plazos contra fuente primaria — la fecha se digita '
  'con su documento de soporte.';

create policy mant_garantias_select_miembro
  on public.mant_garantias for select
  to authenticated
  using (public.is_member(tenant_id));

create policy mant_garantias_insert_auxiliar
  on public.mant_garantias for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy mant_garantias_update_auxiliar
  on public.mant_garantias for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create function public.guard_mant_garantia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_activo_tenant   uuid;
  v_tercero_tenant  uuid;
  v_contrato_tenant uuid;
begin
  select tenant_id into v_activo_tenant from public.activos where id = new.activo_id;
  if v_activo_tenant is null or v_activo_tenant <> new.tenant_id then
    raise exception 'ACTIVO_TENANT_INCONSISTENTE: activo_id % no pertenece al tenant',
      new.activo_id;
  end if;

  if new.tercero_id is not null then
    select tenant_id into v_tercero_tenant from public.terceros where id = new.tercero_id;
    if v_tercero_tenant is null or v_tercero_tenant <> new.tenant_id then
      raise exception 'GARANTIA_TENANT_INCONSISTENTE: tercero_id % no pertenece al tenant',
        new.tercero_id;
    end if;
  end if;

  if new.origen = 'contrato' then
    if new.contrato_id is null then
      raise exception 'GARANTIA_ORIGEN_INCONSISTENTE: origen = ''contrato'' exige contrato_id';
    end if;
    select tenant_id into v_contrato_tenant from public.mant_contratos where id = new.contrato_id;
    if v_contrato_tenant is null or v_contrato_tenant <> new.tenant_id then
      raise exception 'GARANTIA_TENANT_INCONSISTENTE: contrato_id % no pertenece al tenant',
        new.contrato_id;
    end if;
  elsif new.contrato_id is not null then
    raise exception 'GARANTIA_ORIGEN_INCONSISTENTE: origen = % no admite contrato_id', new.origen;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

comment on function public.guard_mant_garantia() is
  'MANT-5 §4.5: valida tenant de activo/tercero/contrato y la consistencia origen<->contrato_id '
  '(mismo criterio que guard_mant_ot con ot_origen_t, MANT-4).';

create trigger mant_garantias_guard
  before insert or update on public.mant_garantias
  for each row execute function public.guard_mant_garantia();

-- ── Advertencia: garantías vigentes de un activo — SOLO informa, nunca bloquea ──────────
create function public.mant_activo_garantias_vigentes(p_activo_id uuid, p_fecha date default current_date)
returns table (
  garantia_id   uuid,
  origen        public.garantia_origen_t,
  vigente_hasta date,
  alcance       text,
  exclusiones   text
)
language sql
stable
set search_path = ''
as $$
  select id, origen, vigente_hasta, alcance, exclusiones
  from public.mant_garantias
  where activo_id = p_activo_id
    and vigente_desde <= p_fecha
    and (vigente_hasta is null or vigente_hasta >= p_fecha);
$$;

comment on function public.mant_activo_garantias_vigentes(uuid, date) is
  'MANT-5 §4.5: garantías vigentes de un activo — la UI la consulta al crear una OT correctiva '
  'para advertir ANTES de autorizar el gasto. Puramente informativa: nunca bloquea la creación '
  'de la OT (principio #4 del marco, "un número calculado nunca es una decisión").';

-- ── Reclamaciones de garantía, con su resultado ──────────────────────────────────────────
create table public.mant_garantia_reclamaciones (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  garantia_id      uuid not null references public.mant_garantias (id) on delete cascade,
  fecha_reclamo    date not null default current_date,
  descripcion      text not null,
  resultado_id     bigint references public.lista_tipos (id),
  fecha_resolucion date,
  documento_id     uuid references public.documentos (id),
  registrado_por   uuid references public.profiles (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz,

  constraint mant_garantia_reclamaciones_descripcion_no_vacia check (btrim(descripcion) <> '')
);

alter table public.mant_garantia_reclamaciones enable row level security;
alter table public.mant_garantia_reclamaciones force row level security;

create index mant_garantia_reclamaciones_garantia_idx on public.mant_garantia_reclamaciones (garantia_id);

comment on table public.mant_garantia_reclamaciones is
  'MANT-5 §4.5: registro de reclamaciones hechas sobre una garantía, con su resultado '
  '(RESULTADO_RECLAMACION_GARANTIA) — una garantía puede tener varias reclamaciones a lo largo '
  'de su vigencia.';

create policy mant_garantia_reclamaciones_select_miembro
  on public.mant_garantia_reclamaciones for select
  to authenticated
  using (public.is_member(tenant_id));

create policy mant_garantia_reclamaciones_insert_auxiliar
  on public.mant_garantia_reclamaciones for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy mant_garantia_reclamaciones_update_auxiliar
  on public.mant_garantia_reclamaciones for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create function public.guard_mant_garantia_reclamacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_garantia_tenant uuid;
  v_resultado_tipo  text;
begin
  select tenant_id into v_garantia_tenant from public.mant_garantias where id = new.garantia_id;
  if v_garantia_tenant is null or v_garantia_tenant <> new.tenant_id then
    raise exception 'GARANTIA_TENANT_INCONSISTENTE: garantia_id % no pertenece al tenant',
      new.garantia_id;
  end if;

  if new.resultado_id is not null then
    select tipo into v_resultado_tipo from public.lista_tipos where id = new.resultado_id;
    if v_resultado_tipo is distinct from 'RESULTADO_RECLAMACION_GARANTIA' then
      raise exception 'GARANTIA_RESULTADO_INVALIDO: resultado_id % no pertenece a '
        'RESULTADO_RECLAMACION_GARANTIA (es %)', new.resultado_id, coalesce(v_resultado_tipo, 'inexistente');
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger mant_garantia_reclamaciones_guard
  before insert or update on public.mant_garantia_reclamaciones
  for each row execute function public.guard_mant_garantia_reclamacion();
