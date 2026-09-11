-- ═══════════════════════════════════════════════════════════════════════
--  ADC-01 (2/2) — congela los avisos de alcance (dato sin clasificar) en
--  avisos_aceptados, con la misma garantía de auditoría que los avisos de
--  fn_liquidacion_prevuelo (20260830580000/20260901150000).
--
--  ═══ POR QUÉ NO VIVE EN fn_liquidacion_prevuelo ═══
--
--  El aviso de alcance lo calcula el motor (packages/liquidation-engine,
--  ADC-01 §3) evaluando el árbol de condiciones de cada concepto contra el
--  snapshot — es exactamente la regla que la cabecera de
--  fn_liquidacion_prevuelo prohíbe reimplementar en SQL ("las
--  reconciliaciones R1/R3/R4... LANZAN en vez de devolver... repetirlas
--  aquí sería una segunda implementación de la misma regla, que es
--  justo lo que se desincroniza con el tiempo"). aplicar-liquidacion/
--  index.ts YA recalcula el snapshot y corre liquidar() para verificar el
--  hash — el resultado de esa misma corrida trae calculado.resultado.
--  avisosAlcance, así que solo hace falta pasarlo hacia adentro.
--
--  ═══ ARIDAD (feedback_extender_funcion_pg_cambia_aridad) ═══
--
--  Agregar un parámetro con default igual crea un segundo overload si no se
--  hace DROP explícito de la firma vieja — confirmado contra el esquema
--  real (comment on function ...(uuid, text) en 20260901150000) antes de
--  escribir esto, no de memoria.
-- ═══════════════════════════════════════════════════════════════════════

drop function public.fn_aplicar_liquidacion(uuid, text);

create function public.fn_aplicar_liquidacion(
  p_liquidacion_id   uuid,
  p_snapshot_hash    text default null,
  -- [{codigo, titulo, detalle}] — mismo shape (sin severidad, siempre
  -- 'aviso' en este contexto) que ya usa v_avisos más abajo. Lo arma
  -- aplicar-liquidacion/index.ts agrupando por concepto — nunca por
  -- inmueble, o un periodo de 500 unidades produciría 500 filas.
  p_avisos_alcance   jsonb default null
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

  -- ADC-01: se suman los del motor a los de la base — mismo array, misma
  -- garantía. coalesce por si el llamador no manda nada (Edge Function
  -- vieja, o un periodo sin ningún concepto alcance='calculado').
  v_avisos := v_avisos || coalesce(p_avisos_alcance, '[]'::jsonb);

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

comment on function public.fn_aplicar_liquidacion(uuid, text, jsonb) is
  'Aplica una liquidación pendiente de aprobación: cargos, cargos de novedades, cierre del periodo '
  'y emisión de los estados de cuenta — todo en una transacción, o pasa entero o no pasa nada. No '
  'escribe en presupuesto_ejecucion: el ejecutado se DERIVA de los cargos (causación) o de las '
  'aplicaciones de pago (caja) en presupuesto_cuenta_ejecucion(), así que insertar filas aquí '
  'duplicaría el ingreso — es justo lo que impide guard_presupuesto_ejecucion_cuenta. '
  '20260901150000: guard atómico UPDATE...WHERE estado + FOUND contra doble aplicación '
  'concurrente, mismo patrón que fn_aprobar_novedad (S1). '
  'ADC-01 (20260932890000): p_avisos_alcance recibe los avisos de "dato sin clasificar" que el '
  'motor (TypeScript) calculó en esta misma corrida — se funden con los de fn_liquidacion_prevuelo '
  'antes de congelarlos en avisos_aceptados, nunca reimplementados en SQL (ver cabecera).';
