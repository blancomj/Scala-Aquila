-- ═══════════════════════════════════════════════════════════════════════
--  FIN-4 · Flujo de caja proyectado y alertas de liquidez (4/8)
--
--  Snapshot append-only (§3.3): "una proyección sin fecha no sirve". No se
--  persiste automáticamente — lo persiste el usuario cuando quiere fijar
--  un punto de referencia (botón "Guardar snapshot" con motivo, §3.8).
--  `parametros` congela QUÉ coeficientes/política de utilizable se usaron;
--  cambiarlos después nunca altera un snapshot ya guardado (mismo
--  principio que mant_salud_snapshot de MANT-9 con version_factores).
-- ═══════════════════════════════════════════════════════════════════════

create table public.finanzas_flujo_snapshot (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  fecha_calculo   timestamptz not null default now(),
  horizonte_dias  integer not null,
  escenario       public.finanzas_flujo_escenario_t not null,
  saldo_inicial   numeric(18, 2) not null,
  parametros      jsonb not null,
  resultado       jsonb not null,
  motivo          text not null,
  generado_por    uuid references public.profiles (id),
  created_at      timestamptz not null default now(),

  constraint finanzas_flujo_snapshot_horizonte_valido check (horizonte_dias > 0)
);

comment on table public.finanzas_flujo_snapshot is
  'FIN-4 §3.3: punto de referencia congelado de una proyección — parametros guarda los '
  'coeficientes de escenario y la política de utilizable usados en ese cálculo; resultado guarda '
  'las filas por semana. Append-only; comparar contra la realidad es finanzas_proyeccion_vs_real().';

alter table public.finanzas_flujo_snapshot enable row level security;
alter table public.finanzas_flujo_snapshot force row level security;

create index finanzas_flujo_snapshot_tenant_idx on public.finanzas_flujo_snapshot (tenant_id);
create index finanzas_flujo_snapshot_tenant_fecha_idx
  on public.finanzas_flujo_snapshot (tenant_id, fecha_calculo desc);

create policy finanzas_flujo_snapshot_select_miembro
  on public.finanzas_flujo_snapshot for select
  to authenticated
  using (public.is_member(tenant_id) and public.puede_ver_modulo(tenant_id, 'financiero'));

-- Sin policy de insert para authenticated a propósito: se escribe solo vía
-- finanzas_flujo_snapshot_guardar() (security definer, migración 610000), que recalcula
-- resultado/parametros del lado del servidor en el momento de guardar — un cliente no puede
-- fabricar un snapshot con cifras que finanzas_flujo_proyectado() no produjo. Mismo criterio que
-- fn_mant_registrar_salud_snapshot (MANT-9).

create trigger finanzas_flujo_snapshot_append_only
  before update or delete on public.finanzas_flujo_snapshot
  for each row execute function public.forbid_mutation();
