-- ═══════════════════════════════════════════════════════════════════════
--  BLOQUE K (GAP-22, D-38) — el circuito de cobro del fondo de imprevistos
--
--  Cierra §4.4 y §4.6 de ANALISIS_FONDOS_BLOQUE_A.md: CARTERA_FONDO_IMPREVISTOS
--  (1315) e INGRESO_FONDO_IMPREVISTOS (4115) llevan sembrados desde antes de
--  este módulo sin que nada los consuma, y las dos columnas de
--  politicas_financieras (fondo_imprevistos_porcentaje/_base) son parámetros
--  que nadie lee. Ver D-38 (DECISIONES.md) para el porqué de cada elección de
--  esta migración — aquí solo el qué.
--
--  ═══ LA TUBERÍA, DE UN EXTREMO A OTRO ═══
--
--  1. Un concepto nuevo, FONDO_IMPREVISTOS, en la plantilla global
--     (conceptos_plantilla) — mismo mecanismo que ADMINISTRACION
--     (modo_calculo='distribucion', tipo_recurrencia='recurrente',
--     periodicidad='mensual'). fn_instanciar_conceptos (ya idempotente) lo
--     copia a los tenants existentes sin tocar la función.
--  2. Su fórmula usa PORCENTAJE() — ya provisto por AEL (02 §"PORCENTAJE(total,
--     10) -> MONEY", cubierto por functions.test.ts) — sobre CONCEPTO.ADMINISTRACION
--     o PARAMETER.PRESUPUESTO_ANUAL según fondo_imprevistos_base. No hace falta
--     ninguna capacidad nueva de AEL.
--  3. Cargo → estado de cuenta → recaudo: cero cambios — cartera e imputación
--     de pagos no distinguen conceptos.
--  4. Recaudo → aporte: trigger nuevo sobre pago_aplicaciones, mismo patrón que
--     trg_descuento_pronto_pago (20260830650000) — AFTER INSERT, REFERENCING
--     NEW TABLE, SECURITY DEFINER, delegando en una función que hace el
--     trabajo real. fondo_movimientos.pago_id ya existía desde el bloque E,
--     sin usar hasta ahora.
--  5. Contabilidad: el bloque de cargos y el de pago_aplicaciones de
--     contable_movimientos() distinguen concepto.codigo='FONDO_IMPREVISTOS'
--     para resolver contra CARTERA_FONDO_IMPREVISTOS/INGRESO_FONDO_IMPREVISTOS
--     en vez de la resolución genérica, y pueblan fondo_id en esas líneas
--     (antes null ahí) — las dos cuentas ya exigen requiere_fondo desde
--     BLOQUE L, así que sin esto contable_dimensiones_faltantes() las
--     reportaría como incompletas. El aporte añade una tercera línea (bloque
--     D, ya existente desde el bloque E/L): el efectivo pasa del banco general
--     a FONDO_IMPREVISTOS_EFECTIVO (111015). Tres líneas por cuota cobrada son
--     intencionales, no una duplicación: cargo (nace la CxC), recaudo (se
--     libera la CxC), aporte (el efectivo se segrega al fondo).
--
--  ═══ LÍMITE EXPLÍCITO ═══
--
--  Anular un pago no reversa el aporte automáticamente — mismo criterio que
--  RC-2 (20260903130000) ya adoptó para el descuento por pronto pago, y por
--  la misma razón: sin un aplicacion_id en fondo_movimientos, emparejar el
--  espejo negativo de la anulación con el aporte correcto sería una
--  heurística frágil (por monto, ambiguo si un mismo pago tocó dos cuotas del
--  fondo). fn_aplicar_aporte_fondo filtra monto <= 0 y no procesa el espejo:
--  así tampoco rompe la propia anulación con una excepción de
--  fondo_movimientos_monto_signo (un aporte exige monto > 0, el espejo llega
--  en <> 0). Anular un pago que cubrió una cuota del fondo exige hoy un
--  movimiento manual de reversión — mismo criterio operativo que cualquier
--  otra corrección de fondo_movimientos.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Concepto FONDO_IMPREVISTOS en la plantilla global ────────────────
insert into public.conceptos_plantilla
  (codigo, nombre, modo_calculo, formula_ael, prioridad, modo_valor, valor_fijo, tipo_recurrencia, periodicidad, presupuesto_cuenta_codigo)
values
  (
    'FONDO_IMPREVISTOS', 'Cuota fondo de imprevistos', 'distribucion',
    'REGLA FONDO_IMPREVISTOS' || chr(10) ||
    'DEFINIR porcentaje = PARAMETER.FONDO_IMPREVISTOS_PORCENTAJE' || chr(10) ||
    'SI PARAMETER.FONDO_IMPREVISTOS_BASE_CUOTA_ADMIN ENTONCES' || chr(10) ||
    '  RETORNAR PORCENTAJE(CONCEPTO.ADMINISTRACION, porcentaje)' || chr(10) ||
    'SINO' || chr(10) ||
    '  RETORNAR PORCENTAJE(PARAMETER.PRESUPUESTO_ANUAL, porcentaje)' || chr(10) ||
    'FIN',
    95, 'formulado', null, 'recurrente', 'mensual', null
  );

comment on table public.conceptos_plantilla is
  'Catálogo global de conceptos facturables (sin tenant_id) que fn_instanciar_conceptos copia a '
  'cada tenant — mismo patrón que presupuesto_cuenta_plantilla/contable_plan_cuenta. 4 filas: '
  'ADMINISTRACION, CUOTA_EXTRA, NOVEDAD (20260901180000) y FONDO_IMPREVISTOS (BLOQUE K, GAP-22, '
  'D-38) — activa fondo_imprevistos_porcentaje/_base de politicas_financieras, sin cuenta '
  'presupuestal propia porque su contrapartida contable la resuelve contable_movimientos() '
  'contra CARTERA_FONDO_IMPREVISTOS/INGRESO_FONDO_IMPREVISTOS, no el árbol presupuestal.';

-- Backfill idempotente: fn_instanciar_conceptos ya usa ON CONFLICT (tenant_id, codigo)
-- DO NOTHING, así que re-correrla para tenants existentes solo agrega la fila nueva.
do $$
declare
  v_tenant record;
begin
  for v_tenant in select distinct tenant_id as id from public.contable_cuenta loop
    perform public.fn_instanciar_conceptos(v_tenant.id);
  end loop;
end;
$$;

-- ── 2. Recaudo → aporte al fondo ─────────────────────────────────────────
create function public.fn_aplicar_aporte_fondo(p_pago_aplicacion_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pa     public.pago_aplicaciones%rowtype;
  v_cargo  public.cargos%rowtype;
  v_codigo text;
  v_pago   public.pagos%rowtype;
  v_fondo  public.fondos%rowtype;
begin
  select * into v_pa from public.pago_aplicaciones where id = p_pago_aplicacion_id;
  if v_pa.id is null or v_pa.monto <= 0 then
    -- monto <= 0: espejo negativo de una anulación (RC-2) — no se procesa, ver
    -- cabecera de esta migración ("Límite explícito").
    return 0;
  end if;

  select * into v_cargo from public.cargos where id = v_pa.cargo_id;

  select co.codigo into v_codigo
    from public.conceptos co where co.id = v_cargo.concepto_id;

  if v_codigo is distinct from 'FONDO_IMPREVISTOS' then
    return 0;
  end if;

  select * into v_pago from public.pagos where id = v_pa.pago_id;

  select * into v_fondo from public.fondos
   where tenant_id = v_pa.tenant_id and naturaleza = 'imprevistos';

  if v_fondo.id is null then
    raise exception 'FONDO_NO_ENCONTRADO: el tenant % no tiene fondo de imprevistos', v_pa.tenant_id;
  end if;

  insert into public.fondo_movimientos (
    tenant_id, fondo_id, tipo, monto, fecha, periodo_id, pago_id, descripcion
  ) values (
    v_pa.tenant_id, v_fondo.id, 'aporte', v_pa.monto, v_pago.fecha_pago, v_cargo.periodo_id,
    v_pa.pago_id, 'Aporte fondo de imprevistos — recaudo de cuota'
  );

  return 1;
end;
$$;

comment on function public.fn_aplicar_aporte_fondo(uuid) is
  'BLOQUE K (GAP-22, D-38): cuando una aplicación de pago cubre un cargo del concepto '
  'FONDO_IMPREVISTOS, registra el aporte correspondiente al fondo de imprevistos del tenant. No '
  'procesa montos <= 0 (espejo negativo de una anulación, RC-2) — ver D-38 para el porqué.';

create function public.trg_aporte_fondo_imprevistos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  for v_id in select id from nuevas loop
    perform public.fn_aplicar_aporte_fondo(v_id);
  end loop;
  return null;
end;
$$;

create trigger trg_aporte_fondo_imprevistos
  after insert on public.pago_aplicaciones
  referencing new table as nuevas
  for each statement execute function public.trg_aporte_fondo_imprevistos();

comment on function public.trg_aporte_fondo_imprevistos() is
  'Dispara el aporte al fondo de imprevistos al imputar un pago contra un cargo de '
  'FONDO_IMPREVISTOS (BLOQUE K, GAP-22). Mismo patrón que trg_descuento_pronto_pago '
  '(20260830650000): de sentencia, cubre cualquier camino que impute un pago, corre en la misma '
  'transacción.';

-- ── 3. Contabilidad: contable_movimientos() distingue FONDO_IMPREVISTOS ──
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
    -- el nombre del tipo— decide qué cuenta se debita y cuál se acredita;
    -- así los 8 tipos (incluida una reversión, que hereda la familia de
    -- contrapartida del movimiento que corrige vía `orig`) se resuelven con
    -- una sola fórmula. El "gasto" real de un uso sigue sin capturarse aquí
    -- a propósito (Modelo §27): eso pertenece a CxP/pagos, todavía fuera de
    -- alcance (GAP-22, D-36) — este bloque solo mueve efectivo entre el
    -- fondo y el banco, nunca cuenta un gasto ni un ingreso donde no lo hay.
    -- El aporte que dispara BLOQUE K al cobrar la cuota entra por aquí como
    -- cualquier otro aporte: el recaudo (bloque B de arriba) ya liberó la
    -- CxC contra CARTERA_FONDO_IMPREVISTOS; este bloque solo segrega el
    -- efectivo del banco general hacia FONDO_IMPREVISTOS_EFECTIVO.
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
  select
    h.fecha, h.origen, h.entidad, h.origen_id, h.documento, h.descripcion,
    cc.codigo, cc.nombre,
    l.debito, l.credito,
    h.tercero_id, h.inmueble_id, h.centro_costo_id, h.agrupacion_id, h.fondo_id
  from hechos h
  cross join lateral (values
    (h.cuenta_debito,  greatest(h.monto, 0),  greatest(-h.monto, 0)),
    (h.cuenta_credito, greatest(-h.monto, 0), greatest(h.monto, 0))
  ) as l(cuenta_id, debito, credito)
  left join public.contable_cuenta cc on cc.id = l.cuenta_id
  where h.fecha between p_desde and p_hasta
  order by h.fecha, h.origen_id, l.debito desc;
$$;

comment on function public.contable_movimientos(uuid, date, date) is
  'Proyección contable en partida doble (PC-5) de cartera, recaudo, anticipos (RC-1) y sus '
  'reversas (RC-2), ejecución presupuestal y fondos. No persiste asientos: los deriva. El '
  'bloque de fondos (GAP-22) distingue los 8 tipos de movimiento por el signo de '
  'fn_fondo_movimiento_efecto: aporte/rendimiento/traslado_entrada entran, '
  'uso/traslado_salida/cierre_remanente salen, y ajuste/reversion ya llegan firmados. Un '
  'rendimiento acredita RENDIMIENTO_FINANCIERO_FONDO (4605), no el banco — es ingreso real, no '
  'una reclasificación de efectivo (CTCP, PC_01 §3.2). Una reversión hereda la familia de '
  'contrapartida del movimiento que corrige. BLOQUE K (D-38): un cargo/recaudo del concepto '
  'FONDO_IMPREVISTOS resuelve contra CARTERA_FONDO_IMPREVISTOS/INGRESO_FONDO_IMPREVISTOS en vez '
  'de la resolución genérica por categoría/presupuesto_cuenta, y puebla fondo_id — sin esto, '
  'contable_dimensiones_faltantes() las reportaría incompletas (esas dos cuentas ya exigen '
  'requiere_fondo desde BLOQUE L).';
