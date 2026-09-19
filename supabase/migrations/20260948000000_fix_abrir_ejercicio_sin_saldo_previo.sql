-- ═══════════════════════════════════════════════════════════════════════
--  Fix · fn_contable_abrir_ejercicio() fallaba para el PRIMER ejercicio real
--  de una copropiedad (hallazgo QA f21-03, 2026-09-18).
--
--  Cuando el tenant nunca tuvo un ejercicio anterior (o el anterior cerró
--  exactamente en cero), el loop de saldos de clases 1/2/3 no inserta
--  ninguna línea — el comprobante de apertura queda con encabezado pero sin
--  detalle, y fn_contabilizar_comprobante() rechaza con
--  COMPROBANTE_SIN_DETALLE ('tiene menos de dos líneas'). Los 12 periodos
--  del ejercicio nuevo ya habían quedado creados antes de esa excepción,
--  pero la excepción revierte TODA la transacción (incluida esa inserción),
--  así que el botón "Abrir ejercicio" quedaba permanentemente roto para
--  cualquier copropiedad sin historial.
--
--  Fix: si el loop no produjo ninguna línea, no hay nada que reproducir —
--  se descarta el encabezado vacío y se devuelve NULL en vez de intentar
--  contabilizarlo. Los 12 periodos (ya insertados antes de este punto,
--  siguen en la misma transacción) quedan creados igual; ese es todo el
--  efecto esperado cuando no hay saldo previo que abrir.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_contable_abrir_ejercicio(p_tenant_id uuid, p_anio smallint)
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

  -- Fix (2026-09-18): sin líneas no hay nada que reproducir -- primer ejercicio real de la
  -- copropiedad (v_anio_anterior nunca existió) o el anterior cerró exactamente en cero. Se
  -- descarta el encabezado vacío en vez de intentar contabilizarlo (fn_contabilizar_comprobante
  -- exige >= 2 líneas). Los 12 periodos de p_anio, insertados arriba en esta misma transacción,
  -- quedan creados igual.
  if v_linea = 0 then
    delete from public.contable_comprobante where id = v_comp_id;
    return null;
  end if;

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
  '(abierto por defecto), incluso cuando no hay nada que reproducir (primer ejercicio real de '
  'la copropiedad): en ese caso devuelve NULL sin comprobante de apertura, en vez de fallar '
  '(fix 2026-09-18, hallazgo QA f21-03). Idempotente por origen_evento=''apertura_ejercicio'' '
  'cuando SÍ hay comprobante — una segunda llamada devuelve el existente sin duplicar. '
  'CONTABLE_APERTURA_DESCUADRADA si no cuadra habiendo líneas (típicamente: el ejercicio '
  'anterior nunca se cerró correctamente).';
