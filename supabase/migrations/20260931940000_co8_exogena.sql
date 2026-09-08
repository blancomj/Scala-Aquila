-- ═══════════════════════════════════════════════════════════════════════
--  CO-8 · Base de información exógena
--  Ver CO_08_tributario.md §4.4.
--
--  NO se implementa el formato XML de la resolución anual (spec §5,
--  vinculante — cambia cada año y su especificación es extensa). Esta
--  función produce los CONJUNTOS DE DATOS en tabla (jsonb, consumible
--  también como Excel desde la UI) que esas resoluciones suelen pedir:
--  pagos a terceros por concepto, retenciones practicadas, ingresos
--  recibidos y saldos de CxC/CxP al cierre. El contador los carga al
--  formato vigente cuando lo tenga.
--
--  Los saldos de CxC/CxP se leen de contable_libro_mayor (CO-4) — MISMA
--  función, no una reimplementación — así "cuadra contra el libro mayor"
--  (spec §6 prueba 8) es una garantía por construcción, no una
--  coincidencia que una prueba deba verificar aparte.
-- ═══════════════════════════════════════════════════════════════════════

create function public.tributario_base_exogena(p_tenant_id uuid, p_anio int)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with rango as (
    select make_date(p_anio, 1, 1) as desde, make_date(p_anio, 12, 31) as hasta
  ),
  pagos as (
    select f.proveedor_id as tercero_id, pc.nombre as concepto, sum(f.total_neto_pagar) as total
    from public.finanzas_facturas_proveedor f
    join public.presupuesto_cuenta pc on pc.id = f.presupuesto_cuenta_id
    cross join rango r
    where f.tenant_id = p_tenant_id and f.estado = 'pagada'
      and f.fecha_emision between r.desde and r.hasta
    group by f.proveedor_id, pc.nombre
  ),
  retenciones as (
    select f.proveedor_id as tercero_id, tcr.codigo as concepto,
      sum(ffr.base) as total_base, sum(ffr.valor) as total_valor
    from public.finanzas_factura_retencion ffr
    join public.finanzas_facturas_proveedor f on f.id = ffr.factura_id
    join public.tributario_concepto_retencion tcr on tcr.id = ffr.concepto_id
    cross join rango r
    where ffr.tenant_id = p_tenant_id and f.fecha_emision between r.desde and r.hasta
    group by f.proveedor_id, tcr.codigo
  ),
  ingresos as (
    select cc.codigo as cuenta, cc.nombre,
      sum(lm.movimiento_credito - lm.movimiento_debito) as total
    from rango r
    cross join lateral public.contable_libro_mayor(p_tenant_id, r.desde, r.hasta) lm
    join public.contable_cuenta cc on cc.id = lm.cuenta_id
    where cc.clase = 4
    group by cc.codigo, cc.nombre
  ),
  saldos_cierre as (
    -- CxC (13xx) y CxP (23xx) — leídos tal cual de contable_libro_mayor, sin recalcular nada.
    select cc.codigo as cuenta, cc.nombre, lm.saldo_final
    from rango r
    cross join lateral public.contable_libro_mayor(p_tenant_id, r.desde, r.hasta) lm
    join public.contable_cuenta cc on cc.id = lm.cuenta_id
    where left(cc.codigo, 2) in ('13', '23')
  )
  select jsonb_build_object(
    'pagos_a_terceros',        coalesce((select jsonb_agg(to_jsonb(pagos))         from pagos),        '[]'::jsonb),
    'retenciones_practicadas', coalesce((select jsonb_agg(to_jsonb(retenciones))   from retenciones),  '[]'::jsonb),
    'ingresos_recibidos',      coalesce((select jsonb_agg(to_jsonb(ingresos))      from ingresos),     '[]'::jsonb),
    'saldos_cierre_cxc_cxp',   coalesce((select jsonb_agg(to_jsonb(saldos_cierre)) from saldos_cierre),'[]'::jsonb)
  );
$$;

comment on function public.tributario_base_exogena(uuid, int) is
  'CO-8 §4.4: base de información exógena de un ejercicio — pagos a terceros por concepto, '
  'retenciones practicadas, ingresos recibidos (clase 4) y saldos de CxC/CxP al cierre (leídos '
  'de contable_libro_mayor, CO-4 — cuadran por construcción, spec §6 prueba 8). NO produce el '
  'formato XML de la resolución DIAN vigente (spec §5, vinculante): el contador carga estos '
  'datos al formato correspondiente.';
