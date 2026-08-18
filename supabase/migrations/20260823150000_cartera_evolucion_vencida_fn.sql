-- ═══════════════════════════════════════════════════════════════════════
--  CAR F9 (parte 6, frontend) · Evolución de cartera vencida (dashboard)
--  Propietario: Docs/Motor de gestion de cartera/CAR_00_Guia_Oficial.md §23.1
--
--  Serie mensual de cartera vencida para el gráfico de tendencia del
--  dashboard — no está en la especificación original de §23.1/§23.2/
--  §23.3 (que son "ahora mismo" o "un período explícito"), es una pieza
--  nueva pedida al construir el frontend (2026-08-17).
--
--  Fuente: posiciones_cartera_snapshot (F3/F8, append-only) — NO se
--  recalcula nada, solo se lee el snapshot más reciente DENTRO de cada
--  mes calendario (REC-CAR-004/REC-CAR-011: la clasificación/deuda
--  congelada en el snapshot es la que manda). "deuda_total" del snapshot
--  es la deuda VENCIDA (mismo criterio que FilaSnapshotIndicador en
--  cartera-indicadores.ts — así la define fn_posicion_cartera/F1, que
--  produce el snapshot).
--
--  Un mes sin ningún snapshot (JOB_CARTERA_DIARIA no corrió ese mes)
--  devuelve fecha_snapshot/deuda_vencida = NULL — nunca se informa como
--  0 (0 vencida real es un valor válido y distinto de "no hay dato").
--  El llamador decide cómo dibujar un hueco en la serie.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_evolucion_cartera_vencida(
  p_tenant_id   uuid,
  p_fecha_hasta date,
  p_meses       int default 6
)
returns table (
  mes            date,
  fecha_snapshot date,
  deuda_vencida  numeric(18, 2)
)
language sql
stable
security invoker
set search_path = ''
as $$
  with meses as (
    select
      (date_trunc('month', p_fecha_hasta) - (n || ' months')::interval)::date as mes_inicio
    from generate_series(0, greatest(p_meses, 1) - 1) as n
  ),
  snapshot_por_mes as (
    select
      m.mes_inicio as mes,
      (
        select s.fecha_corte
        from public.posiciones_cartera_snapshot s
        where s.tenant_id = p_tenant_id
          and s.fecha_corte >= m.mes_inicio
          and s.fecha_corte < (m.mes_inicio + interval '1 month')
        order by s.fecha_corte desc
        limit 1
      ) as fecha_snapshot
    from meses m
  )
  select
    sp.mes,
    sp.fecha_snapshot,
    case
      when sp.fecha_snapshot is null then null
      else (
        select coalesce(sum(s.deuda_total), 0)
        from public.posiciones_cartera_snapshot s
        where s.tenant_id = p_tenant_id and s.fecha_corte = sp.fecha_snapshot
      )
    end as deuda_vencida
  from snapshot_por_mes sp
  order by sp.mes;
$$;

comment on function public.fn_evolucion_cartera_vencida is
  'Dashboard de Cartera (frontend) — serie mensual de cartera vencida, un punto por mes tomando '
  'el snapshot más reciente dentro de ese mes calendario (posiciones_cartera_snapshot, F3/F8). '
  'Mes sin snapshot = NULL, nunca 0 inventado. security invoker: respeta RLS del usuario que '
  'llama, mismo criterio que el resto de funciones de F9.';

revoke all on function public.fn_evolucion_cartera_vencida(uuid, date, int) from public, anon;
grant execute on function public.fn_evolucion_cartera_vencida(uuid, date, int) to authenticated;
