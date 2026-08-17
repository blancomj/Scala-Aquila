-- ═══════════════════════════════════════════════════════════════════════
--  fn_indicadores_gestion — CAR F9 (parte 3), §23.3: Recovery Rate,
--  Collection Effectiveness, Promise Fulfillment Rate, Agreement
--  Fulfillment Rate. Propietario: este bloque.
--
--  Devuelve los CONTEOS/SUMAS crudos de un período [fecha_desde,
--  fecha_hasta] — las 4 razones (numerador/denominador, con manejo de
--  denominador cero) se calculan en TS puro (cartera-indicadores.ts,
--  REC-CAR-004: la división con la política de "denominador cero =
--  indeterminado" no se duplica en SQL).
--
--  Interpretaciones explícitas (el documento no las precisa más allá de
--  la fórmula):
--  · Recovery Rate — "cargos vencidos" = vencidos AL INICIO del período
--    (periodo.fecha_vencimiento < p_fecha_desde), coherente con que el
--    denominador ("cartera vencida al inicio del período") se computa en
--    el llamador sumando posiciones_cartera_snapshot a p_fecha_desde —
--    misma cohorte de cargos en numerador y denominador.
--  · Collection Effectiveness — "acciones ejecutadas" filtra por
--    fecha_ejecucion dentro del período (estado='ejecutada' con
--    resultado en el set favorable de la especificación).
--  · Promise Fulfillment Rate — "promesas vencidas" = promesas resueltas
--    [cumplida O incumplida] cuya fecha_pago_prometida cae en el
--    período — 'pendiente'/'cancelada' no compiten (no han vencido con
--    un desenlace, o nunca lo tendrán).
--  · Agreement Fulfillment Rate — "acuerdos terminados" = acuerdos
--    resueltos [cumplido O incumplido] cuya fecha_fin cae en el período.
--    'cancelado' se excluye a propósito: una cancelación administrativa
--    no dice nada sobre si el acuerdo, corrido hasta el final, se habría
--    cumplido — no mide "calidad del diseño de acuerdos" (interpretación
--    de la columna del propio §23.3). fecha_fin se usa para AMBOS
--    desenlaces por consistencia — 'cumplido' no tiene columna de fecha
--    propia en el esquema (solo 'incumplido' estampa
--    fecha_incumplimiento).
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_indicadores_gestion(
  p_tenant_id   uuid,
  p_fecha_desde date,
  p_fecha_hasta date
)
returns table (
  monto_recuperado_periodo numeric(18, 2),
  acciones_ejecutadas      int,
  acciones_efectivas       int,
  promesas_vencidas        int,
  promesas_cumplidas       int,
  acuerdos_terminados      int,
  acuerdos_cumplidos       int
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (
      select coalesce(sum(pa.monto), 0)
      from public.pago_aplicaciones pa
      join public.pagos pg on pg.id = pa.pago_id
      join public.cargos c on c.id = pa.cargo_id
      join public.periodos per on per.id = c.periodo_id
      where pg.tenant_id = p_tenant_id
        and pg.fecha_pago between p_fecha_desde and p_fecha_hasta
        and per.fecha_vencimiento is not null
        and per.fecha_vencimiento < p_fecha_desde
    ) as monto_recuperado_periodo,
    (
      select count(*)::int
      from public.acciones_cobranza
      where tenant_id = p_tenant_id
        and estado = 'ejecutada'
        and fecha_ejecucion is not null
        and fecha_ejecucion::date between p_fecha_desde and p_fecha_hasta
    ) as acciones_ejecutadas,
    (
      select count(*)::int
      from public.acciones_cobranza
      where tenant_id = p_tenant_id
        and estado = 'ejecutada'
        and fecha_ejecucion is not null
        and fecha_ejecucion::date between p_fecha_desde and p_fecha_hasta
        and resultado in ('pago_recibido', 'promesa_de_pago', 'acuerdo_solicitado')
    ) as acciones_efectivas,
    (
      select count(*)::int
      from public.promesas_pago
      where tenant_id = p_tenant_id
        and estado in ('cumplida', 'incumplida')
        and fecha_pago_prometida between p_fecha_desde and p_fecha_hasta
    ) as promesas_vencidas,
    (
      select count(*)::int
      from public.promesas_pago
      where tenant_id = p_tenant_id
        and estado = 'cumplida'
        and fecha_pago_prometida between p_fecha_desde and p_fecha_hasta
    ) as promesas_cumplidas,
    (
      select count(*)::int
      from public.acuerdos_pago
      where tenant_id = p_tenant_id
        and estado in ('cumplido', 'incumplido')
        and fecha_fin between p_fecha_desde and p_fecha_hasta
    ) as acuerdos_terminados,
    (
      select count(*)::int
      from public.acuerdos_pago
      where tenant_id = p_tenant_id
        and estado = 'cumplido'
        and fecha_fin between p_fecha_desde and p_fecha_hasta
    ) as acuerdos_cumplidos;
$$;

comment on function public.fn_indicadores_gestion(uuid, date, date) is
  'BI (CAR §23.3) — conteos/sumas crudos de un período para Recovery Rate, '
  'Collection Effectiveness, Promise/Agreement Fulfillment Rate. Las razones '
  '(con denominador-cero = indeterminado) se calculan en TS puro '
  '(REC-CAR-004): calcularIndicadoresGestion(), packages/liquidation-engine.';

-- security invoker: respeta el RLS de pago_aplicaciones/pagos/cargos/
-- periodos/acciones_cobranza/promesas_pago/acuerdos_pago del usuario que
-- llama — mismo criterio SEC-03/PH-C34 que fn_dashboard_cartera.
revoke execute on function public.fn_indicadores_gestion(uuid, date, date) from public, anon;
grant execute on function public.fn_indicadores_gestion(uuid, date, date) to authenticated;
