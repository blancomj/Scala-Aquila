-- ═══════════════════════════════════════════════════════════════════════
--  PC-5 · contable_movimientos(): la contabilidad que ya existe, leída en
--  partida doble
--
--  Este es el objetivo declarado del bloque completo: poder entregar
--  información contable exportable ANTES de que exista el módulo formal.
--
--  ═══ EL PRINCIPIO: el asiento no se persiste, se DERIVA ═══
--
--  No hay tabla de comprobantes ni de partidas. Esta función proyecta, en
--  solo lectura, las líneas débito/crédito que se desprenden de hechos que
--  AQUILA **ya registra** en otros módulos: cargos, pagos, ejecución
--  presupuestal y movimientos de fondos. Tres consecuencias, y las tres son
--  el motivo del diseño:
--
--    • No se crea una segunda verdad. No existe forma de que "la
--      contabilidad" y "la operación" se desincronicen, porque son la misma
--      fila leída con otro lente.
--    • No se puede contabilizar dos veces. La idempotencia del prompt
--      maestro §17 es automática: no hay INSERT que repetir.
--    • Cuando llegue el motor formal, esta misma proyección se materializa
--      en comprobantes sin recalcular nada. Lo que hoy es una función será
--      el cuerpo del INSERT. No se crea deuda técnica: se crea el contrato.
--
--  ═══ EL CUADRE ES ESTRUCTURAL, NO UNA VALIDACIÓN ═══
--
--  Cada hecho económico se declara una sola vez, en el CTE `hechos`, con su
--  cuenta de débito, su cuenta de crédito y UN importe. La expansión a dos
--  líneas la hace un LATERAL al final. Por construcción, entonces,
--  SUM(debito) = SUM(credito) siempre: no existe la posibilidad de escribir
--  un asiento descuadrado, porque nadie escribe los dos lados por separado.
--  Un monto negativo (reversión) intercambia los lados en vez de generar
--  importes negativos, así que el cuadre sobrevive también a las
--  correcciones.
--
--  ═══ TRAZABILIDAD (prompt §17 y §57) ═══
--
--  Cada línea arrastra origen/entidad/origen_id — el equivalente de
--  source_module / source_entity / source_id. Desde cualquier saldo se
--  puede volver al cargo, al pago o al movimiento que lo produjo.
--
--  ═══ LO QUE NO HACE ═══
--
--  No inventa cuentas. Si algo no está parametrizado, la línea sale con
--  cuenta_codigo NULL en vez de omitirse: omitirla rompería el cuadre y
--  ocultaría el problema. contable_parametrizacion_pendiente() es el
--  reporte que debe quedar vacío antes de exportar.
-- ═══════════════════════════════════════════════════════════════════════

create function public.contable_movimientos(
  p_tenant_id uuid,
  p_desde     date,
  p_hasta     date
)
returns table (
  fecha           date,
  origen          text,
  entidad         text,
  origen_id       uuid,
  documento       text,
  descripcion     text,
  cuenta_codigo   text,
  cuenta_nombre   text,
  debito          numeric,
  credito         numeric,
  tercero_id      uuid,
  inmueble_id     uuid,
  centro_costo_id bigint,
  agrupacion_id   uuid,
  fondo_id        uuid
)
language sql
stable
set search_path = ''
as $$
  with d as (
    -- Las cuentas predeterminadas (PC-3) en una sola fila, para cruzarlas sin repetir subselects.
    -- array_agg(...)[1] y no max(): uuid no tiene operador de orden, así que max(uuid) no existe.
    -- La PK (tenant_id, evento_id) garantiza que cada filtro produce a lo sumo un elemento.
    select
      (array_agg(cd.contable_cuenta_id) filter (where lt.codigo = 'CARTERA_CUOTA_ORDINARIA'))[1] as cartera_ordinaria,
      (array_agg(cd.contable_cuenta_id) filter (where lt.codigo = 'CARTERA_INTERES_MORA'))[1]    as cartera_interes,
      (array_agg(cd.contable_cuenta_id) filter (where lt.codigo = 'CARTERA_OTROS'))[1]           as cartera_otros,
      (array_agg(cd.contable_cuenta_id) filter (where lt.codigo = 'INGRESO_INTERES_MORA'))[1]    as ingreso_interes,
      (array_agg(cd.contable_cuenta_id) filter (where lt.codigo = 'BANCO_RECAUDO'))[1]           as banco_recaudo,
      (array_agg(cd.contable_cuenta_id) filter (where lt.codigo = 'CAJA_GENERAL'))[1]            as caja,
      (array_agg(cd.contable_cuenta_id) filter (where lt.codigo = 'PROVEEDOR_SERVICIOS'))[1]     as proveedores
    from public.contable_cuenta_default cd
    join public.lista_tipos lt on lt.id = cd.evento_id
    where cd.tenant_id = p_tenant_id
  ),
  hechos as (
    -- ── A · Devengo de cartera: se causa la obligación del copropietario ──
    -- D cartera / H el ingreso que corresponda. La cuenta de ingreso sale del concepto
    -- (conceptos.presupuesto_cuenta_id) o de la novedad (novedades.presupuesto_cuenta_id),
    -- que es como PC-3 dejó mapeada la operación; los intereses no tienen concepto y caen
    -- en su cuenta predeterminada.
    select
      make_date(pe.anio, pe.mes, 1)                            as fecha,
      'cartera'::text                                          as origen,
      'cargos'::text                                           as entidad,
      c.id                                                     as origen_id,
      coalesce(co.codigo, c.categoria::text)                   as documento,
      coalesce(co.nombre, 'Cargo de ' || c.categoria::text)    as descripcion,
      case c.categoria
        when 'capital' then d.cartera_ordinaria
        when 'interes' then d.cartera_interes
        else d.cartera_otros
      end                                                      as cuenta_debito,
      coalesce(
        pcc.contable_cuenta_id,
        pcn.contable_cuenta_id,
        case when c.categoria = 'interes' then d.ingreso_interes end
      )                                                        as cuenta_credito,
      c.monto_original                                         as monto,
      null::uuid                                               as tercero_id,
      c.inmueble_id,
      null::bigint                                             as centro_costo_id,
      null::uuid                                               as agrupacion_id,
      null::uuid                                               as fondo_id
    from public.cargos c
    cross join d
    join public.periodos pe on pe.id = c.periodo_id
    left join public.conceptos co on co.id = c.concepto_id
    left join public.presupuesto_cuenta pcc on pcc.id = co.presupuesto_cuenta_id
    left join public.novedades n on n.id = c.novedad_id
    left join public.presupuesto_cuenta pcn on pcn.id = n.presupuesto_cuenta_id
    where c.tenant_id = p_tenant_id

    union all

    -- ── B · Recaudo: entra el dinero y baja la cartera ──
    -- Se proyecta desde pago_aplicaciones y no desde pagos, porque un pago puede repartirse
    -- entre varios cargos de distinta naturaleza (capital, interés, multa) y cada parte acredita
    -- su propia cuenta de cartera. Un anticipo sin aplicar todavía no tiene contrapartida y por
    -- eso no aparece aquí.
    select
      pg.fecha_pago,
      'cartera'::text,
      'pago_aplicaciones'::text,
      pa.id,
      coalesce(pg.referencia, 'Recaudo'),
      'Recaudo aplicado a ' || cg.categoria::text,
      d.banco_recaudo,
      case cg.categoria
        when 'capital' then d.cartera_ordinaria
        when 'interes' then d.cartera_interes
        else d.cartera_otros
      end,
      pa.monto,
      null::uuid,
      pg.inmueble_id,
      null::bigint,
      null::uuid,
      null::uuid
    from public.pago_aplicaciones pa
    cross join d
    join public.pagos pg on pg.id = pa.pago_id
    join public.cargos cg on cg.id = pa.cargo_id
    where pa.tenant_id = p_tenant_id

    union all

    -- ── C · Ejecución presupuestal: el gasto (o el ingreso no operacional) ──
    -- La cuenta principal la da el mapeo de PC-3; la contrapartida, la liquidación de PC-4.
    -- En un egreso el débito es el gasto; en un ingreso los lados se invierten.
    select
      pj.fecha_documento,
      'presupuesto'::text,
      'presupuesto_ejecucion'::text,
      pj.id,
      coalesce(pj.referencia, 'Movimiento'),
      coalesce(pj.descripcion, pc.nombre),
      case when pc.naturaleza = 'egreso' then pc.contable_cuenta_id else contra.cuenta end,
      case when pc.naturaleza = 'egreso' then contra.cuenta else pc.contable_cuenta_id end,
      pj.monto,
      pj.tercero_id,
      null::uuid,
      pj.centro_costo_id,
      pj.agrupacion_id,
      null::uuid
    from public.presupuesto_ejecucion pj
    cross join d
    join public.presupuesto_cuenta pc on pc.id = pj.cuenta_id
    left join public.cuentas_bancarias cb on cb.id = pj.cuenta_bancaria_id
    cross join lateral (
      select case pj.liquidacion
               when 'pagado_banco' then cb.contable_cuenta_id
               when 'pagado_caja'  then d.caja
               when 'por_pagar'    then d.proveedores
             end as cuenta
    ) contra
    where pj.tenant_id = p_tenant_id

    union all

    -- ── D · Fondos: reclasificación de efectivo, nunca gasto ni ingreso ──
    -- El fondo de imprevistos es efectivo restringido (CTCP 0146/2025, ver PC_01 §3.2), así que
    -- dotarlo solo mueve dinero entre dos cuentas de efectivo. El gasto que se atiende CON el
    -- fondo ya viaja por la ejecución presupuestal (bloque C): registrarlo también aquí sería
    -- contarlo dos veces.
    select
      coalesce(make_date(pf.anio, pf.mes, 1), fm.created_at::date),
      'fondos'::text,
      'fondo_movimientos'::text,
      fm.id,
      fm.tipo::text,
      coalesce(fm.descripcion, f.nombre),
      case when fm.tipo = 'aporte' then f.contable_cuenta_id else d.banco_recaudo end,
      case when fm.tipo = 'aporte' then d.banco_recaudo else f.contable_cuenta_id end,
      fm.monto,
      null::uuid,
      null::uuid,
      null::bigint,
      null::uuid,
      f.id
    from public.fondo_movimientos fm
    cross join d
    join public.fondos f on f.id = fm.fondo_id
    left join public.periodos pf on pf.id = fm.periodo_id
    where fm.tenant_id = p_tenant_id
  )
  select
    h.fecha,
    h.origen,
    h.entidad,
    h.origen_id,
    h.documento,
    h.descripcion,
    cc.codigo,
    cc.nombre,
    l.debito,
    l.credito,
    h.tercero_id,
    h.inmueble_id,
    h.centro_costo_id,
    h.agrupacion_id,
    h.fondo_id
  from hechos h
  -- Un hecho, dos líneas. El signo del importe decide de qué lado cae cada una, de modo que una
  -- reversión (monto negativo) invierte débito y crédito en vez de producir importes negativos.
  cross join lateral (values
    (h.cuenta_debito,  greatest(h.monto, 0),  greatest(-h.monto, 0)),
    (h.cuenta_credito, greatest(-h.monto, 0), greatest(h.monto, 0))
  ) as l(cuenta_id, debito, credito)
  left join public.contable_cuenta cc on cc.id = l.cuenta_id
  where h.fecha between p_desde and p_hasta
  order by h.fecha, h.origen_id, l.debito desc;
$$;

comment on function public.contable_movimientos(uuid, date, date) is
  'Proyección contable en partida doble (PC-5) de los hechos que AQUILA ya registra: devengo de '
  'cartera (cargos), recaudo (pago_aplicaciones), ejecución presupuestal y movimientos de '
  'fondos. No persiste asientos: los deriva, de modo que no puede existir desincronización '
  'entre la operación y la contabilidad, ni doble contabilización. El cuadre es estructural — '
  'cada hecho se declara con un solo importe y se expande a dos líneas — así que '
  'SUM(debito) = SUM(credito) por construcción. Una cuenta sin parametrizar sale como NULL en '
  'vez de omitirse; usar contable_parametrizacion_pendiente() antes de exportar.';

-- ── verificación de cuadre, para el reporte y para las pruebas ──────────
create function public.contable_cuadre(p_tenant_id uuid, p_desde date, p_hasta date)
returns table (lineas bigint, total_debito numeric, total_credito numeric,
               diferencia numeric, sin_cuenta bigint)
language sql
stable
set search_path = ''
as $$
  select
    count(*),
    coalesce(sum(m.debito), 0),
    coalesce(sum(m.credito), 0),
    coalesce(sum(m.debito), 0) - coalesce(sum(m.credito), 0),
    count(*) filter (where m.cuenta_codigo is null)
  from public.contable_movimientos(p_tenant_id, p_desde, p_hasta) m;
$$;

comment on function public.contable_cuadre(uuid, date, date) is
  'Resumen de control de contable_movimientos(): número de líneas, totales y diferencia (que '
  'debe ser 0 siempre, por construcción de la proyección) y cuántas líneas quedaron sin cuenta '
  'contable resoluble — esas son las que hay que parametrizar antes de exportar.';
