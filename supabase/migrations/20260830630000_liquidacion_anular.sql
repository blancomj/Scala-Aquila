-- ═══════════════════════════════════════════════════════════════════════
--  L6 · Anular una liquidación aplicada
--  Propietario: plan "Liquidación en dos tiempos" (2026-08-24), §6/L6
--
--  ═══ LA SALIDA DE EMERGENCIA QUE NO EXISTÍA ═══
--
--  Hasta aquí, un error descubierto después de aplicar no tenía remedio: el
--  ledger es append-only y la única "solución" habría sido tocar la base a
--  mano. Esto le da un camino auditado.
--
--  ═══ POR CONTRA-CARGOS, NUNCA POR BORRADO ═══
--
--  cargos_append_only (trigger) impide tanto UPDATE como DELETE, y eso es
--  deliberado (16 §68): la historia de lo que se cobró no se reescribe. Así
--  que anular no borra los cargos — emite el espejo de cada uno con signo
--  contrario. El saldo neto queda en cero y queda registro de las dos cosas:
--  que se cobró, y que se revirtió.
--
--  Efecto colateral deseado: como presupuesto_cuenta_ejecucion() suma
--  cargos.monto_original (L4, modo causación), los contra-cargos corrigen el
--  ejecutado presupuestal SOLOS. Y contable_movimientos() (PC-5) hace lo
--  mismo con el asiento, intercambiando débito y crédito ante un negativo.
--  No hay un tercer sitio que recordar actualizar.
--
--  ═══ LA REGLA QUE HACE SEGURO TODO ESTO ═══
--
--  Solo se anula si NINGÚN cargo del periodo tiene pagos imputados. Si ya
--  entró dinero contra esta liquidación, no es una anulación: es un ajuste, y
--  va por novedades. Sin esta regla, los contra-cargos dejarían pagos
--  imputados contra deuda inexistente y la imputación quedaría corrupta.
--
--  Es una restricción real y conviene decirla claro: en la práctica, una
--  liquidación solo se puede anular en la ventana entre aplicarla y el primer
--  pago. Después, el camino es un ajuste.
-- ═══════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════
--  1. Qué cargo reversa cada contra-cargo
-- ═══════════════════════════════════════════════════════════════════════
-- Sin esto, un contra-cargo sería indistinguible de un cargo negativo suelto
-- y no habría forma de emparejar los dos lados de la reversión.
--
-- No toca cargos_origen_unico: el contra-cargo conserva el mismo origen_tipo
-- y la misma columna de respaldo que el cargo original (esa restricción sigue
-- valiendo tal cual), y esta columna solo añade el vínculo entre ambos.

alter table public.cargos
  add column cargo_reversado_id uuid references public.cargos (id);

create index cargos_reversado_idx on public.cargos (cargo_reversado_id)
  where cargo_reversado_id is not null;

comment on column public.cargos.cargo_reversado_id is
  'Cargo que este contra-cargo anula (L6). Null en un cargo normal. El contra-cargo conserva el '
  'origen_tipo y la columna de origen del cargo original — cambia solo el signo del monto — para '
  'que las derivaciones (presupuesto y contabilidad) lo compensen sin lógica adicional.';


-- ═══════════════════════════════════════════════════════════════════════
--  2. Reabrir un periodo cerrado
-- ═══════════════════════════════════════════════════════════════════════
-- La migración original de la máquina de estados ya lo anticipaba: "cerrado →
-- abierto solo vía reapertura autorizada y auditada (16 §94)". La transición
-- faltaba porque no existía todavía el mecanismo que la justificara.
--
-- La autorización no se pide como un permiso suelto sino como una CONDICIÓN
-- verificable: solo se reabre un periodo que no tenga ninguna liquidación
-- aplicada. Como fn_anular_liquidacion marca 'anulada' ANTES de reabrir, la
-- condición se cumple justo cuando debe — y un intento manual de reabrir un
-- periodo con su liquidación viva se rechaza sin depender de que quien lo
-- intente tenga o no buen criterio.

create or replace function public.guard_periodo_transicion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.estado = old.estado then
    return new;
  end if;

  if not (
    (old.estado = 'abierto' and new.estado = 'en_liquidacion')
    or (old.estado = 'en_liquidacion' and new.estado = 'cerrado')
    or (old.estado = 'cerrado' and new.estado = 'bloqueado')
    -- L6: reapertura tras anular (16 §94).
    or (old.estado = 'cerrado' and new.estado = 'abierto')
  ) then
    raise exception 'INVALID_TRANSITION: periodo % no puede pasar de % a % (16 §14-16)',
      old.id, old.estado, new.estado;
  end if;

  -- CAR GAP-CAR-001: sin fecha_vencimiento, el periodo no puede liquidarse
  -- — la antigüedad de cartera se volvería indefinida para sus cargos.
  if new.estado = 'en_liquidacion' and new.fecha_vencimiento is null then
    raise exception 'PERIODO_SIN_FECHA_VENCIMIENTO: el periodo % no tiene fecha_vencimiento '
      'configurada — requerida antes de liquidar (CAR §7.1, GAP-CAR-001)', new.id;
  end if;

  -- L6: reabrir exige que no quede una liquidación aplicada. El orden de
  -- fn_anular_liquidacion (anular primero, reabrir después) satisface esto;
  -- una reapertura suelta no.
  if old.estado = 'cerrado' and new.estado = 'abierto' then
    if exists (
      select 1 from public.liquidaciones l
      where l.periodo_id = old.id and l.estado = 'aplicada'
    ) then
      raise exception 'PERIODO_CON_LIQUIDACION_APLICADA: el periodo % no puede reabrirse mientras '
        'tenga una liquidación aplicada — anúlala primero (L6)', old.id;
    end if;
    -- El cierre anterior deja de ser cierto; conservarlo confundiría la
    -- auditoría con una fecha que ya no corresponde a nada.
    new.cerrado_at := null;
    new.cerrado_por := null;
  end if;

  return new;
end;
$$;

comment on function public.guard_periodo_transicion() is
  'Máquina de estados de periodos (16 §14-16) + GAP-CAR-001 (no entrar a en_liquidacion sin '
  'fecha_vencimiento) + L6 (reapertura cerrado → abierto, solo si no queda una liquidación '
  'aplicada; limpia el rastro del cierre anterior).';


-- ═══════════════════════════════════════════════════════════════════════
--  3. Anular
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_anular_liquidacion(
  p_liquidacion_id uuid,
  p_motivo         text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_liq       public.liquidaciones%rowtype;
  v_periodo   public.periodos%rowtype;
  v_pagados   int;
  v_reversos  int;
  v_estados   int;
begin
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'LIQUIDACION_ANULACION_SIN_MOTIVO: anular exige un motivo escrito — es el '
      'único rastro de por qué se revirtió';
  end if;

  select * into v_liq from public.liquidaciones where id = p_liquidacion_id;
  if v_liq.id is null then
    raise exception 'LIQUIDACION_NO_ENCONTRADA: no existe la liquidación %', p_liquidacion_id;
  end if;

  if v_liq.estado <> 'aplicada' then
    raise exception 'LIQUIDACION_NO_APLICADA: la liquidación % está en estado "%" — solo se anula '
      'una que esté aplicada', p_liquidacion_id, v_liq.estado;
  end if;

  -- Mismo lock que aplicar: nadie puede estar liquidando el periodo mientras
  -- se revierte.
  select * into v_periodo from public.periodos
   where id = v_liq.periodo_id
   for update;

  -- ── La regla que lo hace seguro ────────────────────────────────────
  -- Se mira TODO el periodo, no solo los cargos de esta liquidación: un
  -- interés de mora generado después también cuelga de este cierre, y si
  -- alguien ya pagó contra él, revertir dejaría ese pago aplicado contra
  -- deuda inexistente.
  select count(*) into v_pagados
  from public.cargos c
  where c.periodo_id = v_liq.periodo_id
    and exists (select 1 from public.pago_aplicaciones pa where pa.cargo_id = c.id);

  if v_pagados > 0 then
    raise exception 'LIQUIDACION_CON_PAGOS: no se puede anular — % cargo(s) de este periodo ya '
      'tienen pagos imputados. Con dinero recibido de por medio, la corrección es un ajuste '
      '(novedades), no una anulación.', v_pagados;
  end if;

  -- ── El espejo de cada cargo ────────────────────────────────────────
  -- Conserva origen_tipo y su columna de respaldo (cargos_origen_unico sigue
  -- valiendo) e invierte el signo. Se excluyen los contra-cargos previos por
  -- si acaso: reversar una reversión sería volver a cobrar.
  insert into public.cargos (
    tenant_id, inmueble_id, periodo_id, categoria, origen_tipo,
    liquidacion_linea_id, novedad_id, cargo_capital_origen_id, concepto_id,
    monto_original, cargo_reversado_id
  )
  select c.tenant_id, c.inmueble_id, c.periodo_id, c.categoria, c.origen_tipo,
         c.liquidacion_linea_id, c.novedad_id, c.cargo_capital_origen_id, c.concepto_id,
         -c.monto_original, c.id
  from public.cargos c
  where c.periodo_id = v_liq.periodo_id
    and c.cargo_reversado_id is null
    and not exists (
      select 1 from public.cargos r where r.cargo_reversado_id = c.id
    );
  get diagnostics v_reversos = row_count;

  -- ── Los estados de cuenta emitidos dejan de ser ciertos ────────────
  -- A diferencia de los cargos, estados_cuenta_generados no es append-only:
  -- es un documento derivado, no un hecho económico. Se retiran en vez de
  -- dejar circulando un PDF que afirma una deuda que ya no existe.
  delete from public.estados_cuenta_generados where liquidacion_id = p_liquidacion_id;
  get diagnostics v_estados = row_count;

  -- ── Anular primero, reabrir después ────────────────────────────────
  -- Este orden importa: guard_periodo_transicion solo deja reabrir si no
  -- queda ninguna liquidación aplicada. El guard de liquidaciones exige aquí
  -- rol administrador y registra anulada_por/anulada_at.
  update public.liquidaciones
     set estado = 'anulada', motivo_anulacion = p_motivo
   where id = p_liquidacion_id;

  update public.periodos set estado = 'abierto' where id = v_liq.periodo_id;

  return jsonb_build_object(
    'liquidacion_id',      p_liquidacion_id,
    'periodo_id',          v_liq.periodo_id,
    'contra_cargos',       v_reversos,
    'estados_retirados',   v_estados,
    'periodo_reabierto',   true,
    'motivo',              p_motivo
  );
end;
$$;

comment on function public.fn_anular_liquidacion(uuid, text) is
  'Revierte una liquidación aplicada emitiendo el contra-cargo de cada cargo del periodo, retira '
  'los estados de cuenta que emitió y reabre el periodo — todo en una transacción. Rechaza si '
  'algún cargo ya tiene pagos imputados: con dinero de por medio la corrección es un ajuste, no '
  'una anulación. Nunca borra cargos (append-only, 16 §68). El presupuesto y la contabilidad se '
  'corrigen solos, porque ambos derivan de los mismos cargos. Exige rol administrador vía '
  'guard_liquidacion_transicion.';

grant execute on function public.fn_anular_liquidacion(uuid, text) to authenticated;
