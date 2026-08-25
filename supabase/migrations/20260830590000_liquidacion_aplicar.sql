-- ═══════════════════════════════════════════════════════════════════════
--  L3 · Aplicar una liquidación — la transacción única
--  Propietario: plan "Liquidación en dos tiempos" (2026-08-24), §6/L3
--
--  ═══ EL PROBLEMA QUE CIERRA ═══
--
--  Hoy aplicar son tres escrituras secuenciales no atómicas, y el propio
--  código lo admite: "la liquidación ya quedó guardada — un fallo aquí no
--  la revierte" (supabase/functions/liquidar-periodo/index.ts). Si el
--  segundo paso falla, el periodo queda con una liquidación registrada y
--  sin los cargos que debía producir.
--
--  Aquí todo ocurre en UNA transacción de Postgres: o el periodo queda
--  liquidado entero, o no cambia nada. La Edge Function que la invoca no
--  orquesta — autoriza y llama esta RPC, nada más.
--
--  ═══ POR QUÉ security definer ═══
--
--  `cargos` no tiene política RLS de INSERT para `authenticated` (verificado:
--  solo cargos_select_agent_auditor) — crear deuda contra una unidad es
--  privilegiado por diseño, hoy lo hace la Edge Function con service_role.
--  Esta función hereda ese privilegio, pero NO relaja el control de quién
--  puede aplicar: `auth.uid()` es un GUC de sesión y sobrevive dentro de un
--  SECURITY DEFINER, así que guard_liquidacion_transicion sigue exigiendo
--  rol administrador exactamente igual que si el UPDATE viniera del cliente.
--
--  ═══ LAS DOS BARRERAS CONTRA APLICAR ALGO DISTINTO A LO REVISADO ═══
--
--  Entre solicitar y aprobar pueden pasar horas o días. En ese lapso alguien
--  puede corregir un coeficiente, aprobar una novedad o cambiar el
--  presupuesto — y entonces aplicar produciría números distintos a los que
--  el administrador revisó. Dos barreras, deliberadamente distintas:
--
--    1. SELLO DE DATOS (esta migración, dentro de la transacción).
--       fn_liquidacion_sello_datos() resume en un md5 los datos de los que
--       depende el resultado. Se congela al crear la Pre-Liquidación y se
--       recalcula aquí, DESPUÉS de tomar el lock del periodo. Al estar
--       dentro de la transacción y del lock, no hay ventana: nadie puede
--       colarse entre la comprobación y la escritura.
--
--    2. SNAPSHOT HASH (packages/liquidation-engine/src/hash.ts).
--       El hash canónico del DataSnapshot con el que el motor calculó. Es
--       exacto —cubre exactamente lo que el motor leyó— pero solo
--       TypeScript sabe calcularlo, así que la Edge Function lo verifica
--       antes de llamar aquí y pasa el resultado en p_snapshot_hash.
--
--  Son complementarias a propósito: el sello es menos preciso pero corre
--  donde importa (dentro del lock); el hash es exacto pero se verifica
--  fuera. Ninguna sola bastaría.
--
--  ═══ LO QUE ESTA VERSIÓN TODAVÍA NO HACE ═══
--
--    · presupuesto_ejecucion (causación/caja)  → L4
--    · estados de cuenta por lote              → L5
--
--  Ambos entran DENTRO de esta misma función vía `create or replace`, no
--  como pasos posteriores: la promesa de "todo o nada" incluye también
--  esos dos efectos.
-- ═══════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════
--  1. El sello de datos
-- ═══════════════════════════════════════════════════════════════════════
-- Resume en un md5 todo aquello cuyo cambio alteraría el resultado de la
-- liquidación. No pretende ser el snapshot: pretende responder "¿sigue
-- siendo el mismo escenario que cuando se calculó?".
--
-- QUÉ CUBRE: la tabla de coeficientes vigente y sus valores, el conjunto de
-- unidades activas, los conceptos activos y su definición, el presupuesto
-- vigente, las novedades aprobadas que entran en el periodo, la política
-- financiera vigente y la fecha de vencimiento del periodo.
--
-- QUÉ NO CUBRE, y hay que saberlo: un cambio en una tabla que el motor lea
-- indirectamente y que no esté en esta lista pasaría inadvertido. Por eso
-- el sello NO sustituye al snapshot_hash de TypeScript (que sí cubre
-- exactamente lo que el motor leyó) — lo complementa cubriendo la ventana
-- temporal que aquel no puede cubrir. Si mañana el motor empieza a leer una
-- fuente nueva, esta función debe crecer con él.
--
-- Dónde se usa la fila entera (to_jsonb) y dónde columnas sueltas: en
-- conceptos y política financiera TODO afecta el cálculo, así que se hashea
-- la fila completa y una columna nueva queda cubierta sola. En inmuebles,
-- en cambio, sólo importa si la unidad participa: hashear la fila entera
-- haría que corregir un teléfono bloqueara la liquidación. El sesgo, cuando
-- hay duda, es hacia el falso positivo — pedir una simulación de más es
-- barato; aplicar sobre datos cambiados, no.

create function public.fn_liquidacion_sello_datos(
  p_tenant_id  uuid,
  p_periodo_id uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select md5(string_agg(parte, '|' order by orden, parte))
  from (
    -- Periodo: la fecha de vencimiento entra en el cálculo de mora.
    select 1 as orden,
           format('periodo:%s:%s', p.id, coalesce(p.fecha_vencimiento::text, '-')) as parte
    from public.periodos p
    where p.id = p_periodo_id

    union all
    -- Coeficientes: el reparto entero depende de estos valores.
    select 2, format('coef:%s:%s', c.inmueble_id, c.valor)
    from public.coeficientes c
    join public.coeficiente_sets s on s.id = c.set_id
    where s.tenant_id = p_tenant_id and s.estado = 'vigente'

    union all
    -- Unidades activas: sólo importa quién participa del reparto, no sus
    -- datos de contacto — si no, corregir un teléfono bloquearía la
    -- liquidación sin que nada del cálculo hubiera cambiado.
    select 3, format('inm:%s', i.id)
    from public.inmuebles i
    where i.tenant_id = p_tenant_id and i.estado = 'activo'

    union all
    -- Conceptos: la fila ENTERA, no una lista de columnas. Todo en un
    -- concepto entra en el cálculo (formula_ael, modo_calculo, prioridad,
    -- alcance, periodicidad, vigencias, valor_fijo...) y enumerarlas sería
    -- exactamente el tipo de lista que se queda obsoleta en silencio cuando
    -- alguien agregue una columna nueva.
    select 4, format('con:%s', to_jsonb(co)::text)
    from public.conceptos co
    where co.tenant_id = p_tenant_id and co.estado = 'activo'

    union all
    -- Presupuesto vigente del año del periodo.
    select 5, format('pre:%s:%s:%s', pr.id, pr.monto_total, pr.estado)
    from public.presupuestos pr
    join public.periodos p on p.id = p_periodo_id
    where pr.tenant_id = p_tenant_id and pr.anio = p.anio and pr.estado = 'vigente'

    union all
    -- Novedades aprobadas que entran en este periodo.
    select 6, format('nov:%s:%s:%s:%s:%s', n.id, n.inmueble_id, n.tipo, n.monto, n.estado)
    from public.novedades n
    join public.periodos p on p.id = p_periodo_id
    where n.tenant_id = p_tenant_id
      and n.estado = 'aprobada'
      and n.inhabilitada_at is null
      and n.fecha_efectiva <= (make_date(p.anio, p.mes, 1) + interval '1 month - 1 day')::date

    union all
    -- Política financiera: fila entera, por lo mismo que los conceptos —
    -- redondeo, mora, imputación y lo que se agregue después.
    select 7, format('pol:%s', to_jsonb(pf)::text)
    from public.politicas_financieras pf
    where pf.tenant_id = p_tenant_id and pf.estado = 'vigente'
  ) partes;
$$;

comment on function public.fn_liquidacion_sello_datos(uuid, uuid) is
  'Resumen md5 de los datos que determinan el resultado de liquidar un periodo. Se congela al '
  'crear la Pre-Liquidación y se recalcula dentro de fn_aplicar_liquidacion, ya con el lock del '
  'periodo tomado — así la comprobación "¿cambió algo desde que se revisó?" no tiene ventana. '
  'Complementa, no sustituye, al snapshot_hash de TypeScript: aquel es exacto pero se verifica '
  'fuera de la transacción. Si el motor empieza a leer una fuente nueva, esta función debe '
  'crecer con él.';


-- ═══════════════════════════════════════════════════════════════════════
--  2. Dónde se guarda el sello
-- ═══════════════════════════════════════════════════════════════════════

alter table public.liquidaciones add column sello_datos text;

comment on column public.liquidaciones.sello_datos is
  'fn_liquidacion_sello_datos() en el momento de calcular. Null en las liquidaciones anteriores '
  'a esta migración: para esas la comprobación se omite (no hay contra qué comparar) y así queda '
  'dicho, en vez de fingir que se validaron.';

-- El sello congela el escenario del cálculo: cambiarlo sería exactamente
-- lo que la comprobación busca impedir.
create or replace function public.guard_liquidacion_resultado_inmutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.tenant_id     is distinct from old.tenant_id
     or new.periodo_id    is distinct from old.periodo_id
     or new.result_hash   is distinct from old.result_hash
     or new.tenant_total  is distinct from old.tenant_total
     or new.snapshot      is distinct from old.snapshot
     or new.snapshot_hash is distinct from old.snapshot_hash
     or new.sello_datos   is distinct from old.sello_datos
     or new.simulada_por  is distinct from old.simulada_por
     or new.simulada_at   is distinct from old.simulada_at
  then
    raise exception 'LIQUIDACION_RESULTADO_INMUTABLE: la liquidación % no admite modificar el '
      'resultado ni el snapshot con que se calculó (20 §69) — corregir es volver a simular, '
      'que crea una liquidación nueva', old.id;
  end if;
  return new;
end;
$$;


-- ═══════════════════════════════════════════════════════════════════════
--  3. Aplicar
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_aplicar_liquidacion(
  p_liquidacion_id uuid,
  -- Hash del snapshot que la Edge Function recalculó y verificó contra la
  -- base viva. Opcional: null = no se verificó (llamada de sistema, fixture).
  p_snapshot_hash  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_liq             public.liquidaciones%rowtype;
  v_periodo         public.periodos%rowtype;
  v_sello_actual    text;
  v_bloqueos        text;
  v_avisos          jsonb;
  v_cargos_liq      int;
  v_cargos_novedad  int;
begin
  select * into v_liq from public.liquidaciones where id = p_liquidacion_id;
  if v_liq.id is null then
    raise exception 'LIQUIDACION_NO_ENCONTRADA: no existe la liquidación %', p_liquidacion_id;
  end if;

  if v_liq.estado <> 'pendiente_aprobacion' then
    raise exception 'LIQUIDACION_NO_PENDIENTE: la liquidación % está en estado "%" — solo se '
      'aplica una que esté pendiente de aprobación', p_liquidacion_id, v_liq.estado;
  end if;

  -- ── El lock ────────────────────────────────────────────────────────
  -- Serializa dos aplicaciones concurrentes del mismo periodo. Todo lo que
  -- viene después —comprobar y escribir— ocurre con este lock tomado, así
  -- que ninguna otra transacción puede colarse en medio.
  select * into v_periodo from public.periodos
   where id = v_liq.periodo_id
   for update;

  -- ── Barrera 1: el escenario no cambió ──────────────────────────────
  if v_liq.sello_datos is not null then
    v_sello_actual := public.fn_liquidacion_sello_datos(v_liq.tenant_id, v_liq.periodo_id);
    if v_sello_actual is distinct from v_liq.sello_datos then
      raise exception 'LIQUIDACION_DATOS_CAMBIARON: los datos cambiaron desde que se calculó '
        'esta Pre-Liquidación (coeficientes, conceptos, novedades, presupuesto o política). '
        'Aplicarla ahora produciría números distintos a los revisados — vuelve a simular.';
    end if;
  end if;

  -- ── Barrera 2: el snapshot que verificó la Edge Function ───────────
  if p_snapshot_hash is not null
     and v_liq.snapshot_hash is not null
     and p_snapshot_hash is distinct from v_liq.snapshot_hash then
    raise exception 'LIQUIDACION_SNAPSHOT_DESACTUALIZADO: el snapshot actual (%) no coincide con '
      'el que se calculó (%) — vuelve a simular.', p_snapshot_hash, v_liq.snapshot_hash;
  end if;

  -- ── Los gates, otra vez y aquí dentro ──────────────────────────────
  -- La pantalla ya los mostró, pero eso fue antes. Esta es la comprobación
  -- que cuenta: corre con el lock tomado y en la misma transacción que
  -- escribe.
  select string_agg(format('%s (%s)', titulo, codigo), '; ' order by codigo)
    into v_bloqueos
  from public.fn_liquidacion_prevuelo(v_liq.tenant_id, v_liq.periodo_id, v_liq.id)
  where severidad = 'bloqueo';

  if v_bloqueos is not null then
    raise exception 'LIQUIDACION_PREVUELO_BLOQUEADO: no se puede aplicar — %', v_bloqueos;
  end if;

  -- Los avisos vigentes AHORA (no los de cuando se solicitó) quedan
  -- congelados como parte del acto: es la respuesta a "¿sabíamos esto
  -- cuando liquidamos?".
  select coalesce(jsonb_agg(jsonb_build_object(
           'codigo', codigo, 'titulo', titulo, 'detalle', detalle
         ) order by codigo), '[]'::jsonb)
    into v_avisos
  from public.fn_liquidacion_prevuelo(v_liq.tenant_id, v_liq.periodo_id, v_liq.id)
  where severidad = 'aviso';

  -- ── El estado, antes de escribir nada ──────────────────────────────
  -- Primero porque guard_liquidacion_transicion valida aquí el rol
  -- administrador: si quien llama no puede aplicar, conviene saberlo antes
  -- de generar mil cargos que habría que revertir. El rollback los
  -- revertiría igual, pero el error sale limpio y temprano.
  update public.liquidaciones
     set estado = 'aplicada',
         avisos_aceptados = v_avisos
   where id = p_liquidacion_id;

  -- ── Cargos de la liquidación ───────────────────────────────────────
  -- Traducción directa de registrarCargosDeLiquidacion() (TypeScript) a un
  -- INSERT ... SELECT. Las líneas en cero no generan cargo: cargos tiene
  -- check (monto_original <> 0), y un cargo de cero no es una deuda.
  insert into public.cargos (
    tenant_id, inmueble_id, periodo_id, categoria, origen_tipo,
    liquidacion_linea_id, concepto_id, monto_original
  )
  select ll.tenant_id, ll.inmueble_id, v_liq.periodo_id, 'capital', 'liquidacion_linea',
         ll.id, ll.concepto_id, ll.monto
  from public.liquidacion_lineas ll
  where ll.liquidacion_id = p_liquidacion_id
    and ll.monto <> 0;
  get diagnostics v_cargos_liq = row_count;

  -- ── Cargos de novedades permanentes/prorrateables ──────────────────
  -- Las novedades no las evalúa el motor (temporal.ts las excluye siempre):
  -- son cargos que se generan directo contra el ledger. Antes era un paso
  -- aparte DESPUÉS de guardar, con el riesgo explícito de quedarse a medias;
  -- ahora entra en la misma transacción. La función es idempotente, así que
  -- un reintento tras un rollback no duplica nada.
  v_cargos_novedad := public.fn_generar_cargos_novedades_periodo(v_liq.tenant_id, v_liq.periodo_id);

  -- ── Cerrar el periodo ──────────────────────────────────────────────
  -- Dos pasos porque guard_periodo_transicion solo admite saltos de uno.
  -- Esto es lo que la Edge Function nunca hizo (decisión documentada de
  -- entonces: sin transacción, mover el estado arriesgaba dejar el periodo
  -- atascado si algo fallaba después). Con todo dentro de una transacción,
  -- esa objeción desaparece.
  update public.periodos set estado = 'en_liquidacion' where id = v_liq.periodo_id;
  update public.periodos
     set estado = 'cerrado', cerrado_at = now(), cerrado_por = (select auth.uid())
   where id = v_liq.periodo_id;

  -- L4 (presupuesto_ejecucion) y L5 (estados de cuenta) se insertan aquí,
  -- dentro de esta misma transacción.

  return jsonb_build_object(
    'liquidacion_id',   p_liquidacion_id,
    'periodo_id',       v_liq.periodo_id,
    'tenant_total',     v_liq.tenant_total,
    'cargos_creados',   v_cargos_liq,
    'cargos_novedades', v_cargos_novedad,
    'avisos',           v_avisos
  );
end;
$$;

comment on function public.fn_aplicar_liquidacion(uuid, text) is
  'Aplica una liquidación pendiente de aprobación: cargos, cargos de novedades y cierre del '
  'periodo, todo en una transacción — o pasa entero, o no pasa nada. Toma lock del periodo, '
  'revalida el sello de datos y los gates de fn_liquidacion_prevuelo YA con el lock tomado, y '
  'congela los avisos vigentes en avisos_aceptados. SECURITY DEFINER porque cargos no admite '
  'INSERT vía RLS, pero auth.uid() sobrevive y guard_liquidacion_transicion sigue exigiendo rol '
  'administrador. L4 y L5 añaden presupuesto y estados de cuenta dentro de esta misma función.';

grant execute on function public.fn_aplicar_liquidacion(uuid, text) to authenticated;
