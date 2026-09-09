-- ═══════════════════════════════════════════════════════════════════════
--  MANT-6 · Inventario de repuestos y costos (4/6)
--  Casos de uso/Tres Modulos/Mantenimiento/MANT_06_inventario_costos.md §4.4
--
--  mant_costos() — cubre el §30 del prompt original (costo por activo,
--  categoría, ubicación, proveedor y tipo de mantenimiento) SIN un módulo
--  de costos nuevo: lee exclusivamente presupuesto_ejecucion, que ya tenía
--  tres de esas cinco dimensiones como columnas (activo_id, agrupacion_id,
--  tercero_id) y ahora tiene las dos que faltaban (categoría vía join a
--  activos.categoria_id, tipo de mantenimiento vía join a
--  mant_ordenes_trabajo.tipo_mantenimiento_id a través de orden_trabajo_id,
--  20260932120000).
--
--  Regla dura del marco/prompt: "ninguna cifra de costo se calcula fuera de
--  presupuesto_ejecucion". Los joins de esta función son solo para traer
--  las ETIQUETAS de agrupación (categoría, tipo de mantenimiento) — el
--  monto siempre sale de presupuesto_ejecucion.monto, nunca de otra tabla.
-- ═══════════════════════════════════════════════════════════════════════

create function public.mant_costos(p_tenant_id uuid, p_desde date, p_hasta date)
returns table (
  activo_id           uuid,
  categoria_activo_id bigint,
  agrupacion_id       uuid,
  tercero_id          uuid,
  tipo_mantenimiento_id bigint,
  monto               numeric
)
language sql
stable
set search_path = ''
as $$
  select
    pe.activo_id,
    a.categoria_id as categoria_activo_id,
    pe.agrupacion_id,
    pe.tercero_id,
    ot.tipo_mantenimiento_id,
    sum(pe.monto) as monto
  from public.presupuesto_ejecucion pe
  left join public.activos a on a.id = pe.activo_id
  left join public.mant_ordenes_trabajo ot on ot.id = pe.orden_trabajo_id
  where pe.tenant_id = p_tenant_id
    and pe.fecha_documento between p_desde and p_hasta
  group by pe.activo_id, a.categoria_id, pe.agrupacion_id, pe.tercero_id, ot.tipo_mantenimiento_id;
$$;

comment on function public.mant_costos(uuid, date, date) is
  'MANT-6 §4.4: costo de mantenimiento agrupable por activo, categoría de activo, ubicación '
  '(agrupacion_id), proveedor (tercero_id) y tipo de mantenimiento — SIEMPRE leyendo '
  'presupuesto_ejecucion.monto (regla dura, prompt §4.4: ninguna cifra de costo se calcula fuera '
  'de ahí). Los joins a activos/mant_ordenes_trabajo son solo para las etiquetas de agrupación, '
  'nunca para el monto. costo_estimado de una OT NUNCA aparece aquí — es una estimación, no un '
  'costo (ver mant_ordenes_trabajo.costo_estimado), se muestra aparte y etiquetado en la UI.';
