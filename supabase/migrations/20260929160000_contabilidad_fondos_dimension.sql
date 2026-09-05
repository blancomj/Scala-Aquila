-- ═══════════════════════════════════════════════════════════════════════
--  Dominio Fondos — BLOQUE L: contabilidad. Cierra §4.3 y §4.4 de
--  ANALISIS_FONDOS_BLOQUE_A.md, y corrige un defecto que las migraciones
--  del bloque E introdujeron sin querer.
--  Propietario: PLAN_MAESTRO_IMPLEMENTACION.md §4.3 (GAP-22), D-36.
--
--  ═══ El defecto que arrastraba el bloque D de contable_movimientos() ═══
--
--  20260929110000 amplió fondo_movimientos.tipo de 2 valores (aporte/uso) a
--  8. El bloque D de la proyección contable (PC-5) nunca se actualizó:
--  seguía tratando "aporte" como entrada y CUALQUIER OTRO tipo —incluido
--  rendimiento, que es ingreso real, no una reclasificación de efectivo—
--  como si fuera un uso. Un rendimiento se proyectaba como si el dinero
--  saliera al banco y el fondo lo recibiera, exactamente al revés de lo que
--  el CTCP exige (PC_01 §3.2: "D 111015 · H 4605 Rendimientos financieros").
--  Se corrige aquí junto con el resto, porque un guard de dimensión sin una
--  proyección correcta detrás sería teatro.
--
--  ═══ RENDIMIENTO_FINANCIERO_FONDO — el evento contable que faltaba ═══
--
--  Los 3 eventos sembrados en PC-3 para fondos (CARTERA_FONDO_IMPREVISTOS,
--  INGRESO_FONDO_IMPREVISTOS, FONDO_IMPREVISTOS_EFECTIVO) cubren la CxC y
--  el devengo de la cuota, y el efectivo restringido — pero nunca se sembró
--  un evento para el rendimiento (4605), así que no había manera canónica
--  de resolver esa cuenta desde la proyección. Se agrega con el mismo
--  patrón PC-3c: evento en lista_tipos + par en fn_instanciar_cuentas_default
--  (create or replace, no una tabla nueva) + backfill idempotente para las
--  copropiedades que ya existen.
--
--  ═══ CARTERA_FONDO_IMPREVISTOS / INGRESO_FONDO_IMPREVISTOS siguen sin
--       consumirse, y es correcto que sigan así ═══
--
--  Esos dos eventos resuelven la CxC (1315) y el ingreso (4115) de la CUOTA
--  del fondo — solo se activan si algún concepto factura esa cuota. Hoy no
--  existe ese concepto (BLOQUE K, circuito de cobro, todavía pendiente).
--  Añadirlos a la proyección ahora sería simular un hecho que no ocurre.
--  Quedan sembrados y validados (ver guard más abajo), listos para cuando
--  BLOQUE K los necesite.
--
--  ═══ requiere_fondo — el guard que el prompt maestro anunció y nunca
--       existió (ANALISIS_FONDOS_BLOQUE_A.md §4.3) ═══
--
--  contable_movimientos() es una proyección de solo lectura: no hay INSERT
--  que interceptar para "bloquear un movimiento sin fondo". La activación
--  correcta, dado que es una derivación, es la misma que ya usa el repo
--  para todo control de este tipo (contable_parametrizacion_pendiente,
--  contable_cuadre, fn_alertas_cartera): un control que REPORTA la
--  excepción, no que la impide en el punto de escritura. Se agrega
--  contable_dimensiones_faltantes(), que activa las CUATRO dimensiones
--  obligatorias del prompt maestro §35 (no solo fondo) porque las cuatro
--  comparten exactamente el mismo hueco y la misma proyección las expone.
--
--  Además, dos guards de escritura SÍ pueden validarse en el punto de
--  mapeo (aunque no en el de movimiento): que un evento contable de fondo
--  apunte a una cuenta con requiere_fondo=true, y que fondos.contable_cuenta_id
--  también lo sea. Cierran la mitad de §4.3 que sí es validable hoy.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Evento RENDIMIENTO_FINANCIERO_FONDO ──────────────────────────────
insert into public.lista_tipos (tipo, codigo, nombre, descripcion, orden) values
  ('EVENTO_CONTABLE', 'RENDIMIENTO_FINANCIERO_FONDO', 'Rendimiento financiero de un fondo',
   'Crédito del rendimiento generado por el efectivo restringido de un fondo (CTCP: se '
   'reconoce como ingreso, nunca directo contra el aporte) — PC_01 §3.2', 165);

-- ── 2. fn_instanciar_cuentas_default gana el par nuevo ──────────────────
-- Reproducción literal de 20260903120000 + un par. create or replace, no
-- una función nueva: es la misma que siembra el alta y el backfill.
create or replace function public.fn_instanciar_cuentas_default(p_tenant_id uuid)
returns table (creadas integer, existentes integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_creadas integer := 0;
  v_total   integer;
begin
  if not exists (select 1 from public.tenants where id = p_tenant_id) then
    raise exception 'TENANT_INEXISTENTE: %', p_tenant_id;
  end if;

  insert into public.contable_cuenta_default (tenant_id, evento_id, contable_cuenta_id)
  select p_tenant_id, lt.id, cc.id
  from (values
    ('CARTERA_CUOTA_ORDINARIA','1305'),      ('CARTERA_CUOTA_EXTRAORDINARIA','1310'),
    ('CARTERA_FONDO_IMPREVISTOS','1315'),    ('CARTERA_INTERES_MORA','1320'),
    ('CARTERA_MULTA','1325'),                ('CARTERA_OTROS','1330'),
    ('INGRESO_CUOTA_ORDINARIA','4105'),      ('INGRESO_CUOTA_EXTRAORDINARIA','4110'),
    ('INGRESO_FONDO_IMPREVISTOS','4115'),    ('INGRESO_INTERES_MORA','4205'),
    ('INGRESO_MULTA','4505'),                ('BANCO_RECAUDO','111005'),
    ('CAJA_GENERAL','110505'),               ('PROVEEDOR_BIENES','2205'),
    ('PROVEEDOR_SERVICIOS','2210'),          ('FONDO_IMPREVISTOS_EFECTIVO','111015'),
    ('DETERIORO_CARTERA','1399'),            ('GASTO_DETERIORO_CARTERA','5915'),
    ('RESULTADO_EJERCICIO','3310'),          ('ANTICIPO_COPROPIETARIO','2605'),
    ('RENDIMIENTO_FINANCIERO_FONDO','4605')
  ) as m(evento, codigo_contable)
  join public.lista_tipos lt
    on lt.tipo = 'EVENTO_CONTABLE' and lt.codigo = m.evento
   and lt.tenant_id is null and lt.activo
  join public.contable_cuenta cc
    on cc.tenant_id = p_tenant_id and cc.codigo = m.codigo_contable
   and cc.permite_movimiento and cc.activa
  on conflict (tenant_id, evento_id) do nothing;

  get diagnostics v_creadas = row_count;

  select count(*) into v_total
  from public.contable_cuenta_default where tenant_id = p_tenant_id;

  return query select v_creadas, (v_total - v_creadas)::integer;
end;
$$;

comment on function public.fn_instanciar_cuentas_default(uuid) is
  'Siembra el mapa evento contable -> cuenta (contable_cuenta_default, PC-3) de una '
  'copropiedad con las cuentas canónicas del PUC PH. Idempotente: ON CONFLICT DO NOTHING por '
  '(tenant_id, evento_id), así que nunca pisa una cuenta que la copropiedad haya reasignado. '
  'RENDIMIENTO_FINANCIERO_FONDO -> 4605 se agregó en GAP-22 (bloque L) para que los rendimientos '
  'del fondo tengan cuenta canónica igual que el resto de eventos.';

-- Backfill idempotente — mismo criterio que PC-3c: cada copropiedad con
-- plan contable recibe el par nuevo sin tocar lo que ya tenía.
do $$
declare
  v_tenant uuid;
begin
  for v_tenant in select distinct tenant_id from public.contable_cuenta
  loop
    perform public.fn_instanciar_cuentas_default(v_tenant);
  end loop;
end $$;

-- ── 3. guard_contable_cuenta_default exige requiere_fondo en eventos de fondo ──
-- Reproducción de 20260830540000 + dos cosas: clase para el evento nuevo, y
-- la validación de requiere_fondo que el prompt maestro §35 anunció y
-- nunca se escribió (ANALISIS_FONDOS_BLOQUE_A.md §4.3).
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
  v_requiere_fondo_esperado boolean := false;
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
    when v_evento_codigo = 'RESULTADO_EJERCICIO'                 then 3
    when v_evento_codigo like 'INGRESO_%'                        then 4
    when v_evento_codigo = 'RENDIMIENTO_FINANCIERO_FONDO'        then 4
    when v_evento_codigo = 'GASTO_DETERIORO_CARTERA'             then 5
  end;

  if v_evento_codigo in ('BANCO_RECAUDO', 'CAJA_GENERAL', 'FONDO_IMPREVISTOS_EFECTIVO') then
    v_grupo11_esperado := true;
  end if;

  -- GAP-22 (bloque L): los cuatro eventos de fondo exigen una cuenta con la
  -- dimensión fondo activada — es lo que hace que contable_dimensiones_faltantes()
  -- pueda exigirla más abajo en la proyección.
  if v_evento_codigo in ('CARTERA_FONDO_IMPREVISTOS', 'INGRESO_FONDO_IMPREVISTOS',
                          'FONDO_IMPREVISTOS_EFECTIVO', 'RENDIMIENTO_FINANCIERO_FONDO') then
    v_requiere_fondo_esperado := true;
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

  if v_requiere_fondo_esperado and not v_cuenta.requiere_fondo then
    raise exception 'CUENTA_SIN_DIMENSION_FONDO: % (%) no tiene requiere_fondo activo — el '
      'evento % es propio del dominio Fondos y su cuenta debe llevar esa dimensión (GAP-22)',
      v_cuenta.codigo, v_cuenta.nombre, v_evento_codigo;
  end if;

  return new;
end;
$$;

comment on function public.guard_contable_cuenta_default() is
  'Cuentas predeterminadas por evento (PC-3), con coherencia de clase (PC-9) y de dimensión '
  'fondo (GAP-22, bloque L): impide mapear un evento de ingreso contra una cuenta de gasto, y '
  'mapear un evento propio del dominio Fondos contra una cuenta sin requiere_fondo activo.';

-- ── 4. fondos.contable_cuenta_id también exige requiere_fondo ───────────
-- guard_vinculo_cuenta_efectivo es compartida con cuentas_bancarias (PC-3):
-- una cuenta bancaria normal no necesita la dimensión fondo, así que el
-- requisito adicional se aplica solo cuando el llamador es la tabla fondos.
create or replace function public.guard_vinculo_cuenta_efectivo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cuenta public.contable_cuenta%rowtype;
begin
  if new.contable_cuenta_id is null then
    return new;
  end if;

  -- Prefijo '11': efectivo y equivalentes. Cubre caja (1105xx) y bancos (1110xx).
  v_cuenta := public.validar_cuenta_contable_destino(new.contable_cuenta_id, new.tenant_id, '11');

  if tg_table_name = 'fondos' and not v_cuenta.requiere_fondo then
    raise exception 'CUENTA_SIN_DIMENSION_FONDO: % (%) no tiene requiere_fondo activo — un '
      'fondo solo puede vincularse a efectivo restringido (GAP-22)',
      v_cuenta.codigo, v_cuenta.nombre;
  end if;

  return new;
end;
$$;

-- ── 5. contable_movimientos(): el bloque D correcto para los 8 tipos ────
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
      (array_agg(cd.contable_cuenta_id) filter (where lt.codigo = 'INGRESO_INTERES_MORA'))[1]    as ingreso_interes,
      (array_agg(cd.contable_cuenta_id) filter (where lt.codigo = 'BANCO_RECAUDO'))[1]           as banco_recaudo,
      (array_agg(cd.contable_cuenta_id) filter (where lt.codigo = 'CAJA_GENERAL'))[1]            as caja,
      (array_agg(cd.contable_cuenta_id) filter (where lt.codigo = 'PROVEEDOR_SERVICIOS'))[1]     as proveedores,
      (array_agg(cd.contable_cuenta_id) filter (where lt.codigo = 'ANTICIPO_COPROPIETARIO'))[1]  as anticipos,
      (array_agg(cd.contable_cuenta_id) filter (where lt.codigo = 'RENDIMIENTO_FINANCIERO_FONDO'))[1] as rendimiento_fondo
    from public.contable_cuenta_default cd
    join public.lista_tipos lt on lt.id = cd.evento_id
    where cd.tenant_id = p_tenant_id
  ),
  hechos as (
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
  'contrapartida de lo que corrige. Una cuenta sin parametrizar sale como NULL; usar '
  'contable_parametrizacion_pendiente() antes de exportar, y '
  'contable_dimensiones_faltantes() para las dimensiones obligatorias (fondo/tercero/'
  'centro_costo/inmueble) que falten en una línea.';

-- ── 6. contable_dimensiones_faltantes(): activa las 4 flags requiere_* ──
create function public.contable_dimensiones_faltantes(
  p_tenant_id uuid,
  p_desde     date,
  p_hasta     date
)
returns table (
  fecha        date,
  origen       text,
  entidad      text,
  origen_id    uuid,
  cuenta_codigo text,
  cuenta_nombre text,
  dimension_faltante text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select m.fecha, m.origen, m.entidad, m.origen_id, m.cuenta_codigo, m.cuenta_nombre,
         dim.nombre
    from public.contable_movimientos(p_tenant_id, p_desde, p_hasta) m
    join public.contable_cuenta cc
      on cc.tenant_id = p_tenant_id and cc.codigo = m.cuenta_codigo
    cross join lateral (values
      ('fondo',        cc.requiere_fondo,        m.fondo_id::text),
      ('tercero',      cc.requiere_tercero,       m.tercero_id::text),
      ('centro_costo', cc.requiere_centro_costo,  m.centro_costo_id::text),
      ('inmueble',     cc.requiere_inmueble,      m.inmueble_id::text)
    ) as dim(nombre, exigida, valor)
   where dim.exigida and dim.valor is null;
$$;

comment on function public.contable_dimensiones_faltantes(uuid, date, date) is
  'Activa las cuatro dimensiones obligatorias del prompt maestro §35 (requiere_fondo/tercero/'
  'centro_costo/inmueble en contable_cuenta) — anunciadas desde PC-3 y sin guard hasta GAP-22 '
  '(ANALISIS_FONDOS_BLOQUE_A.md §4.3). No es un trigger: contable_movimientos() es una '
  'proyección derivada, no hay INSERT que interceptar. Mismo criterio que '
  'contable_parametrizacion_pendiente()/contable_cuadre(): reporta la excepción para que se '
  'corrija el hecho de origen, no la corrige sola. Vacío = ninguna línea del periodo incumple '
  'su dimensión obligatoria.';
