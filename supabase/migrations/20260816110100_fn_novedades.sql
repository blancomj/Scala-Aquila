-- ═══════════════════════════════════════════════════════════════════════
--  fn_aprobar_novedad / fn_rechazar_novedad — RPCs para aprobar-novedad/
--  rechazar-novedad (Edge Functions).
--
--  A diferencia de fn_registrar_fuente_financiacion (SECURITY INVOKER —
--  RLS ya autorizaba esa escritura sin efecto colateral), aprobar una
--  novedad exige UPDATE novedades + INSERT cargos en la misma transacción
--  (AD-33) y novedades no tiene política UPDATE para `authenticated`
--  (ver 20260816110000). Estas RPC se invocan solo con el cliente
--  service_role de la Edge Function — mismo criterio que
--  guardarLiquidacion() escribiendo liquidaciones/liquidacion_lineas.
--  auth.uid() no resuelve nada en una conexión service_role, así que el
--  actor se recibe explícito como parámetro.
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_aprobar_novedad(p_novedad_id uuid, p_actor_id uuid)
returns public.novedades
language plpgsql
set search_path = ''
as $$
declare
  v_novedad public.novedades;
  v_anio int;
  v_mes int;
  v_periodo_id uuid;
begin
  select * into v_novedad from public.novedades where id = p_novedad_id;
  if v_novedad.id is null then
    raise exception 'NOVEDAD_NO_ENCONTRADA: % no existe', p_novedad_id;
  end if;

  v_anio := extract(year from v_novedad.fecha_efectiva);
  v_mes := extract(month from v_novedad.fecha_efectiva);

  select id into v_periodo_id
    from public.periodos
   where tenant_id = v_novedad.tenant_id and anio = v_anio and mes = v_mes;
  if v_periodo_id is null then
    raise exception 'PERIODO_NO_ENCONTRADO_PARA_FECHA_EFECTIVA: no existe periodo %-% para el '
      'tenant % (novedad %)', v_anio, v_mes, v_novedad.tenant_id, p_novedad_id;
  end if;

  update public.novedades
     set estado = 'aprobada', approved_by = p_actor_id, approved_at = now()
   where id = p_novedad_id
  returning * into v_novedad;

  -- AD-33: el cargo hereda el signo de novedades.monto (AD-30) — un
  -- DISCOUNT/CREDIT/REFUND negativo reduce el saldo del inmueble sin pasar
  -- por pago_aplicaciones (imputarPago() ya ignora cargos con
  -- montoPendiente <= 0, packages/liquidation-engine/src/cuenta-corriente.ts).
  insert into public.cargos (
    tenant_id, inmueble_id, periodo_id, categoria, origen_tipo, novedad_id, concepto_id, monto_original
  ) values (
    v_novedad.tenant_id, v_novedad.inmueble_id, v_periodo_id, 'otro', 'novedad', v_novedad.id,
    v_novedad.concepto_id, v_novedad.monto
  );

  return v_novedad;
end;
$$;

revoke execute on function public.fn_aprobar_novedad(uuid, uuid) from public, anon, authenticated;

create function public.fn_rechazar_novedad(p_novedad_id uuid, p_motivo text)
returns public.novedades
language plpgsql
set search_path = ''
as $$
declare
  v_novedad public.novedades;
begin
  update public.novedades
     set estado = 'rechazada', rejected_reason = p_motivo
   where id = p_novedad_id
  returning * into v_novedad;

  if v_novedad.id is null then
    raise exception 'NOVEDAD_NO_ENCONTRADA: % no existe', p_novedad_id;
  end if;

  return v_novedad;
end;
$$;

revoke execute on function public.fn_rechazar_novedad(uuid, text) from public, anon, authenticated;
