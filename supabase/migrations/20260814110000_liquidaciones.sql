-- ═══════════════════════════════════════════════════════════════════════
--  F5 · Persistencia mínima del resultado de liquidación (D-14)
--  Propietario: PLAN_MAESTRO_IMPLEMENTACION.md §5.3, Docs/20 §5-18
--
--  D-14: sin la máquina de 15 estados de Docs/20 §61-68 (draft/validated/
--  finalized/published/failed con gates entre cada uno) — un estado simple.
--  Sin `intento` en la unicidad (16 §84-85 IDEMPOTENCY prevé reintentos;
--  v0 no los soporta, AD-23 lo amplía cuando un caso real lo requiera).
-- ═══════════════════════════════════════════════════════════════════════

create type public.liquidacion_estado_t as enum ('completada', 'fallida');

create table public.liquidaciones (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  periodo_id    uuid not null references public.periodos (id) on delete cascade,
  estado        public.liquidacion_estado_t not null default 'completada',
  -- Docs/20 §55 RESULT HASH: mismo snapshot ⇒ mismo result_hash (PLAN §5.4).
  result_hash   text not null,
  tenant_total  numeric(18, 2) not null,
  created_at    timestamptz not null default now(),

  -- Idempotencia simplificada de v0: una liquidación completada por periodo.
  constraint liquidaciones_periodo_unico unique (tenant_id, periodo_id)
);

alter table public.liquidaciones enable row level security;
alter table public.liquidaciones force row level security;

create index liquidaciones_tenant_idx on public.liquidaciones (tenant_id);

comment on table public.liquidaciones is
  'Resultado inmutable de liquidar un periodo (20 §69 RESULT IMMUTABILITY). '
  'Corregir = nueva liquidación tras reabrir el periodo, nunca UPDATE.';

create table public.liquidacion_lineas (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  liquidacion_id    uuid not null references public.liquidaciones (id) on delete cascade,
  inmueble_id       uuid not null references public.inmuebles (id),
  concepto_id       uuid not null references public.conceptos (id),
  monto             numeric(18, 2) not null,
  created_at        timestamptz not null default now()
);

alter table public.liquidacion_lineas enable row level security;
alter table public.liquidacion_lineas force row level security;

create index liquidacion_lineas_tenant_idx on public.liquidacion_lineas (tenant_id);
create index liquidacion_lineas_liquidacion_idx on public.liquidacion_lineas (liquidacion_id);
create index liquidacion_lineas_inmueble_idx on public.liquidacion_lineas (inmueble_id);

comment on table public.liquidacion_lineas is
  'Append-only (PLAN §4.3, Fase I §6.3 SEC-14) — mismo patrón que audit_log.';

create trigger liquidacion_lineas_append_only
  before update or delete on public.liquidacion_lineas
  for each row execute function public.forbid_mutation();

-- Ahora que existe la tabla, cierra la FK diferida que dejó F2 (D-13).
alter table public.fondo_movimientos
  add constraint fondo_movimientos_liquidacion_id_fkey
  foreign key (liquidacion_id) references public.liquidaciones (id);

-- ── RLS: lectura por membresía; escritura solo por service_role ────────
-- Sin política de INSERT para `authenticated`: liquidar es una operación
-- privilegiada que corresponde a una Edge Function (AD-05, F6), no una
-- escritura directa del cliente. v0 la ejecuta con el cliente admin.
create policy liquidaciones_select_agent_auditor
  on public.liquidaciones for select
  to authenticated
  using (public.has_role(tenant_id, array['agent', 'auditor']::public.tenant_role_t[]));

create policy liquidacion_lineas_select_agent_auditor
  on public.liquidacion_lineas for select
  to authenticated
  using (public.has_role(tenant_id, array['agent', 'auditor']::public.tenant_role_t[]));
