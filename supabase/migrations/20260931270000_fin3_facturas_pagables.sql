-- ═══════════════════════════════════════════════════════════════════════
--  FIN-3 · Programación y ejecución de pagos por lote (6/8)
--
--  finanzas_facturas_pagables() — alimenta la pantalla de selección
--  (§3.3). Incluye facturas 'aprobada' (elegibles para un lote nuevo) Y
--  'programada' (ya en un lote activo — se muestran igual para que la UI
--  explique por qué no se pueden volver a seleccionar, `ya_en_lote=true`,
--  en vez de desaparecer sin explicación).
--
--  Sin columna `criticidad_proveedor`: no existe ese concepto en el
--  repositorio. MANT-1 solo modela criticidad de ACTIVOS
--  (mant_criticidad), MANT-5 solo modela evaluación de DESEMPEÑO de
--  proveedor (mant_proveedor_evaluacion, un puntaje por criterio) —
--  ninguna de las dos es "qué tan crítico es este proveedor si no se le
--  paga a tiempo". Confirmado con el usuario en el Plan del corte: se
--  omite la columna en vez de inventar la equivalencia (mismo criterio ya
--  usado en FIN-2 para huecos de CO-8/GOB-1 — declarar lo que falta, no
--  fingirlo).
-- ═══════════════════════════════════════════════════════════════════════

create function public.finanzas_facturas_pagables(
  p_tenant_id uuid, p_hasta date, p_solo_vencidas boolean default false
)
returns table (
  factura_id        uuid,
  proveedor_nombre  text,
  numero_documento  text,
  fecha_emision     date,
  fecha_vencimiento date,
  dias_vencido      integer,
  total_neto_pagar  numeric,
  ya_en_lote        boolean,
  contrato_id       uuid
)
language sql
stable
set search_path = ''
as $$
  select
    f.id,
    t.nombre_completo,
    f.numero_documento,
    f.fecha_emision,
    f.fecha_vencimiento,
    (current_date - f.fecha_vencimiento)::integer,
    f.total_neto_pagar,
    f.estado = 'programada',
    f.contrato_id
  from public.finanzas_facturas_proveedor f
  join public.terceros t on t.id = f.proveedor_id
  where f.tenant_id = p_tenant_id
    and f.estado in ('aprobada', 'programada')
    and f.fecha_vencimiento <= p_hasta
    and (not p_solo_vencidas or f.fecha_vencimiento < current_date)
  order by f.fecha_vencimiento;
$$;

comment on function public.finanzas_facturas_pagables(uuid, date, boolean) is
  'FIN-3 §3.3: selección asistida — ordena por vencimiento, la priorización se sugiere (el orden), '
  'nunca se decide (marco principio #4). p_solo_vencidas=false incluye también las que vencerán '
  'antes de p_hasta aunque todavía no venzan (dias_vencido negativo).';
