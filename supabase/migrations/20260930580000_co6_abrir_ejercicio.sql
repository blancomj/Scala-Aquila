-- ═══════════════════════════════════════════════════════════════════════
--  CO-6 · Apertura de ejercicio — fn_contable_abrir_ejercicio(tenant, anio)
--  (CO_06_cierre_apertura_correccion.md §3.5)
--
--  p_anio es el ejercicio NUEVO que se abre (simétrico con fn_contable_cerrar_ejercicio, donde
--  anio es el que se cierra); el ejercicio anterior es p_anio - 1.
--
--  A diferencia de CIERRE (que reversa clases 4/5/6 a cero), APERTURA REPRODUCE el saldo de
--  clases 1/2/3 tal cual quedó al cierre anterior — mismo lado (débito sigue débito, crédito
--  sigue crédito): es un saldo inicial, no una reversión. Misma agrupación por la tupla completa
--  de dimensiones que CIERRE, mismo motivo (COMPROBANTE_DIMENSION_REQUERIDA).
--
--  "Debe cuadrar por construcción" (§3.5): si el ejercicio anterior se cerró correctamente
--  (fn_contable_cerrar_ejercicio dejó su resultado reflejado en la cuenta RESULTADO_EJERCICIO,
--  clase 3), la identidad contable garantiza que clases 1+2+3 ya cuadran solas. Si no cuadra —
--  típicamente porque el ejercicio anterior nunca se cerró — es un problema DEL EJERCICIO
--  ANTERIOR, no de esta función (CONTABLE_APERTURA_DESCUADRADA), tal como indica el corte; no se
--  añade un código distinto para "el anterior no está cerrado" porque el propio descuadre ya lo
--  delata sin necesitar inventar otro.
--
--  Idempotente (§3.5, prueba 11): el índice único de origen de CO-2 lo garantiza a nivel de
--  datos, pero se verifica explícitamente antes de construir nada (mismo criterio que el cierre
--  de ejercicio) y, si ya existe, se devuelve su id sin duplicar ni fallar.
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_contable_abrir_ejercicio(p_tenant_id uuid, p_anio smallint)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anio_anterior    smallint;
  v_periodo_ene      public.periodos%rowtype;
  v_existente        uuid;
  v_tipo_apertura_id bigint;
  v_comp_id          uuid;
  v_linea            smallint := 0;
  v_total_debito     numeric(18,2) := 0;
  v_total_credito    numeric(18,2) := 0;
  v_grupo            record;
begin
  if not public.has_role(p_tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol auxiliar o administrador para abrir el ejercicio';
  end if;

  v_anio_anterior := p_anio - 1;

  insert into public.periodos (tenant_id, anio, mes)
  select p_tenant_id, p_anio, gs.mes
  from generate_series(1, 12) as gs(mes)
  on conflict (tenant_id, anio, mes) do nothing;

  select * into v_periodo_ene from public.periodos
  where tenant_id = p_tenant_id and anio = p_anio and mes = 1;

  select c.id into v_existente
  from public.contable_comprobante c
  where c.tenant_id = p_tenant_id and c.origen_modulo = 'contabilidad'
    and c.origen_entidad = 'ejercicio' and c.origen_id = v_periodo_ene.id
    and c.origen_evento = 'apertura_ejercicio';
  if v_existente is not null then
    return v_existente;
  end if;

  select id into v_tipo_apertura_id from public.lista_tipos
    where tipo = 'TIPO_COMPROBANTE' and codigo = 'APERTURA' and tenant_id is null;

  insert into public.contable_comprobante (
    tenant_id, periodo_id, tipo_id, anio, fecha, descripcion,
    origen_modulo, origen_entidad, origen_id, origen_evento, creado_por
  ) values (
    p_tenant_id, v_periodo_ene.id, v_tipo_apertura_id, p_anio, make_date(p_anio, 1, 1),
    'Apertura del ejercicio ' || p_anio,
    'contabilidad', 'ejercicio', v_periodo_ene.id, 'apertura_ejercicio', (select auth.uid())
  )
  returning id into v_comp_id;

  for v_grupo in
    select
      det.cuenta_id, det.tercero_id, det.centro_costo_id, det.fondo_id, det.inmueble_id,
      det.agrupacion_id,
      sum(det.debito) - sum(det.credito) as saldo_neto
    from public.contable_comprobante_detalle det
    join public.contable_comprobante c on c.id = det.comprobante_id
    join public.contable_cuenta cc on cc.id = det.cuenta_id
    where c.tenant_id = p_tenant_id and c.estado = 'contabilizado' and c.anio = v_anio_anterior
      and cc.clase in (1, 2, 3)
    group by det.cuenta_id, det.tercero_id, det.centro_costo_id, det.fondo_id, det.inmueble_id,
      det.agrupacion_id
    having sum(det.debito) - sum(det.credito) <> 0
  loop
    v_linea := v_linea + 1;
    if v_grupo.saldo_neto > 0 then
      insert into public.contable_comprobante_detalle (
        tenant_id, comprobante_id, linea, cuenta_id, debito, credito, descripcion,
        tercero_id, centro_costo_id, fondo_id, inmueble_id, agrupacion_id
      ) values (
        p_tenant_id, v_comp_id, v_linea, v_grupo.cuenta_id, v_grupo.saldo_neto, 0,
        'Apertura del ejercicio ' || p_anio,
        v_grupo.tercero_id, v_grupo.centro_costo_id, v_grupo.fondo_id, v_grupo.inmueble_id,
        v_grupo.agrupacion_id
      );
      v_total_debito := v_total_debito + v_grupo.saldo_neto;
    else
      insert into public.contable_comprobante_detalle (
        tenant_id, comprobante_id, linea, cuenta_id, debito, credito, descripcion,
        tercero_id, centro_costo_id, fondo_id, inmueble_id, agrupacion_id
      ) values (
        p_tenant_id, v_comp_id, v_linea, v_grupo.cuenta_id, 0, -v_grupo.saldo_neto,
        'Apertura del ejercicio ' || p_anio,
        v_grupo.tercero_id, v_grupo.centro_costo_id, v_grupo.fondo_id, v_grupo.inmueble_id,
        v_grupo.agrupacion_id
      );
      v_total_credito := v_total_credito + (-v_grupo.saldo_neto);
    end if;
  end loop;

  if v_total_debito <> v_total_credito then
    raise exception 'CONTABLE_APERTURA_DESCUADRADA: débito % ≠ crédito % al abrir el ejercicio % '
      '— revise el cierre del ejercicio %', v_total_debito, v_total_credito, p_anio, v_anio_anterior;
  end if;

  perform public.fn_contabilizar_comprobante(v_comp_id);

  insert into public.audit_log (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant_id, (select auth.uid()), 'contable.ejercicio.abierto', 'contable_comprobante',
    v_comp_id, jsonb_build_object('anio', p_anio, 'anio_anterior', v_anio_anterior)
  );

  return v_comp_id;
end;
$$;

comment on function public.fn_contable_abrir_ejercicio(uuid, smallint) is
  'CO-6 §3.5: reproduce (mismo lado débito/crédito, no reversa) el saldo de clases 1/2/3 al '
  'cierre del ejercicio p_anio-1, agrupado por (cuenta_id, tercero_id, centro_costo_id, '
  'fondo_id, inmueble_id, agrupacion_id) — mismo motivo que fn_contable_cerrar_ejercicio '
  '(COMPROBANTE_DIMENSION_REQUERIDA). Crea los 12 periodos del ejercicio nuevo si no existen '
  '(abierto por defecto). Idempotente por origen_evento=''apertura_ejercicio'' — una segunda '
  'llamada devuelve el comprobante ya existente sin duplicar. CONTABLE_APERTURA_DESCUADRADA si '
  'no cuadra (típicamente: el ejercicio anterior nunca se cerró).';
