-- ═══════════════════════════════════════════════════════════════════════
--  CAR F3 · Snapshot histórico de posición de cartera
--  Propietario: Docs/Motor de gestion de cartera/CAR_00_Guia_Oficial.md §6.3
--
--  fn_posicion_cartera (F1) recalcula la posición viva; esta tabla congela
--  una foto fechada, para BI/roll-rate y para poder reconstruir "qué se
--  sabía" en cualquier fecha pasada (I-C15, PH-C27) sin depender de que el
--  estado actual de cargos/pagos siga siendo el mismo que en su momento.
--
--  Append-only (mismo patrón que cargos/pagos/certificaciones) — un
--  snapshot mal calculado no se corrige con UPDATE, se recalcula y se
--  registra aparte con su propio motivo (CAR §18.3 GAP-CAR-003).
-- ═══════════════════════════════════════════════════════════════════════

create table public.posiciones_cartera_snapshot (
  id                             uuid primary key default gen_random_uuid(),
  tenant_id                      uuid not null references public.tenants (id) on delete cascade,
  inmueble_id                    uuid not null references public.inmuebles (id),
  fecha_corte                    date not null,

  deuda_total                    numeric(18, 2) not null,
  deuda_capital                  numeric(18, 2) not null,
  deuda_interes                  numeric(18, 2) not null,
  deuda_otros                    numeric(18, 2) not null,
  saldo_credito                  numeric(18, 2) not null default 0,

  dias_mora_maximo               int not null,
  cantidad_cargos_vencidos       int not null default 0,
  fecha_vencimiento_mas_antigua  date,
  cargo_vencido_mas_antiguo_id   uuid,

  -- REC-CAR-011/REC-CAR-012: la clasificación se congela con la política
  -- que la produjo — un cambio de política posterior nunca reescribe esto.
  clasificacion_codigo           text not null,
  nivel_riesgo                   public.nivel_riesgo_t not null,
  etapa_cobranza                 public.etapa_cobranza_t not null,
  politica_clasificacion_id      uuid not null references public.politicas_clasificacion_cartera (id),
  politica_version               int not null,

  -- I-C15: hash determinista de los campos de arriba — recalcular con los
  -- mismos datos y la misma política debe reproducir el mismo hash.
  posicion_hash                  text not null,

  created_at                     timestamptz not null default now(),

  constraint posiciones_cartera_snapshot_unico
    unique (tenant_id, inmueble_id, fecha_corte)
);

alter table public.posiciones_cartera_snapshot enable row level security;
alter table public.posiciones_cartera_snapshot force row level security;

create index posiciones_cartera_snapshot_tenant_idx
  on public.posiciones_cartera_snapshot (tenant_id);
create index posiciones_cartera_snapshot_inmueble_fecha_idx
  on public.posiciones_cartera_snapshot (tenant_id, inmueble_id, fecha_corte desc);

comment on table public.posiciones_cartera_snapshot is
  'Foto fechada de la posición de cartera de un inmueble — congela deuda, crédito y '
  'clasificación con la política que las produjo (CAR §6.3). Append-only: corregir un '
  'cálculo erróneo es un registro nuevo con su propio motivo, nunca un UPDATE. '
  'posicion_hash permite verificar reproducibilidad (I-C15, PH-C27).';

create trigger posiciones_cartera_snapshot_append_only
  before update or delete on public.posiciones_cartera_snapshot
  for each row execute function public.forbid_mutation();

-- Igual que cargos/pagos/liquidaciones: esto lo escribe un job/Edge Function
-- privilegiada (service_role), nunca un INSERT directo de un agent — un
-- snapshot con un hash inventado a mano no significa nada.
create policy posiciones_cartera_snapshot_select_agent_auditor
  on public.posiciones_cartera_snapshot for select
  to authenticated
  using (public.has_role(tenant_id, array['agent', 'auditor']::public.tenant_role_t[]));
