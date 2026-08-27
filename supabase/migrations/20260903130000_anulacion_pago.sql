-- ═══════════════════════════════════════════════════════════════════════
--  RC-2 · Anulación de pago — reversa append-only (opción B, decidida por
--  el usuario 2026-08-27: relajar los CHECK > 0 e insertar el espejo
--  negativo, en vez de una tabla de anulaciones aparte).
--
--  ═══ POR QUÉ ESTA OPCIÓN Y NO UNA TABLA APARTE ═══
--
--  contable_movimientos() (PC-5) ya estaba diseñada para esto — su propio
--  comentario lo dice desde 20260830500000: «Un monto negativo (reversión)
--  intercambia los lados en vez de generar importes negativos, así que el
--  cuadre sobrevive también a las correcciones». v_cargo_saldo tampoco
--  distingue de qué pago viene cada aplicación, solo suma por cargo_id. Los
--  dos consumidores centrales del ledger ya sabían reversar; hacía falta el
--  dato, no el mecanismo.
--
--  ═══ QUÉ ES UNA REVERSA AQUÍ ═══
--
--  Anular NO borra ni actualiza nada (pagos/pago_aplicaciones siguen
--  append-only, SEC-14). Anular INSERTA:
--    1. Un nuevo pago con monto = −monto_original, pago_original_id
--       apuntando al que reversa, misma forma de pago y cuenta bancaria
--       (por dónde salió el dinero, salvo que se indique lo contrario),
--       fecha_pago = HOY (el día real en que se revierte, no el del pago
--       original — la plata sale hoy, no en el pasado).
--    2. Por cada pago_aplicaciones del original, su espejo negativo contra
--       el MISMO cargo, atado al pago de la reversa. v_cargo_saldo lo suma
--       automáticamente y el cargo vuelve a quedar pendiente.
--
--  Solo reversa TOTAL — «anular un pago» es una operación completa, no
--  parcial. Si se necesita corregir un monto, se anula y se registra de
--  nuevo con el valor correcto.
--
--  ═══ EL BUG QUE HABÍA QUE CERRAR ANTES DE ABRIR ESTO: reuso del anticipo
--       ya devuelto ═══
--
--  fn_aplicar_anticipos (RC-1) recorre pagos y usa `monto − Σ aplicaciones
--  de ESE pago` como "disponible". Si un pago generó anticipo y se anula, su
--  fila ORIGINAL sigue mostrando el mismo remanente (sus propias
--  aplicaciones no cambian — el espejo se ata al pago de la reversa, no al
--  original, precisamente para poder fecharlo hoy). Sin el filtro nuevo de
--  abajo, fn_aplicar_anticipos seguiría ofreciendo ese remanente a un cargo
--  futuro después de haber devuelto la plata — doble uso del mismo dinero.
--  Se cierra excluyendo de la búsqueda cualquier pago con monto <= 0 (una
--  reversa nunca es fuente) y cualquier pago que YA tenga una reversa
--  registrada (pagos_un_reversa_por_original lo hace verificable con un
--  EXISTS barato).
--
--  La CONTABILIDAD del anticipo sí debe mostrar las dos líneas (el +100
--  original y el −100 de la reversa): así es como partida doble cierra un
--  pasivo, no borrando la primera línea. Por eso el filtro de
--  contable_movimientos B2 cambia de "> 0" a "<> 0" — antes solo mostraba
--  anticipos vivos; ahora también su cancelación.
--
--  ═══ LO QUE ESTA MIGRACIÓN DELIBERADAMENTE NO CUBRE ═══
--
--  Si el pago anulado había disparado un descuento por pronto pago (D3,
--  20260830650000 — un cargo negativo contra el capital), ese cargo NO se
--  reversa aquí. fn_aplicar_descuento_pronto_pago() no vuelve a evaluarlo
--  porque su propio guard "not exists ya hay un descuento" excluye el
--  capital del recorrido en cuanto existe uno. Consecuencia real: si un
--  cheque que ganó descuento por pronto pago resulta devuelto, el residente
--  conserva el descuento aunque el pago que lo ganó se anuló. Es un caso de
--  cruce D3×RC-2 genuinamente distinto (retirar un beneficio ya otorgado,
--  no reversar un cobro) y se deja fuera a propósito — señalado aquí para
--  que quede visible, no descubierto por sorpresa en producción.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. las columnas del CHECK > 0 pasan a <> 0 ──────────────────────────
-- monto=0 nunca tiene sentido (ni cobro ni reversa de nada), por eso <> 0
-- y no "sin restricción". cargos.monto_original ya era <> 0 desde el
-- origen (20260816100000) — el descuento por pronto pago (D3) siempre fue
-- negativo; pagos/pago_aplicaciones eran las dos que faltaban.
alter table public.pagos
  drop constraint pagos_monto_check,
  add constraint pagos_monto_check check (monto <> 0);

alter table public.pago_aplicaciones
  drop constraint pago_aplicaciones_monto_check,
  add constraint pago_aplicaciones_monto_check check (monto <> 0);

-- ── 2. las columnas de la reversa ───────────────────────────────────────
alter table public.pagos
  add column pago_original_id uuid references public.pagos (id),
  add column anulado_motivo   text;

comment on column public.pagos.pago_original_id is
  'Null en un pago normal. En una reversa, apunta al pago que anula — monto es exactamente el '
  'opuesto del original (guard_pago_reversa_coherente). Un pago solo puede tener UNA reversa '
  '(pagos_un_reversa_por_original) y una reversa no puede a su vez anularse.';

comment on column public.pagos.anulado_motivo is
  'Por qué se anuló (cheque devuelto, error de digitación...) — obligatorio en una reversa, '
  'siempre null en un pago normal.';

create unique index pagos_un_reversa_por_original
  on public.pagos (pago_original_id)
  where pago_original_id is not null;

create index pagos_reversas_idx on public.pagos (pago_original_id) where pago_original_id is not null;

alter table public.pago_aplicaciones
  add column aplicacion_original_id uuid references public.pago_aplicaciones (id);

comment on column public.pago_aplicaciones.aplicacion_original_id is
  'Null en una aplicación normal. En el espejo de una reversa, apunta a la aplicación que '
  'cancela — mismo cargo_id, monto exactamente opuesto (guard_pago_aplicacion_reversa_coherente). '
  'v_cargo_saldo no distingue esta columna: suma por cargo_id sin importar el pago, así que el '
  'cargo vuelve a quedar pendiente automáticamente.';

create unique index pago_aplicaciones_una_reversa_por_original
  on public.pago_aplicaciones (aplicacion_original_id)
  where aplicacion_original_id is not null;

-- ── 3. coherencia de la reversa, a nivel de fila ────────────────────────
create function public.guard_pago_reversa_coherente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_original public.pagos%rowtype;
begin
  if new.pago_original_id is null then
    if new.monto <= 0 then
      raise exception 'PAGO_MONTO_INVALIDO: un pago normal debe ser positivo (%)', new.monto;
    end if;
    if new.anulado_motivo is not null then
      raise exception 'PAGO_MONTO_INVALIDO: anulado_motivo solo aplica a una reversa';
    end if;
    return new;
  end if;

  -- Es una reversa.
  select * into v_original from public.pagos where id = new.pago_original_id;
  if v_original.id is null then
    raise exception 'PAGO_NO_ENCONTRADO: el pago % que se intenta anular no existe',
      new.pago_original_id;
  end if;
  if v_original.pago_original_id is not null then
    raise exception 'ANULACION_NO_REVERSABLE: % ya es en sí una reversa — no se anula una '
      'anulación', new.pago_original_id;
  end if;
  if v_original.tenant_id <> new.tenant_id or v_original.inmueble_id <> new.inmueble_id then
    raise exception 'PAGO_MEDIO_INCOHERENTE: la reversa debe ser del mismo tenant e inmueble que '
      'el pago original';
  end if;
  if new.monto <> -v_original.monto then
    raise exception 'PAGO_MONTO_INVALIDO: la reversa (%) debe ser exactamente el opuesto del '
      'pago original (%) — solo se admite anulación total', new.monto, v_original.monto;
  end if;
  if new.anulado_motivo is null or btrim(new.anulado_motivo) = '' then
    raise exception 'PAGO_ANULACION_SIN_MOTIVO: toda anulación exige un motivo';
  end if;

  return new;
end;
$$;

comment on function public.guard_pago_reversa_coherente() is
  'RC-2: un pago normal es positivo y sin motivo; una reversa es el opuesto exacto de un '
  'original que aún no tiene otra reversa ni es en sí misma una reversa, con motivo obligatorio. '
  'pagos_un_reversa_por_original cierra la unicidad; este guard cierra la coherencia de valores.';

create trigger guard_pago_reversa_coherente
  before insert on public.pagos
  for each row execute function public.guard_pago_reversa_coherente();

create function public.guard_pago_aplicacion_reversa_coherente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_original public.pago_aplicaciones%rowtype;
  v_pago_reversa public.pagos%rowtype;
begin
  if new.aplicacion_original_id is null then
    if new.monto <= 0 then
      raise exception 'PAGO_MONTO_INVALIDO: una aplicación normal debe ser positiva (%)', new.monto;
    end if;
    return new;
  end if;

  select * into v_original from public.pago_aplicaciones where id = new.aplicacion_original_id;
  if v_original.id is null then
    raise exception 'PAGO_NO_ENCONTRADO: la aplicación % que se intenta reversar no existe',
      new.aplicacion_original_id;
  end if;
  if new.cargo_id <> v_original.cargo_id then
    raise exception 'PAGO_MEDIO_INCOHERENTE: el espejo de una aplicación debe apuntar al mismo '
      'cargo (% vs %)', new.cargo_id, v_original.cargo_id;
  end if;
  if new.monto <> -v_original.monto then
    raise exception 'PAGO_MONTO_INVALIDO: el espejo (%) debe ser exactamente el opuesto de la '
      'aplicación original (%)', new.monto, v_original.monto;
  end if;

  -- El pago dueño de este espejo debe ser precisamente la reversa DEL pago
  -- dueño de la aplicación original — evita atar un espejo a cualquier otro
  -- pago con monto casualmente opuesto.
  select * into v_pago_reversa from public.pagos where id = new.pago_id;
  if v_pago_reversa.pago_original_id is distinct from v_original.pago_id then
    raise exception 'PAGO_MEDIO_INCOHERENTE: el pago % no es la reversa del pago dueño de la '
      'aplicación original (%)', new.pago_id, v_original.pago_id;
  end if;

  return new;
end;
$$;

comment on function public.guard_pago_aplicacion_reversa_coherente() is
  'RC-2: el espejo de una aplicación reversa el mismo cargo con el monto exactamente opuesto, y '
  'solo puede vivir en el pago que es la reversa registrada del pago dueño de la aplicación '
  'original — no en cualquier otro pago.';

create trigger guard_pago_aplicacion_reversa_coherente
  before insert on public.pago_aplicaciones
  for each row execute function public.guard_pago_aplicacion_reversa_coherente();

-- ── 4. fn_anular_pago — el único camino para insertar una reversa ──────
create function public.fn_anular_pago(p_pago_id uuid, p_motivo text, p_actor_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_original public.pagos%rowtype;
  v_reversa_id uuid;
  v_fila public.pago_aplicaciones%rowtype;
begin
  select * into v_original from public.pagos where id = p_pago_id;
  if v_original.id is null then
    raise exception 'PAGO_NO_ENCONTRADO: no existe el pago %', p_pago_id;
  end if;
  if v_original.pago_original_id is not null then
    raise exception 'ANULACION_NO_REVERSABLE: % ya es una reversa', p_pago_id;
  end if;
  if exists (select 1 from public.pagos where pago_original_id = p_pago_id) then
    raise exception 'PAGO_YA_ANULADO: el pago % ya tiene una anulación registrada', p_pago_id;
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'PAGO_ANULACION_SIN_MOTIVO: toda anulación exige un motivo';
  end if;

  insert into public.pagos (
    tenant_id, inmueble_id, monto, fecha_pago, fecha_registro, referencia,
    forma_pago_id, cuenta_bancaria_id, registrado_por, pago_original_id, anulado_motivo
  )
  values (
    v_original.tenant_id, v_original.inmueble_id, -v_original.monto, current_date, current_date,
    'Anulación · ' || coalesce(v_original.referencia, p_pago_id::text),
    v_original.forma_pago_id, v_original.cuenta_bancaria_id, p_actor_id, p_pago_id, p_motivo
  )
  returning id into v_reversa_id;

  for v_fila in select * from public.pago_aplicaciones where pago_id = p_pago_id loop
    insert into public.pago_aplicaciones (
      tenant_id, pago_id, cargo_id, monto, aplicacion_original_id
    )
    values (
      v_fila.tenant_id, v_reversa_id, v_fila.cargo_id, -v_fila.monto, v_fila.id
    );
  end loop;

  return v_reversa_id;
end;
$$;

comment on function public.fn_anular_pago(uuid, text, uuid) is
  'RC-2 — única vía para anular un pago: inserta la reversa (monto opuesto, fecha de hoy) y el '
  'espejo de cada una de sus aplicaciones (reabre los cargos vía v_cargo_saldo, que suma por '
  'cargo_id sin importar el pago). Solo total, nunca parcial. No reversa un descuento por pronto '
  'pago que el pago original hubiera podido disparar (ver cabecera de esta migración).';

-- ── 5. fn_aplicar_anticipos deja de ofrecer dinero ya devuelto ─────────
create or replace function public.fn_aplicar_anticipos(p_tenant_id uuid, p_inmueble_id uuid)
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
      -- RC-2: una reversa nunca es fuente de anticipo (monto negativo por
      -- construcción), y un pago ya anulado tampoco — su remanente sigue
      -- "en el papel" pero la plata ya volvió; ofrecerlo sería reusarla.
      and p.monto > 0
      and not exists (select 1 from public.pagos r where r.pago_original_id = p.id)
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
  'Imputa el remanente no aplicado de los pagos de un inmueble contra sus cargos abiertos (AD-36). '
  'Desde RC-2 ignora los pagos que ya tienen reversa (pago.monto > 0 and not exists reversa): su '
  'remanente en el papel ya fue devuelto y ofrecerlo de nuevo sería reusar la misma plata dos '
  'veces. Idempotente: sin remanente o sin cargos abiertos devuelve 0.';

-- ── 6. la proyección contable ve también la cancelación del anticipo ───
-- Antes de RC-2 el filtro "> 0" solo mostraba anticipos VIVOS. La reversa
-- de un pago con anticipo produce, para su propia fila, un remanente
-- NEGATIVO (ver cabecera) — es la línea que cierra el pasivo 2605 en
-- partida doble. Con "> 0" esa línea nunca aparecía y el pasivo quedaba
-- viéndose vivo para siempre aunque la plata ya hubiera vuelto.
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
      (array_agg(cd.contable_cuenta_id) filter (where lt.codigo = 'ANTICIPO_COPROPIETARIO'))[1]  as anticipos
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
  'reversas (RC-2), ejecución presupuestal y fondos. No persiste asientos: los deriva. Desde '
  'RC-2 el bloque de anticipo usa "<> 0" en vez de "> 0": una reversa con remanente negativo es '
  'la línea que cierra en partida doble el pasivo que había abierto el pago original. El cuadre '
  'sigue siendo estructural. Una cuenta sin parametrizar sale como NULL; usar '
  'contable_parametrizacion_pendiente() antes de exportar.';
