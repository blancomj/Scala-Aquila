-- ═══════════════════════════════════════════════════════════════════════
--  CO-3 · Materialización — refactor mínimo de contable_movimientos()
--  (Casos de uso/Tres Modulos/Contabilidad/CO_03_materializacion_asientos.md §4.1)
--
--  Cumple el contrato que la propia cabecera de PC-5 (20260830500000) dejó escrito:
--  «Cuando llegue el motor formal, esta misma proyección se materializa en comprobantes sin
--  recalcular nada. Lo que hoy es una función será el cuerpo del INSERT.»
--
--  Se extrae el CTE `hechos` (una fila por hecho económico, con su cuenta_debito, cuenta_credito
--  y monto firmado — ANTES de la expansión a dos líneas) a una función propia,
--  contable_hechos(), que fn_contabilizar_periodo() (siguiente migración) también consume.
--  contable_movimientos() pasa a ser un wrapper de tres líneas sobre esa misma fuente: MISMA
--  firma, MISMA salida — verificado con tests/contabilidad/materializacion.test.ts prueba #11
--  (no regresión, datos fijos, antes y después del refactor).
--
--  No se reescribe ni una sola línea de lógica de negocio: es un corte-y-pega literal del cuerpo
--  vigente en 20260929180000_fondo_imprevistos_circuito_cobro.sql, solo reorganizado en dos
--  funciones. `contable_cuadre()` no se toca — sigue consumiendo contable_movimientos().
-- ═══════════════════════════════════════════════════════════════════════

create function public.contable_hechos(
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
  cuenta_debito   uuid,
  cuenta_credito  uuid,
  monto           numeric,
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
    select
      (array_agg(cd.contable_cuenta_id) filter (where lt.codigo = 'CARTERA_CUOTA_ORDINARIA'))[1] as cartera_ordinaria,
      (array_agg(cd.contable_cuenta_id) filter (where lt.codigo = 'CARTERA_INTERES_MORA'))[1]    as cartera_interes,
      (array_agg(cd.contable_cuenta_id) filter (where lt.codigo = 'CARTERA_OTROS'))[1]           as cartera_otros,
      (array_agg(cd.contable_cuenta_id) filter (where lt.codigo = 'CARTERA_FONDO_IMPREVISTOS'))[1] as cartera_fondo_imprevistos,
      (array_agg(cd.contable_cuenta_id) filter (where lt.codigo = 'INGRESO_INTERES_MORA'))[1]    as ingreso_interes,
      (array_agg(cd.contable_cuenta_id) filter (where lt.codigo = 'INGRESO_FONDO_IMPREVISTOS'))[1] as ingreso_fondo_imprevistos,
      (array_agg(cd.contable_cuenta_id) filter (where lt.codigo = 'BANCO_RECAUDO'))[1]           as banco_recaudo,
      (array_agg(cd.contable_cuenta_id) filter (where lt.codigo = 'CAJA_GENERAL'))[1]            as caja,
      (array_agg(cd.contable_cuenta_id) filter (where lt.codigo = 'PROVEEDOR_SERVICIOS'))[1]     as proveedores,
      (array_agg(cd.contable_cuenta_id) filter (where lt.codigo = 'ANTICIPO_COPROPIETARIO'))[1]  as anticipos,
      (array_agg(cd.contable_cuenta_id) filter (where lt.codigo = 'RENDIMIENTO_FINANCIERO_FONDO'))[1] as rendimiento_fondo
    from public.contable_cuenta_default cd
    join public.lista_tipos lt on lt.id = cd.evento_id
    where cd.tenant_id = p_tenant_id
  ),
  -- BLOQUE K: el fondo de imprevistos del tenant, resuelto una sola vez.
  -- Agregado (no un select plano) por la misma razón que `d`: debe devolver
  -- exactamente una fila incluso si todavía no existiera ninguna, para que el
  -- cross join de más abajo nunca vacíe el resultado completo.
  fi as (
    select (array_agg(id))[1] as fondo_imprevistos_id
    from public.fondos
    where tenant_id = p_tenant_id and naturaleza = 'imprevistos'
  ),
  hechos as (
    select
      make_date(pe.anio, pe.mes, 1)                            as fecha,
      'cartera'::text                                          as origen,
      'cargos'::text                                           as entidad,
      c.id                                                     as origen_id,
      coalesce(co.codigo, c.categoria::text)                   as documento,
      coalesce(co.nombre, 'Cargo de ' || c.categoria::text)    as descripcion,
      case
        when co.codigo = 'FONDO_IMPREVISTOS' then d.cartera_fondo_imprevistos
        when c.categoria = 'capital' then d.cartera_ordinaria
        when c.categoria = 'interes' then d.cartera_interes
        else d.cartera_otros
      end                                                      as cuenta_debito,
      coalesce(
        case when co.codigo = 'FONDO_IMPREVISTOS' then d.ingreso_fondo_imprevistos end,
        pcc.contable_cuenta_id,
        pcn.contable_cuenta_id,
        case when c.categoria = 'interes' then d.ingreso_interes end
      )                                                        as cuenta_credito,
      c.monto_original                                         as monto,
      null::uuid                                               as tercero_id,
      c.inmueble_id,
      null::bigint                                             as centro_costo_id,
      null::uuid                                               as agrupacion_id,
      case when co.codigo = 'FONDO_IMPREVISTOS' then fi.fondo_imprevistos_id end as fondo_id
    from public.cargos c
    cross join d
    cross join fi
    join public.periodos pe on pe.id = c.periodo_id
    left join public.conceptos co on co.id = c.concepto_id
    left join public.presupuesto_cuenta pcc on pcc.id = co.presupuesto_cuenta_id
    left join public.novedades n on n.id = c.novedad_id
    left join public.presupuesto_cuenta pcn on pcn.id = n.presupuesto_cuenta_id
    where c.tenant_id = p_tenant_id

    union all

    select
      pg.fecha_pago,
      'cartera'::text,
      'pago_aplicaciones'::text,
      pa.id,
      coalesce(pg.referencia, 'Recaudo'),
      'Recaudo aplicado a ' || cg.categoria::text,
      coalesce(
        case when fp.codigo = 'efectivo' then d.caja else cb.contable_cuenta_id end,
        d.banco_recaudo
      ),
      case
        when cco.codigo = 'FONDO_IMPREVISTOS' then d.cartera_fondo_imprevistos
        when cg.categoria = 'capital' then d.cartera_ordinaria
        when cg.categoria = 'interes' then d.cartera_interes
        else d.cartera_otros
      end,
      pa.monto,
      null::uuid,
      pg.inmueble_id,
      null::bigint,
      null::uuid,
      case when cco.codigo = 'FONDO_IMPREVISTOS' then fi.fondo_imprevistos_id end
    from public.pago_aplicaciones pa
    cross join d
    cross join fi
    join public.pagos pg on pg.id = pa.pago_id
    join public.cargos cg on cg.id = pa.cargo_id
    left join public.conceptos cco on cco.id = cg.concepto_id
    left join public.lista_tipos fp on fp.id = pg.forma_pago_id
    left join public.cuentas_bancarias cb on cb.id = pg.cuenta_bancaria_id
    where pa.tenant_id = p_tenant_id

    union all

    select
      pg.fecha_pago,
      'cartera'::text,
      'pagos'::text,
      pg.id,
      coalesce(pg.referencia, 'Anticipo'),
      case when pg.monto - coalesce(apl.aplicado, 0) < 0
        then 'Cancelación de anticipo' else 'Anticipo recibido sin imputar' end,
      coalesce(
        case when fp.codigo = 'efectivo' then d.caja else cb.contable_cuenta_id end,
        d.banco_recaudo
      ),
      d.anticipos,
      pg.monto - coalesce(apl.aplicado, 0),
      null::uuid,
      pg.inmueble_id,
      null::bigint,
      null::uuid,
      null::uuid
    from public.pagos pg
    cross join d
    left join public.lista_tipos fp on fp.id = pg.forma_pago_id
    left join public.cuentas_bancarias cb on cb.id = pg.cuenta_bancaria_id
    left join lateral (
      select sum(pa.monto) as aplicado
      from public.pago_aplicaciones pa where pa.pago_id = pg.id
    ) apl on true
    where pg.tenant_id = p_tenant_id
      -- RC-2: <> 0, no > 0 — la reversa de un pago con anticipo aporta su
      -- propio remanente negativo, que es la línea que cierra el pasivo.
      and pg.monto - coalesce(apl.aplicado, 0) <> 0

    union all

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

    -- ── D · Fondos: reclasificación de efectivo o ingreso real, según el
    -- tipo (GAP-22, bloque L). El signo de fn_fondo_movimiento_efecto —no
    -- el nombre del tipo— decide qué cuenta se debita y cuál se acredita.
    select
      coalesce(make_date(pf.anio, pf.mes, 1), fm.fecha),
      'fondos'::text,
      'fondo_movimientos'::text,
      fm.id,
      fm.tipo::text,
      coalesce(fm.descripcion, f.nombre),
      case when public.fn_fondo_movimiento_efecto(fm.tipo, fm.monto) >= 0
           then f.contable_cuenta_id
           else coalesce(
             case when coalesce(orig.tipo, fm.tipo) = 'rendimiento'
                  then d.rendimiento_fondo else d.banco_recaudo end,
             d.banco_recaudo
           )
      end,
      case when public.fn_fondo_movimiento_efecto(fm.tipo, fm.monto) >= 0
           then coalesce(
             case when coalesce(orig.tipo, fm.tipo) = 'rendimiento'
                  then d.rendimiento_fondo else d.banco_recaudo end,
             d.banco_recaudo
           )
           else f.contable_cuenta_id
      end,
      abs(public.fn_fondo_movimiento_efecto(fm.tipo, fm.monto)),
      null::uuid,
      null::uuid,
      null::bigint,
      null::uuid,
      f.id
    from public.fondo_movimientos fm
    cross join d
    join public.fondos f on f.id = fm.fondo_id
    left join public.periodos pf on pf.id = fm.periodo_id
    left join public.fondo_movimientos orig on orig.id = fm.reversion_de_id
    where fm.tenant_id = p_tenant_id
  )
  select * from hechos where fecha between p_desde and p_hasta;
$$;

comment on function public.contable_hechos(uuid, date, date) is
  'CO-3: el hecho económico, una fila por hecho, con su cuenta_debito/cuenta_credito/monto '
  'firmado — ANTES de la expansión a dos líneas. Extraído literalmente del CTE `hechos` que '
  '20260830500000/20260929180000 tenían inline dentro de contable_movimientos(), para que '
  'fn_contabilizar_periodo() (materialización) y contable_movimientos() (proyección) consuman '
  'la MISMA fuente — el contrato que la cabecera de PC-5 dejó escrito. No expuesta a la UI '
  'directamente: es infraestructura interna de ambas.';

-- ── contable_movimientos(): mismo nombre, misma firma, misma salida — ahora un wrapper ────────
create or replace function public.contable_movimientos(
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
  select
    h.fecha, h.origen, h.entidad, h.origen_id, h.documento, h.descripcion,
    cc.codigo, cc.nombre,
    l.debito, l.credito,
    h.tercero_id, h.inmueble_id, h.centro_costo_id, h.agrupacion_id, h.fondo_id
  from public.contable_hechos(p_tenant_id, p_desde, p_hasta) h
  cross join lateral (values
    (h.cuenta_debito,  greatest(h.monto, 0),  greatest(-h.monto, 0)),
    (h.cuenta_credito, greatest(-h.monto, 0), greatest(h.monto, 0))
  ) as l(cuenta_id, debito, credito)
  left join public.contable_cuenta cc on cc.id = l.cuenta_id
  order by h.fecha, h.origen_id, l.debito desc;
$$;

comment on function public.contable_movimientos(uuid, date, date) is
  'Proyección contable en partida doble (PC-5) de cartera, recaudo, anticipos (RC-1) y sus '
  'reversas (RC-2), ejecución presupuestal y fondos. No persiste asientos: los deriva. CO-3 la '
  'reescribió como wrapper de contable_hechos() (mismo comportamiento, ninguna lógica movida) '
  'para que la materialización consuma exactamente la misma fuente — ver '
  'tests/contabilidad/materializacion.test.ts prueba de no regresión. El bloque de fondos '
  '(GAP-22) distingue los 8 tipos de movimiento por el signo de fn_fondo_movimiento_efecto: '
  'aporte/rendimiento/traslado_entrada entran, uso/traslado_salida/cierre_remanente salen, y '
  'ajuste/reversion ya llegan firmados. Un rendimiento acredita RENDIMIENTO_FINANCIERO_FONDO '
  '(4605), no el banco — es ingreso real, no una reclasificación de efectivo (CTCP, PC_01 §3.2). '
  'BLOQUE K (D-38): un cargo/recaudo del concepto FONDO_IMPREVISTOS resuelve contra '
  'CARTERA_FONDO_IMPREVISTOS/INGRESO_FONDO_IMPREVISTOS en vez de la resolución genérica.';
