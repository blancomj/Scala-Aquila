-- ═══════════════════════════════════════════════════════════════════════
--  Hueco de test #1 (auditoría externa 2026-08-26, Docs/evaluacion/02 §7) —
--  fn_aplicar_liquidacion no protegía contra doble aplicación concurrente
--  con un guard explícito, mismo patrón que S1 (fn_aprobar_novedad,
--  20260831130000). El SELECT + chequeo `v_liq.estado <> 'pendiente_
--  aprobacion'` de siempre no es atómico: dos llamadas concurrentes pueden
--  ambas leer 'pendiente_aprobacion' antes de que ninguna la cambie.
--
--  El resultado final YA quedaba consistente hoy — pero por un efecto
--  colateral frágil, no por diseño: la segunda transacción se bloquea en el
--  `for update` del periodo, y cuando reanuda, `guard_liquidacion_
--  transicion` (20260830570000) SÍ hace no-op silencioso si `new.estado =
--  old.estado` ('aplicada'='aplicada') — un UPDATE ciego de estado='aplicada'
--  sin WHERE no lo detectaría. La protección real venía de que el segundo
--  intento terminaba insertando cargos duplicados de liquidacion_lineas
--  ANTES del update de periodo que sí fallaba (cerrado→en_liquidacion
--  inválida) — deshaciendo todo por rollback, pero con un mensaje de error
--  (INVALID_TRANSITION) que no dice nada sobre la liquidación en sí.
--
--  Fix: el mismo patrón — UPDATE con WHERE estado='pendiente_aprobacion' +
--  FOUND, movido al principio. Reusa el código de error que ya existía
--  (LIQUIDACION_NO_PENDIENTE, packages/shared/src/error-codes.ts:158) en
--  vez de inventar uno nuevo — el significado es el mismo, solo cambia
--  CÓMO se detecta. Mover el UPDATE de estado más temprano no cambia el
--  comportamiento de las validaciones posteriores (sello, snapshot,
--  prevuelo): si cualquiera falla, la excepción hace rollback de toda la
--  transacción — incluido este UPDATE — igual que hoy (transaccional, todo
--  o nada, ya documentado en el comment de la función).
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_aplicar_liquidacion(
  p_liquidacion_id uuid,
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
  v_modo            public.presupuesto_reconocimiento_ingreso_t;
  v_estados         int;
begin
  select * into v_liq from public.liquidaciones where id = p_liquidacion_id;
  if v_liq.id is null then
    raise exception 'LIQUIDACION_NO_ENCONTRADA: no existe la liquidación %', p_liquidacion_id;
  end if;

  -- Guard atómico contra doble aplicación concurrente (mismo patrón que S1):
  -- "leer el estado" y "cambiarlo" tienen que ser una sola operación. El
  -- SELECT de arriba solo da LIQUIDACION_NO_ENCONTRADA con buen mensaje; el
  -- guard real es este UPDATE — si otra transacción ya aplicó esta misma
  -- liquidación, WHERE no encuentra fila que actualizar y FOUND es false.
  update public.liquidaciones
     set estado = 'aplicada'
   where id = p_liquidacion_id and estado = 'pendiente_aprobacion'
  returning * into v_liq;

  if not found then
    raise exception 'LIQUIDACION_NO_PENDIENTE: la liquidación % no está pendiente de aprobación '
      '(aplicada por otra solicitud, o su estado cambió) — solo se aplica una que esté pendiente '
      'de aprobación', p_liquidacion_id;
  end if;

  select * into v_periodo from public.periodos
   where id = v_liq.periodo_id
   for update;

  if v_liq.sello_datos is not null then
    v_sello_actual := public.fn_liquidacion_sello_datos(v_liq.tenant_id, v_liq.periodo_id);
    if v_sello_actual is distinct from v_liq.sello_datos then
      raise exception 'LIQUIDACION_DATOS_CAMBIARON: los datos cambiaron desde que se calculó '
        'esta Pre-Liquidación (coeficientes, conceptos, novedades, presupuesto o política). '
        'Aplicarla ahora produciría números distintos a los revisados — vuelve a simular.';
    end if;
  end if;

  if p_snapshot_hash is not null
     and v_liq.snapshot_hash is not null
     and p_snapshot_hash is distinct from v_liq.snapshot_hash then
    raise exception 'LIQUIDACION_SNAPSHOT_DESACTUALIZADO: el snapshot actual (%) no coincide con '
      'el que se calculó (%) — vuelve a simular.', p_snapshot_hash, v_liq.snapshot_hash;
  end if;

  select string_agg(format('%s (%s)', titulo, codigo), '; ' order by codigo)
    into v_bloqueos
  from public.fn_liquidacion_prevuelo(v_liq.tenant_id, v_liq.periodo_id, v_liq.id)
  where severidad = 'bloqueo';

  if v_bloqueos is not null then
    raise exception 'LIQUIDACION_PREVUELO_BLOQUEADO: no se puede aplicar — %', v_bloqueos;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'codigo', codigo, 'titulo', titulo, 'detalle', detalle
         ) order by codigo), '[]'::jsonb)
    into v_avisos
  from public.fn_liquidacion_prevuelo(v_liq.tenant_id, v_liq.periodo_id, v_liq.id)
  where severidad = 'aviso';

  -- El estado ya quedó en 'aplicada' por el guard de arriba — solo falta
  -- avisos_aceptados, que depende del prevuelo recién calculado.
  update public.liquidaciones
     set avisos_aceptados = v_avisos
   where id = p_liquidacion_id;

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

  v_cargos_novedad := public.fn_generar_cargos_novedades_periodo(v_liq.tenant_id, v_liq.periodo_id);

  select pf.reconocimiento_ingreso into v_modo
  from public.politicas_financieras pf
  where pf.tenant_id = v_liq.tenant_id and pf.estado = 'vigente';
  v_modo := coalesce(v_modo, 'causacion');

  update public.periodos set estado = 'en_liquidacion' where id = v_liq.periodo_id;
  update public.periodos
     set estado = 'cerrado', cerrado_at = now(), cerrado_por = (select auth.uid())
   where id = v_liq.periodo_id;

  -- L5, al final: los estados de cuenta deben reflejar los cargos que se
  -- acaban de crear, así que se emiten con el ledger ya completo.
  v_estados := public.fn_emitir_estados_cuenta(p_liquidacion_id);

  return jsonb_build_object(
    'liquidacion_id',    p_liquidacion_id,
    'periodo_id',        v_liq.periodo_id,
    'tenant_total',      v_liq.tenant_total,
    'cargos_creados',    v_cargos_liq,
    'cargos_novedades',  v_cargos_novedad,
    'reconocimiento',    v_modo,
    'estados_emitidos',  v_estados,
    'avisos',            v_avisos
  );
end;
$$;

comment on function public.fn_aplicar_liquidacion(uuid, text) is
  'Aplica una liquidación pendiente de aprobación: cargos, cargos de novedades, cierre del periodo '
  'y emisión de los estados de cuenta — todo en una transacción, o pasa entero o no pasa nada. No '
  'escribe en presupuesto_ejecucion: el ejecutado se DERIVA de los cargos (causación) o de las '
  'aplicaciones de pago (caja) en presupuesto_cuenta_ejecucion(), así que insertar filas aquí '
  'duplicaría el ingreso — es justo lo que impide guard_presupuesto_ejecucion_cuenta. '
  '20260901150000: guard atómico UPDATE...WHERE estado + FOUND contra doble aplicación '
  'concurrente, mismo patrón que fn_aprobar_novedad (S1).';
