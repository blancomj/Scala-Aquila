-- ═══════════════════════════════════════════════════════════════════════
--  FIN-4 · Flujo de caja proyectado y alertas de liquidez (5/8)
--
--  Bitácora de corrida diaria — mismo patrón que cartera_corridas_diarias
--  (idempotencia por (tenant_id, fecha_corte, origen)), pero SIN llamada
--  HTTP a una Edge Function: a diferencia de cartera (que recalcula
--  snapshots vía lógica de aplicación), evaluar reglas de alerta es SQL
--  puro sobre datos que ya existen — mismo criterio, más simple, que
--  cron_mant_salud_snapshot_mensual (MANT-9), que tampoco necesita Vault
--  ni net.http_post. Ver migración 620000 para la función del cron.
-- ═══════════════════════════════════════════════════════════════════════

create table public.finanzas_flujo_corridas_diarias (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  fecha_corte  date not null,
  origen       text not null default 'cron',
  disparado_at timestamptz not null default now(),

  constraint finanzas_flujo_corridas_diarias_unica unique (tenant_id, fecha_corte, origen)
);

comment on table public.finanzas_flujo_corridas_diarias is
  'FIN-4 §3.5: bitácora de la corrida diaria de evaluación de alertas de liquidez. Mismo patrón '
  'que cartera_corridas_diarias — idempotente por (tenant_id, fecha_corte, origen).';

alter table public.finanzas_flujo_corridas_diarias enable row level security;
alter table public.finanzas_flujo_corridas_diarias force row level security;

create index finanzas_flujo_corridas_diarias_tenant_idx
  on public.finanzas_flujo_corridas_diarias (tenant_id);

create policy finanzas_flujo_corridas_diarias_select_miembro
  on public.finanzas_flujo_corridas_diarias for select
  to authenticated
  using (public.is_member(tenant_id) and public.puede_ver_modulo(tenant_id, 'financiero'));

-- Sin policy de insert para authenticated: solo la escribe cron_finanzas_flujo_alertas_diario()
-- (security definer, migración 620000).
