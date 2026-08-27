-- ═══════════════════════════════════════════════════════════════════════
--  RC-1 · Contabilidad correcta del recaudo: caja vs. bancos, y el anticipo
--  Propietario: plan "Pagos y recibo de caja" (2026-08-27). Extiende PC-5
--  (20260830500000_contable_movimientos_proyeccion.sql) sin tocar su
--  principio: el asiento se sigue DERIVANDO, no se persiste.
--
--  ═══ HUECO 1 · el efectivo se contabilizaba como banco ═══
--
--  contable_movimientos() debitaba SIEMPRE d.banco_recaudo para todo
--  recaudo. El evento CAJA_GENERAL existía y estaba parametrizado en todos
--  los tenants desde PC-3, pero no había dato para elegirlo. RC-0
--  (20260903100000) creó ese dato: pagos.forma_pago_id y
--  pagos.cuenta_bancaria_id. Aquí se usa por primera vez:
--
--    forma de pago 'efectivo'  → CAJA_GENERAL
--    cuenta bancaria conocida  → la cuenta contable de ESA cuenta bancaria
--    ninguna identificada      → BANCO_RECAUDO (el comportamiento previo)
--
--  El tercer caso es el que garantiza que nada cambia para lo ya
--  registrado: el backfill de RC-0 dejó todos los pagos existentes
--  apuntando a la cuenta de recaudo, así que producen exactamente el mismo
--  asiento que producían antes.
--
--  ═══ HUECO 2 · el anticipo no existía en la contabilidad ═══
--
--  La cabecera de PC-5 lo declaraba abiertamente: «Un anticipo sin aplicar
--  todavía no tiene contrapartida y por eso no aparece aquí». Es decir: si
--  un residente paga $500.000 y solo debe $300.000, la contabilidad
--  reconocía $300.000 de recaudo y los otros $200.000 no existían — dinero
--  real en el banco, ausente del balance. No es un redondeo: es un pasivo
--  no reconocido.
--
--  Se cierra proyectando el remanente (pagos.monto − Σ aplicaciones) contra
--  2605 «Anticipos de copropietarios», que ya estaba en la plantilla PUC
--  desde 20260830430000 esperando exactamente este uso.
--
--  ═══ HUECO 3 · el anticipo se quedaba varado ═══
--
--  imputarPago() devuelve `noAplicado`, la UI lo pintaba en ámbar como
--  «crédito a favor» y ahí moría: ningún proceso lo imputaba a los cargos
--  del mes siguiente (verificado por inspección — cero código lo reusaba).
--  fn_aplicar_anticipos() lo resuelve y se dispara sola cuando nacen cargos
--  nuevos, que es justo cuando el crédito debe consumirse.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. evento contable del anticipo ─────────────────────────────────────
insert into public.lista_tipos (tipo, codigo, nombre, descripcion, orden)
select 'EVENTO_CONTABLE', 'ANTICIPO_COPROPIETARIO', 'Anticipos de copropietarios',
       'Crédito por dinero recibido que todavía no cubre ningún cargo — pasivo hasta que se '
       'impute. Se deriva de pagos.monto menos sus aplicaciones (RC-1).',
       200
where not exists (
  select 1 from public.lista_tipos
  where tipo = 'EVENTO_CONTABLE' and codigo = 'ANTICIPO_COPROPIETARIO' and tenant_id is null
);

-- El guard de coherencia de clase (PC-9, 20260830540000) valida por el
-- código del evento y no conoce este nuevo: sin esta línea aceptaría mapear
-- ANTICIPO_COPROPIETARIO contra una cuenta de cualquier clase. Es un pasivo,
-- clase 2 — el mismo rigor que ya se exige a CARTERA_*/INGRESO_*/PROVEEDOR_*.
create or replace function public.guard_contable_cuenta_default()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_familia text;
  v_evento_tenant uuid;
  v_evento_codigo text;
  v_cuenta public.contable_cuenta%rowtype;
  v_clase_esperada smallint;
  v_grupo11_esperado boolean := false;
begin
  select tipo, tenant_id, codigo into v_familia, v_evento_tenant, v_evento_codigo
  from public.lista_tipos where id = new.evento_id;

  if v_familia is distinct from 'EVENTO_CONTABLE' then
    raise exception 'EVENTO_CONTABLE_INVALIDO: evento_id % no pertenece a EVENTO_CONTABLE (es %)',
      new.evento_id, coalesce(v_familia, 'inexistente');
  end if;

  if v_evento_tenant is not null and v_evento_tenant <> new.tenant_id then
    raise exception 'EVENTO_CONTABLE_INVALIDO: el evento % pertenece a otro tenant',
      new.evento_id;
  end if;

  v_cuenta := public.validar_cuenta_contable_destino(new.contable_cuenta_id, new.tenant_id);

  v_clase_esperada := case
    when v_evento_codigo like 'CARTERA_%'                        then 1
    when v_evento_codigo in ('BANCO_RECAUDO', 'CAJA_GENERAL',
                              'FONDO_IMPREVISTOS_EFECTIVO')       then 1
    when v_evento_codigo = 'DETERIORO_CARTERA'                   then 1
    when v_evento_codigo like 'PROVEEDOR_%'                      then 2
    when v_evento_codigo = 'ANTICIPO_COPROPIETARIO'              then 2
    when v_evento_codigo = 'RESULTADO_EJERCICIO'                 then 3
    when v_evento_codigo like 'INGRESO_%'                        then 4
    when v_evento_codigo = 'GASTO_DETERIORO_CARTERA'             then 5
  end;

  if v_evento_codigo in ('BANCO_RECAUDO', 'CAJA_GENERAL', 'FONDO_IMPREVISTOS_EFECTIVO') then
    v_grupo11_esperado := true;
  end if;

  if v_clase_esperada is not null and v_cuenta.clase <> v_clase_esperada then
    raise exception 'CUENTA_CONTABLE_CLASE_INCOMPATIBLE: % (%) es clase % — el evento % espera '
      'una cuenta de clase %', v_cuenta.codigo, v_cuenta.nombre, v_cuenta.clase, v_evento_codigo,
      v_clase_esperada;
  end if;

  if v_grupo11_esperado and left(v_cuenta.codigo, 2) <> '11' then
    raise exception 'CUENTA_CONTABLE_CLASE_INCOMPATIBLE: % (%) no es efectivo (grupo 11) — el '
      'evento % exige una cuenta de caja o bancos', v_cuenta.codigo, v_cuenta.nombre,
      v_evento_codigo;
  end if;

  return new;
end;
$$;

comment on function public.guard_contable_cuenta_default() is
  'Cuentas predeterminadas por evento (PC-3), con coherencia de clase exigida desde PC-9 y '
  'ANTICIPO_COPROPIETARIO -> clase 2 desde RC-1.';

-- Parametrización para toda copropiedad que ya tenga plan contable — misma
-- forma que el sembrado original de PC-3 (20260830460000).
insert into public.contable_cuenta_default (tenant_id, evento_id, contable_cuenta_id)
select cc.tenant_id, lt.id, cc.id
from public.lista_tipos lt
join public.contable_cuenta cc on cc.codigo = '2605'
where lt.tipo = 'EVENTO_CONTABLE' and lt.codigo = 'ANTICIPO_COPROPIETARIO'
  and lt.tenant_id is null
on conflict (tenant_id, evento_id) do nothing;

-- ── 2. imputación automática del anticipo ───────────────────────────────
-- Consume el remanente de los pagos del inmueble contra sus cargos abiertos
-- respetando el MISMO orden que la política vigente (AD-36): un anticipo no
-- puede colarse por delante de la prelación configurada. Pagos más antiguos
-- primero — el crédito más viejo se gasta antes.
--
-- imputacion_orden es jsonb (20260816100100), no un array de enum: se
-- convierte a text[] para poder usar array_position sobre la categoría.
create function public.fn_aplicar_anticipos(p_tenant_id uuid, p_inmueble_id uuid)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_orden      text[];
  v_aplicado   numeric(18, 2) := 0;
  v_pago       record;
  v_cargo      record;
  v_disponible numeric(18, 2);
  v_monto      numeric(18, 2);
begin
  select array(select jsonb_array_elements_text(pf.imputacion_orden))
    into v_orden
  from public.politicas_financieras pf
  where pf.tenant_id = p_tenant_id and pf.vigente_hasta is null
  limit 1;

  if v_orden is null or cardinality(v_orden) = 0 then
    v_orden := array['interes', 'capital', 'otro'];
  end if;

  for v_pago in
    select p.id,
           p.monto - coalesce((
             select sum(pa.monto) from public.pago_aplicaciones pa where pa.pago_id = p.id
           ), 0) as remanente
    from public.pagos p
    where p.tenant_id = p_tenant_id and p.inmueble_id = p_inmueble_id
    order by p.fecha_pago, p.created_at
  loop
    v_disponible := v_pago.remanente;
    if v_disponible <= 0 then continue; end if;

    for v_cargo in
      select vs.id, vs.monto_pendiente
      from public.v_cargo_saldo vs
      join public.periodos per on per.id = vs.periodo_id
      left join public.conceptos co on co.id = vs.concepto_id
      where vs.tenant_id = p_tenant_id
        and vs.inmueble_id = p_inmueble_id
        and vs.monto_pendiente > 0
      order by per.anio, per.mes,
               coalesce(array_position(v_orden, vs.categoria::text), 99),
               coalesce(co.prioridad, 2147483647),
               vs.id
    loop
      exit when v_disponible <= 0;
      v_monto := least(v_disponible, v_cargo.monto_pendiente);
      if v_monto <= 0 then continue; end if;

      insert into public.pago_aplicaciones (tenant_id, pago_id, cargo_id, monto)
      values (p_tenant_id, v_pago.id, v_cargo.id, v_monto)
      on conflict (pago_id, cargo_id) do nothing;

      v_disponible := v_disponible - v_monto;
      v_aplicado := v_aplicado + v_monto;
    end loop;
  end loop;

  return v_aplicado;
end;
$$;

comment on function public.fn_aplicar_anticipos(uuid, uuid) is
  'Imputa el remanente no aplicado de los pagos de un inmueble (el "crédito a favor" de AD-34) '
  'contra sus cargos abiertos, respetando la prelación de la política vigente (AD-36). Antes de '
  'RC-1 ese remanente quedaba varado: imputarPago() lo devolvía como noAplicado, la UI lo pintaba '
  'y nadie lo volvía a mirar. Idempotente: sin remanente o sin cargos abiertos devuelve 0.';

-- Se dispara cuando nacen cargos, que es cuando el crédito debe consumirse.
-- De sentencia: una liquidación inserta todos los cargos del periodo juntos.
create function public.trg_aplicar_anticipos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fila record;
begin
  for v_fila in select distinct tenant_id, inmueble_id from nuevos loop
    perform public.fn_aplicar_anticipos(v_fila.tenant_id, v_fila.inmueble_id);
  end loop;
  return null;
end;
$$;

comment on function public.trg_aplicar_anticipos() is
  'Consume el crédito a favor en cuanto aparece un cargo nuevo (RC-1). No hace nada si no hay '
  'remanente, que es el caso normal.';

create trigger trg_aplicar_anticipos
  after insert on public.cargos
  referencing new table as nuevos
  for each statement execute function public.trg_aplicar_anticipos();

-- ── 3. la proyección contable, consciente del medio y del anticipo ──────
create or replace function public.contable_movimientos(p_tenant_id uuid, p_desde date, p_hasta date)
 RETURNS TABLE(fecha date, origen text, entidad text, origen_id uuid, documento text, descripcion text, cuenta_codigo text, cuenta_nombre text, debito numeric, credito numeric, tercero_id uuid, inmueble_id uuid, centro_costo_id bigint, agrupacion_id uuid, fondo_id uuid)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $$
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
      (array_agg(cd.contable_cuenta_id) filter (where lt.codigo = 'PROVEEDOR_SERVICIOS'))[1]     as proveedores,
      (array_agg(cd.contable_cuenta_id) filter (where lt.codigo = 'ANTICIPO_COPROPIETARIO'))[1]  as anticipos
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
    -- su propia cuenta de cartera.
    --
    -- RC-1: la cuenta de efectivo ya no es fija. Sale de CÓMO entró el dinero — efectivo a caja,
    -- lo demás a la cuenta contable de la cuenta bancaria concreta, y a BANCO_RECAUDO solo si no
    -- se identificó ninguna (que es como quedó todo lo registrado antes de RC-0, de modo que el
    -- asiento de lo ya existente no cambia).
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
    left join public.lista_tipos fp on fp.id = pg.forma_pago_id
    left join public.cuentas_bancarias cb on cb.id = pg.cuenta_bancaria_id
    where pa.tenant_id = p_tenant_id

    union all

    -- ── B2 · Anticipo: entró dinero que todavía no cubre ningún cargo ──
    -- El hueco que la cabecera de PC-5 declaraba abierto. Sin esta línea, el remanente de un pago
    -- es efectivo real en el banco que no figura en ninguna cuenta: ni activo, ni pasivo. Se
    -- reconoce como pasivo (2605 «Anticipos de copropietarios») porque la copropiedad tiene el
    -- dinero pero todavía no devengó el ingreso.
    --
    -- Al derivarse de `monto − Σ aplicaciones`, la línea se reduce sola en cuanto el remanente se
    -- impute a un cargo: no hay reclasificación que alguien deba acordarse de hacer, y nunca
    -- puede quedar desincronizada de las aplicaciones.
    select
      pg.fecha_pago,
      'cartera'::text,
      'pagos'::text,
      pg.id,
      coalesce(pg.referencia, 'Anticipo'),
      'Anticipo recibido sin imputar',
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
      select sum(pa2.monto) as aplicado
      from public.pago_aplicaciones pa2 where pa2.pago_id = pg.id
    ) apl on true
    where pg.tenant_id = p_tenant_id
      and pg.monto - coalesce(apl.aplicado, 0) > 0

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
$$
;

comment on function public.contable_movimientos(uuid, date, date) is
  'Proyección contable en partida doble (PC-5) de los hechos que AQUILA ya registra: devengo de '
  'cartera (cargos), recaudo (pago_aplicaciones), anticipos recibidos sin imputar (RC-1), '
  'ejecución presupuestal y movimientos de fondos. No persiste asientos: los deriva, de modo que '
  'no puede existir desincronización entre la operación y la contabilidad, ni doble '
  'contabilización. Desde RC-1 la cuenta de efectivo del recaudo depende de la forma de pago '
  '(efectivo -> caja; cuenta bancaria identificada -> su cuenta; ninguna -> BANCO_RECAUDO), y el '
  'remanente no imputado de un pago se reconoce como pasivo en vez de desaparecer. El cuadre '
  'sigue siendo estructural — cada hecho declara un solo importe y un LATERAL lo expande a dos '
  'líneas. Una cuenta sin parametrizar sale como NULL en vez de omitirse; usar '
  'contable_parametrizacion_pendiente() antes de exportar.';
