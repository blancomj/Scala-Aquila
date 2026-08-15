-- ═══════════════════════════════════════════════════════════════════════
--  Cuenta corriente — ledger de cargos, pagos y aplicaciones
--  Propietario: PLAN_MAESTRO_IMPLEMENTACION.md §6.3-§6.6, Docs/16 §26-58, Docs/19
--
--  AD-31: separado de liquidaciones/liquidacion_lineas a propósito — un pago
--  que llega meses después nunca puede alterar una liquidación pasada
--  (20 §69 RESULT IMMUTABILITY), porque vive en tablas distintas. El saldo
--  de §6.4 es una consulta derivada sobre este ledger, no un campo
--  persistido en liquidaciones.
-- ═══════════════════════════════════════════════════════════════════════

create type public.cargo_categoria_t as enum ('capital', 'interes', 'otro');
create type public.cargo_origen_t as enum ('liquidacion_linea', 'novedad', 'interes');

-- AD-36: estrategia de imputación configurable por política — qué periodo
-- se sirve primero al aplicar un pago. En ambas, el orden de categoría
-- (imputacion_orden, interés→capital→otro) se mantiene igual.
create type public.politica_imputacion_estrategia_t as enum ('deuda_mas_antigua', 'periodo_actual');

-- ── cargos — todo lo que un inmueble debe, de cualquier origen ─────────
create table public.cargos (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references public.tenants (id) on delete cascade,
  inmueble_id              uuid not null references public.inmuebles (id),
  periodo_id               uuid not null references public.periodos (id),
  categoria                public.cargo_categoria_t not null,
  origen_tipo              public.cargo_origen_t not null,
  liquidacion_linea_id     uuid references public.liquidacion_lineas (id),
  -- FK diferida a E4 (public.novedades todavía no existe) — mismo patrón que
  -- fondo_movimientos.liquidacion_id en 20260814100100/20260814110000.
  novedad_id               uuid,
  cargo_capital_origen_id  uuid references public.cargos (id),
  concepto_id              uuid references public.conceptos (id),
  monto_original           numeric(18, 2) not null check (monto_original <> 0),
  created_at               timestamptz not null default now(),

  -- Exactamente un origen físico según origen_tipo.
  constraint cargos_origen_unico check (
    (origen_tipo = 'liquidacion_linea' and liquidacion_linea_id is not null and novedad_id is null and cargo_capital_origen_id is null)
    or (origen_tipo = 'novedad' and novedad_id is not null and liquidacion_linea_id is null and cargo_capital_origen_id is null)
    or (origen_tipo = 'interes' and cargo_capital_origen_id is not null and liquidacion_linea_id is null and novedad_id is null)
  )
);

alter table public.cargos enable row level security;
alter table public.cargos force row level security;

create index cargos_tenant_idx on public.cargos (tenant_id);
create index cargos_inmueble_idx on public.cargos (inmueble_id);
create index cargos_periodo_idx on public.cargos (periodo_id);
create index cargos_capital_origen_idx on public.cargos (cargo_capital_origen_id)
  where cargo_capital_origen_id is not null;

comment on table public.cargos is
  'Ledger append-only de todo lo que un inmueble debe (capital de liquidación, interés de mora, '
  'ajuste aprobado) — separado de liquidacion_lineas a propósito (AD-31). monto_original nunca '
  'cambia; lo pendiente se deriva en v_cargo_saldo restando pago_aplicaciones.';

create trigger cargos_append_only
  before update or delete on public.cargos
  for each row execute function public.forbid_mutation();

-- ── pagos — lo que efectivamente entró, inmutable ───────────────────────
create table public.pagos (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  inmueble_id    uuid not null references public.inmuebles (id),
  monto          numeric(18, 2) not null check (monto > 0),
  fecha_pago     date not null,
  referencia     text,
  registrado_por uuid references public.profiles (id),
  created_at     timestamptz not null default now()
);

alter table public.pagos enable row level security;
alter table public.pagos force row level security;

create index pagos_tenant_idx on public.pagos (tenant_id);
create index pagos_inmueble_idx on public.pagos (inmueble_id);

comment on table public.pagos is
  'Pago registrado, inmutable (16 §68) — la corrección de un pago mal registrado es un ajuste '
  'nuevo (novedades, E4), nunca un UPDATE.';

create trigger pagos_append_only
  before update or delete on public.pagos
  for each row execute function public.forbid_mutation();

-- ── pago_aplicaciones — a qué cargo(s) se imputó cada pago ──────────────
create table public.pago_aplicaciones (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  pago_id    uuid not null references public.pagos (id),
  cargo_id   uuid not null references public.cargos (id),
  monto      numeric(18, 2) not null check (monto > 0),
  created_at timestamptz not null default now(),

  constraint pago_aplicaciones_unico unique (pago_id, cargo_id)
);

alter table public.pago_aplicaciones enable row level security;
alter table public.pago_aplicaciones force row level security;

create index pago_aplicaciones_tenant_idx on public.pago_aplicaciones (tenant_id);
create index pago_aplicaciones_pago_idx on public.pago_aplicaciones (pago_id);
create index pago_aplicaciones_cargo_idx on public.pago_aplicaciones (cargo_id);

comment on table public.pago_aplicaciones is
  'Resultado de imputarPago() (packages/liquidation-engine) persistido — la cascada de qué '
  'cargo(s) cubrió cada pago, según la estrategia de la política vigente (AD-36).';

create trigger pago_aplicaciones_append_only
  before update or delete on public.pago_aplicaciones
  for each row execute function public.forbid_mutation();

-- ── saldo derivado — cargos es append-only, no hay columna que recalcular ─
create view public.v_cargo_saldo with (security_invoker = true) as
select
  c.*,
  c.monto_original - coalesce(
    (select sum(pa.monto) from public.pago_aplicaciones pa where pa.cargo_id = c.id), 0
  ) as monto_pendiente
from public.cargos c;

comment on view public.v_cargo_saldo is
  'cargos + monto_pendiente derivado — nunca fuente de verdad, se recalcula en cada consulta '
  '(mismo principio que fondos.saldo_actual, adaptado a una tabla append-only).';

-- ── guard: una aplicación nunca puede sobrepasar lo pendiente del cargo
--    ni lo disponible del pago ──────────────────────────────────────────
create function public.guard_pago_aplicacion_no_excede()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pendiente numeric(18, 2);
  v_pago_monto numeric(18, 2);
  v_pago_aplicado numeric(18, 2);
begin
  select monto_pendiente into v_pendiente
    from public.v_cargo_saldo
   where id = new.cargo_id;

  if new.monto > v_pendiente then
    raise exception 'CARGO_SOBREAPLICADO: la aplicación (%) excede el saldo pendiente del cargo % (%)',
      new.monto, new.cargo_id, v_pendiente;
  end if;

  select monto into v_pago_monto from public.pagos where id = new.pago_id;
  select coalesce(sum(monto), 0) into v_pago_aplicado
    from public.pago_aplicaciones where pago_id = new.pago_id;

  if v_pago_aplicado + new.monto > v_pago_monto then
    raise exception 'PAGO_SOBREAPLICADO: las aplicaciones del pago % (%) excederían su monto (%)',
      new.pago_id, v_pago_aplicado + new.monto, v_pago_monto;
  end if;

  return new;
end;
$$;

create trigger guard_pago_aplicacion_no_excede
  before insert on public.pago_aplicaciones
  for each row execute function public.guard_pago_aplicacion_no_excede();

-- ── RLS: lectura por rol; escritura solo por service_role (Edge Function) ─
-- Mismo criterio que liquidaciones: registrar un pago o generar un cargo de
-- interés/novedad son operaciones privilegiadas orquestadas por una Edge
-- Function, no una escritura directa del cliente.
create policy cargos_select_agent_auditor
  on public.cargos for select
  to authenticated
  using (public.has_role(tenant_id, array['agent', 'auditor']::public.tenant_role_t[]));

create policy pagos_select_agent_auditor
  on public.pagos for select
  to authenticated
  using (public.has_role(tenant_id, array['agent', 'auditor']::public.tenant_role_t[]));

create policy pago_aplicaciones_select_agent_auditor
  on public.pago_aplicaciones for select
  to authenticated
  using (public.has_role(tenant_id, array['agent', 'auditor']::public.tenant_role_t[]));
