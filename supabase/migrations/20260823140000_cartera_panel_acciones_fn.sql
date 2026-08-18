-- ═══════════════════════════════════════════════════════════════════════
--  CAR F9 (parte 5) · Panel de acciones (§23.5) — última pieza de F9
--  Propietario: Docs/Motor de gestion de cartera/CAR_00_Guia_Oficial.md §23.5
--
--  Decisión de alcance del usuario (2026-08-17): el panel devuelve SOLO
--  conteos (badges de dashboard), no las filas de cada cola — el detalle
--  de cada item lo consulta el frontend directamente contra la tabla
--  correspondiente (RLS ya lo permite vía las policies *_select_miembro
--  existentes). No hay división/ratio aquí (a diferencia de fn_indicadores_
--  gestion/fn_indicadores_legales) — los 8 conteos SON la respuesta final,
--  no hace falta un paso de cálculo puro en TS (REC-CAR-004: no se
--  inventa una abstracción sin lógica que envolver).
--
--  p_fecha_referencia es explícito (no now()/current_date embebido en la
--  función) — mismo criterio de reproducibilidad/testabilidad que
--  fecha_desde/fecha_hasta en fn_indicadores_gestion/fn_indicadores_
--  legales: el llamador decide qué es "hoy", la función nunca depende
--  del reloj del servidor.
--
--  Interpretaciones adoptadas — la guía (§23.5) nombra las 8 colas pero
--  no precisa el filtro exacto:
--
--  · "Acciones pendientes de aprobación" = acciones_cobranza.estado =
--    'pendiente_aprobacion' — lectura directa del nombre de la cola.
--
--  · "Acciones programadas para hoy" = estado = 'programada' con
--    fecha_programada = p_fecha_referencia.
--
--  · "Acciones fallidas (requieren datos)" = estado = 'fallida' — el
--    estado de la máquina (20260822280000: ejecutando→fallida), no un
--    resultado específico. El paréntesis de la guía describe la causa
--    típica, no un filtro adicional sobre `resultado`.
--
--  · "Llamadas pendientes" (cola del gestor, distinta de la cola del
--    administrador de arriba) = tipo_accion = 'llamada' y estado en
--    ('programada', 'ejecutando') — excluye 'pendiente_aprobacion' [ya
--    contada en su propia cola] y los estados terminales [ejecutada/
--    fallida/rechazada/cancelada].
--
--  · "Promesas que vencen hoy" = promesas_pago.estado = 'pendiente' con
--    fecha_pago_prometida = p_fecha_referencia.
--
--  · "Cuotas de acuerdo que vencen esta semana" = acuerdo_pago_cuotas.
--    estado en ('pendiente', 'parcial') con fecha_vencimiento en
--    [p_fecha_referencia, p_fecha_referencia + 6] (7 días, inclusive en
--    ambos extremos — "esta semana" contada desde la fecha de
--    referencia, no desde el lunes del calendario).
--
--  · "Casos jurídicos sin actuación en 30 días" = casos_juridicos con
--    estado fuera de ('terminado', 'desistido', 'archivado') [solo
--    casos activos importan aquí] y coalesce(fecha_ultima_actuacion,
--    fecha_remision) a 30 días o más de p_fecha_referencia [un caso sin
--    ninguna actuación registrada usa fecha_remision como última señal
--    de vida, no se excluye por falta de dato].
--
--  · "Certificaciones por vencer" — GAP real: certificaciones_deuda no
--    tiene ninguna columna de vigencia/vencimiento, y la guía no
--    documenta cuántos días dura válida una certificación del art. 48.
--    Decisión explícita del usuario (2026-08-17): certificaciones
--    estado = 'vigente' cuya fecha_corte tiene 30 días o más de
--    antigüedad respecto a p_fecha_referencia — el desglose certificado
--    ya no refleja el saldo actual del inmueble aunque el registro siga
--    "vigente" en el sentido de "no anulada". Umbral de 30 días es una
--    decisión de negocio, no viene de la guía ni de norma alguna.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_panel_acciones_cartera(
  p_tenant_id        uuid,
  p_fecha_referencia date
)
returns table (
  acciones_pendientes_aprobacion    int,
  acciones_programadas_hoy          int,
  acciones_fallidas                 int,
  llamadas_pendientes               int,
  promesas_vencen_hoy               int,
  cuotas_acuerdo_vencen_semana      int,
  casos_juridicos_sin_actuacion_30d int,
  certificaciones_por_vencer        int
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (select count(*)::int
     from public.acciones_cobranza
     where tenant_id = p_tenant_id
       and estado = 'pendiente_aprobacion'
    ) as acciones_pendientes_aprobacion,
    (select count(*)::int
     from public.acciones_cobranza
     where tenant_id = p_tenant_id
       and estado = 'programada'
       and fecha_programada = p_fecha_referencia
    ) as acciones_programadas_hoy,
    (select count(*)::int
     from public.acciones_cobranza
     where tenant_id = p_tenant_id
       and estado = 'fallida'
    ) as acciones_fallidas,
    (select count(*)::int
     from public.acciones_cobranza
     where tenant_id = p_tenant_id
       and tipo_accion = 'llamada'
       and estado in ('programada', 'ejecutando')
    ) as llamadas_pendientes,
    (select count(*)::int
     from public.promesas_pago
     where tenant_id = p_tenant_id
       and estado = 'pendiente'
       and fecha_pago_prometida = p_fecha_referencia
    ) as promesas_vencen_hoy,
    (select count(*)::int
     from public.acuerdo_pago_cuotas
     where tenant_id = p_tenant_id
       and estado in ('pendiente', 'parcial')
       and fecha_vencimiento between p_fecha_referencia and p_fecha_referencia + 6
    ) as cuotas_acuerdo_vencen_semana,
    (select count(*)::int
     from public.casos_juridicos
     where tenant_id = p_tenant_id
       and estado not in ('terminado', 'desistido', 'archivado')
       and coalesce(fecha_ultima_actuacion, fecha_remision) <= p_fecha_referencia - 30
    ) as casos_juridicos_sin_actuacion_30d,
    (select count(*)::int
     from public.certificaciones_deuda
     where tenant_id = p_tenant_id
       and estado = 'vigente'
       and fecha_corte <= p_fecha_referencia - 30
    ) as certificaciones_por_vencer;
$$;

comment on function public.fn_panel_acciones_cartera is
  'CAR §23.5 — conteos de las 8 colas de trabajo del panel de acciones. Solo conteos (badges de '
  'dashboard, decisión del usuario 2026-08-17) — el detalle de cada cola lo consulta el '
  'frontend directamente contra la tabla correspondiente, RLS ya lo permite. Interpretaciones '
  'de cada cola documentadas en la cabecera de esta migración. security invoker: respeta RLS '
  'del usuario que llama, mismo criterio que fn_indicadores_gestion/fn_indicadores_legales.';

revoke all on function public.fn_panel_acciones_cartera(uuid, date) from public, anon;
grant execute on function public.fn_panel_acciones_cartera(uuid, date) to authenticated;
