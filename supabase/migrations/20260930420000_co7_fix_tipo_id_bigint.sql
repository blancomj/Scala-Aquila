-- ═══════════════════════════════════════════════════════════════════════
--  CO-7 · Fix: v_tipo_id declarado uuid en fn_contable_reconocer_deterioro
--  cuando lista_tipos.id/contable_comprobante.tipo_id son bigint
--  (20260814160000_tipos_lista_tipos.sql, 20260930200000_co2_comprobante_nucleo.sql).
--
--  Encontrado por `supabase db lint --linked` antes de correr ninguna prueba (no en runtime):
--  "column tipo_id is of type bigint but expression is of type uuid". La migración ya aplicada
--  (20260930410000) se deja intacta — se corrige con create or replace, igual que los dos
--  fixes de CO-4 (20260930380000/20260930390000).
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_contable_reconocer_deterioro(
  p_tenant_id  uuid,
  p_periodo_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_periodo          public.periodos%rowtype;
  v_fecha_corte      date;
  v_existente        uuid;
  v_tipo_id          bigint;
  v_cuenta_gasto     uuid;
  v_cuenta_deterioro uuid;
  v_comp_id          uuid;
  v_total_ajuste     numeric(18, 2);
begin
  if not public.has_role(p_tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol auxiliar o administrador para reconocer '
      'deterioro de cartera';
  end if;

  select * into v_periodo from public.periodos where id = p_periodo_id and tenant_id = p_tenant_id;
  if v_periodo.id is null or v_periodo.contable_estado <> 'abierto' then
    raise exception 'CONTABLE_PERIODO_CERRADO: el periodo % no existe o no admite asientos',
      p_periodo_id;
  end if;

  v_fecha_corte := (make_date(v_periodo.anio, v_periodo.mes, 1) + interval '1 month - 1 day')::date;

  select id into v_existente from public.contable_comprobante
   where tenant_id = p_tenant_id and origen_modulo = 'contabilidad' and origen_entidad = 'deterioro'
     and origen_id = p_periodo_id and origen_evento = 'deterioro_periodo';
  if v_existente is not null then
    return v_existente;
  end if;

  select cd.contable_cuenta_id into v_cuenta_gasto
    from public.contable_cuenta_default cd
    join public.lista_tipos lt on lt.id = cd.evento_id
   where cd.tenant_id = p_tenant_id and lt.tipo = 'EVENTO_CONTABLE'
     and lt.codigo = 'GASTO_DETERIORO_CARTERA';
  select cd.contable_cuenta_id into v_cuenta_deterioro
    from public.contable_cuenta_default cd
    join public.lista_tipos lt on lt.id = cd.evento_id
   where cd.tenant_id = p_tenant_id and lt.tipo = 'EVENTO_CONTABLE'
     and lt.codigo = 'DETERIORO_CARTERA';
  if v_cuenta_gasto is null or v_cuenta_deterioro is null then
    raise exception 'CONTABLE_PARAMETRIZACION_PENDIENTE: GASTO_DETERIORO_CARTERA/'
      'DETERIORO_CARTERA no tienen cuenta contable predeterminada para este tenant';
  end if;

  select id into v_tipo_id from public.lista_tipos
   where tipo = 'TIPO_COMPROBANTE' and codigo = 'DETERIORO' and tenant_id is null;

  select coalesce(sum(ajuste), 0) into v_total_ajuste
    from public.contable_calcular_deterioro(p_tenant_id, v_fecha_corte);

  if v_total_ajuste = 0 then
    return null;
  end if;

  insert into public.contable_comprobante (
    tenant_id, periodo_id, tipo_id, anio, fecha, descripcion,
    origen_modulo, origen_entidad, origen_id, origen_evento, creado_por
  ) values (
    p_tenant_id, p_periodo_id, v_tipo_id, v_periodo.anio, v_fecha_corte,
    'Deterioro de cartera — periodo ' || v_periodo.anio || '-' || lpad(v_periodo.mes::text, 2, '0'),
    'contabilidad', 'deterioro', p_periodo_id, 'deterioro_periodo', (select auth.uid())
  )
  returning id into v_comp_id;

  if v_total_ajuste > 0 then
    insert into public.contable_comprobante_detalle (
      tenant_id, comprobante_id, linea, cuenta_id, debito, credito, descripcion
    ) values
      (p_tenant_id, v_comp_id, 1, v_cuenta_gasto, v_total_ajuste, 0,
       'Gasto por deterioro de cartera'),
      (p_tenant_id, v_comp_id, 2, v_cuenta_deterioro, 0, v_total_ajuste,
       'Deterioro de cartera (correctora)');
  else
    insert into public.contable_comprobante_detalle (
      tenant_id, comprobante_id, linea, cuenta_id, debito, credito, descripcion
    ) values
      (p_tenant_id, v_comp_id, 1, v_cuenta_deterioro, abs(v_total_ajuste), 0,
       'Reversión de deterioro de cartera'),
      (p_tenant_id, v_comp_id, 2, v_cuenta_gasto, 0, abs(v_total_ajuste),
       'Reversión de gasto por deterioro de cartera');
  end if;

  perform public.fn_contabilizar_comprobante(v_comp_id);

  insert into public.contable_deterioro_detalle (
    tenant_id, comprobante_id, inmueble_id, cuenta_cartera_id, saldo,
    deterioro_calculado, deterioro_reconocido_previo, ajuste
  )
  select p_tenant_id, v_comp_id, inmueble_id, cuenta_cartera_id, saldo,
    deterioro_calculado, deterioro_reconocido, ajuste
  from public.contable_calcular_deterioro(p_tenant_id, v_fecha_corte);

  return v_comp_id;
end;
$$;

comment on function public.fn_contable_reconocer_deterioro(uuid, uuid) is
  'Única vía para reconocer deterioro de cartera — arma un comprobante tipo DETERIORO y llama '
  'a fn_contabilizar_comprobante (mismo patrón que fn_mant_capitalizar_activo, MANT-0). '
  'Registra solo el ajuste contra lo ya reconocido (nunca el total, CO-7 §4.3 prueba 6); un '
  'ajuste negativo (recuperación de cartera) invierte débito/crédito. Idempotente por periodo '
  'vía origen_evento=deterioro_periodo. SECURITY DEFINER con verificación interna de has_role.';
