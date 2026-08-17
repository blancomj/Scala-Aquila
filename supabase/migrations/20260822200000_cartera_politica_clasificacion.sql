-- ═══════════════════════════════════════════════════════════════════════
--  CAR F1 · Política de clasificación de cartera
--  Propietario: Docs/Motor de gestion de cartera/CAR_00_Guia_Oficial.md §8
--
--  REC-CAR-006: replica el patrón de versionado de politicas_financieras
--  (20260814100100_domain_tables.sql) — version/estado/vigencia/hash,
--  inmutable una vez vigente, corregir = nueva versión. REC-CAR-001:
--  nombres físicos en español, sin excepción.
--
--  GAP-CAR-009 (CAR §21.2): tenant_role_t solo tiene (agent, auditor) — no
--  existe todavía el rol de administrador. Las políticas RLS de escritura
--  usan 'agent', igual que politicas_financieras hoy; deben endurecerse
--  cuando GAP-CAR-009 se resuelva.
-- ═══════════════════════════════════════════════════════════════════════

create type public.nivel_riesgo_t as enum (
  'ninguno', 'bajo', 'medio', 'alto', 'critico'
);

create type public.etapa_cobranza_t as enum (
  'preventiva', 'administrativa', 'prejuridica', 'juridica', 'judicial'
);

-- ── politicas_clasificacion_cartera ─────────────────────────────────────
create table public.politicas_clasificacion_cartera (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  version         int not null,
  estado          public.vigencia_estado_t not null default 'borrador',
  vigente_desde   date,
  vigente_hasta   date,
  nombre          text not null,
  descripcion     text,
  -- 19 §73 / policy_hash de politicas_financieras: hash del contenido
  -- canónico (política + tramos) — provenance de cada clasificación (CAR §6.3).
  policy_hash     text not null,
  aprobada_por    uuid references public.profiles (id),
  acta_referencia text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);

alter table public.politicas_clasificacion_cartera enable row level security;
alter table public.politicas_clasificacion_cartera force row level security;

create index politicas_clasificacion_cartera_tenant_idx
  on public.politicas_clasificacion_cartera (tenant_id);
create unique index politicas_clasificacion_cartera_version_unica
  on public.politicas_clasificacion_cartera (tenant_id, version);
create unique index politicas_clasificacion_cartera_vigente_unica
  on public.politicas_clasificacion_cartera (tenant_id)
  where estado = 'vigente';

comment on table public.politicas_clasificacion_cartera is
  'Tramos de antigüedad que clasifican la cartera de un inmueble (CAR §8) — política de '
  'gestión de la copropiedad, NO impuesta por la Ley 675 (CAR §8.1). Versionada e inmutable '
  'una vez vigente/historica, mismo patrón que politicas_financieras: corregir = nueva versión '
  '(REC-CAR-011). Una clasificación histórica nunca se recalcula con una política posterior '
  '(I-C10, PH-C30).';

create trigger set_updated_at before update on public.politicas_clasificacion_cartera
  for each row execute function public.set_updated_at();

-- Reutiliza el guard genérico de politicas_financieras (20260814100300_domain_
-- triggers.sql) — opera sobre old.estado/id/version, válido para cualquier
-- tabla con esa forma. No se duplica (REC-CAR-004).
create trigger guard_politica_inmutable
  before update on public.politicas_clasificacion_cartera
  for each row execute function public.guard_politica_inmutable();

-- ── politica_clasificacion_tramos ───────────────────────────────────────
create table public.politica_clasificacion_tramos (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  politica_id    uuid not null references public.politicas_clasificacion_cartera (id) on delete cascade,
  codigo         text not null,
  nombre         text not null,
  dias_min       int not null check (dias_min >= 0),
  -- null = sin tope superior — exactamente un tramo de la política lo tiene (IC-TRAMO-03).
  dias_max       int,
  nivel_riesgo   public.nivel_riesgo_t not null,
  etapa_cobranza public.etapa_cobranza_t not null,
  prioridad      int not null,
  orden          int not null,
  created_at     timestamptz not null default now(),

  constraint politica_clasificacion_tramos_codigo_unico unique (politica_id, codigo),
  constraint politica_clasificacion_tramos_rango_valido
    check (dias_max is null or dias_max >= dias_min)
);

alter table public.politica_clasificacion_tramos enable row level security;
alter table public.politica_clasificacion_tramos force row level security;

create index politica_clasificacion_tramos_tenant_idx
  on public.politica_clasificacion_tramos (tenant_id);
create index politica_clasificacion_tramos_politica_idx
  on public.politica_clasificacion_tramos (politica_id);

comment on table public.politica_clasificacion_tramos is
  'Tramos de una politicas_clasificacion_cartera — espejo físico de TramoClasificacion '
  '(packages/liquidation-engine/src/cartera.ts). Deben cubrir [0,∞) sin huecos ni solapes '
  '(IC-TRAMO-01/02), validado por guard_politica_clasificacion_completa antes de activar '
  'la política dueña.';

-- ── guard: los tramos de una política vigente/historica son inmutables ──
-- Espejo del guard append-only de cargos/pagos, pero condicionado al
-- estado de la política dueña en vez de incondicional (REC-CAR-011).
create function public.guard_tramo_politica_inmutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_politica_id uuid := coalesce(new.politica_id, old.politica_id);
  v_estado public.vigencia_estado_t;
begin
  select estado into v_estado
    from public.politicas_clasificacion_cartera
   where id = v_politica_id;

  if v_estado in ('vigente', 'historica') then
    raise exception 'IMMUTABLE_POLICY: los tramos de la política de clasificación % son '
      'inmutables en estado % — corrige creando una versión nueva (CAR §8.5 REC-CAR-011)',
      v_politica_id, v_estado;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger guard_tramo_politica_inmutable
  before insert or update or delete on public.politica_clasificacion_tramos
  for each row execute function public.guard_tramo_politica_inmutable();

-- ── guard: IC-TRAMO-01..05 antes de permitir estado='vigente' ───────────
-- Espejo SQL de validarPoliticaClasificacion() (packages/liquidation-engine/
-- src/cartera.ts) — misma regla, dos capas de refuerzo (CAR §31, DoD §30.1:
-- "los invariantes afectados tienen test y, si aplica, refuerzo en esquema").
create function public.guard_politica_clasificacion_completa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total int;
  v_distintos_codigo int;
  v_con_min_cero int;
  v_sin_tope int;
  v_primer_min int;
  v_hueco_o_solape int;
begin
  -- Solo se valida al entrar a 'vigente' — un borrador puede estar incompleto.
  if new.estado <> 'vigente' or old.estado = 'vigente' then
    return new;
  end if;

  select count(*), count(distinct codigo)
    into v_total, v_distintos_codigo
    from public.politica_clasificacion_tramos
   where politica_id = new.id;

  if v_total = 0 then
    raise exception 'POLITICA_CLASIFICACION_SIN_TRAMOS: la política % no tiene tramos '
      '(CAR §8.3)', new.id;
  end if;

  if v_distintos_codigo <> v_total then
    raise exception 'POLITICA_CLASIFICACION_CODIGO_DUPLICADO: la política % tiene códigos '
      'de tramo duplicados (CAR §8.3 IC-TRAMO-05)', new.id;
  end if;

  select count(*) into v_con_min_cero
    from public.politica_clasificacion_tramos
   where politica_id = new.id and dias_min = 0;
  if v_con_min_cero <> 1 then
    raise exception 'POLITICA_CLASIFICACION_SIN_TRAMO_INICIAL: se esperaba exactamente 1 '
      'tramo con dias_min=0 en la política %, hay % (CAR §8.3 IC-TRAMO-04)', new.id, v_con_min_cero;
  end if;

  select count(*) into v_sin_tope
    from public.politica_clasificacion_tramos
   where politica_id = new.id and dias_max is null;
  if v_sin_tope <> 1 then
    raise exception 'POLITICA_CLASIFICACION_SIN_TRAMO_ABIERTO: se esperaba exactamente 1 '
      'tramo con dias_max=null en la política %, hay % (CAR §8.3 IC-TRAMO-03)', new.id, v_sin_tope;
  end if;

  -- El tramo sin tope superior debe ser el de mayor dias_min — si hay otro
  -- tramo después de él, es un solape/orden inválido (IC-TRAMO-02/03).
  if exists (
    select 1
      from public.politica_clasificacion_tramos abierto
      join public.politica_clasificacion_tramos otro
        on otro.politica_id = abierto.politica_id
       and otro.id <> abierto.id
     where abierto.politica_id = new.id
       and abierto.dias_max is null
       and otro.dias_min > abierto.dias_min
  ) then
    raise exception 'POLITICA_CLASIFICACION_HUECO_O_SOLAPE: el tramo sin tope superior de la '
      'política % no es el de mayor dias_min (CAR §8.3 IC-TRAMO-02/03)', new.id;
  end if;

  select min(dias_min) into v_primer_min
    from public.politica_clasificacion_tramos
   where politica_id = new.id;
  if v_primer_min <> 0 then
    raise exception 'POLITICA_CLASIFICACION_HUECO: falta cobertura antes de dias_min=% en la '
      'política % (CAR §8.3 IC-TRAMO-01)', v_primer_min, new.id;
  end if;

  select count(*) into v_hueco_o_solape
    from (
      select
        dias_min,
        lag(dias_max) over (order by dias_min) as anterior_max
        from public.politica_clasificacion_tramos
       where politica_id = new.id
    ) t
   where anterior_max is not null
     and (anterior_max + 1) <> dias_min;

  if v_hueco_o_solape > 0 then
    raise exception 'POLITICA_CLASIFICACION_HUECO_O_SOLAPE: los tramos de la política % no '
      'cubren [0,∞) sin huecos ni solapes (CAR §8.3 IC-TRAMO-01/02)', new.id;
  end if;

  return new;
end;
$$;

create trigger guard_politica_clasificacion_completa
  before update on public.politicas_clasificacion_cartera
  for each row execute function public.guard_politica_clasificacion_completa();

-- ── RLS ──────────────────────────────────────────────────────────────────
create policy politicas_clasificacion_cartera_select_miembro
  on public.politicas_clasificacion_cartera for select
  to authenticated
  using (public.is_member(tenant_id));

create policy politicas_clasificacion_cartera_insert_agent
  on public.politicas_clasificacion_cartera for insert
  to authenticated
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create policy politicas_clasificacion_cartera_update_agent
  on public.politicas_clasificacion_cartera for update
  to authenticated
  using (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create policy politica_clasificacion_tramos_select_miembro
  on public.politica_clasificacion_tramos for select
  to authenticated
  using (public.is_member(tenant_id));

create policy politica_clasificacion_tramos_insert_agent
  on public.politica_clasificacion_tramos for insert
  to authenticated
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create policy politica_clasificacion_tramos_update_agent
  on public.politica_clasificacion_tramos for update
  to authenticated
  using (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create policy politica_clasificacion_tramos_delete_agent
  on public.politica_clasificacion_tramos for delete
  to authenticated
  using (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));
