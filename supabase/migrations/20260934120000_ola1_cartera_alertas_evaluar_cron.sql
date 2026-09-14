-- ═══════════════════════════════════════════════════════════════════════
--  OLA 1 · Cartera empieza a notificar (3/3) — evaluación + cron.
--
--  cartera_alertas_evaluar(): mismo patrón que finanzas_alertas_evaluar()
--  (20260932620000) — dispatch fijo por código, SOLO inserta en
--  cartera_alerta_emitida (append-only, ON CONFLICT DO NOTHING), nunca
--  actualiza ningún otro estado. A diferencia de finanzas, no itera
--  reglas configurables: llama fn_alertas_cartera() UNA vez y compara sus
--  4 conteos contra cero — el "dispatch" es la propia función SQL que ya
--  existe, no un catálogo de reglas por evaluar.
--
--  cron_cartera_alertas_diario(): SQL puro, sin Vault ni net.http_post —
--  a diferencia de cron_cartera_recalcular_diario() (que sí necesita una
--  Edge Function porque reclasifica con lógica de aplicación,
--  20260823...), evaluar 4 conteos contra cero no tiene lógica de
--  aplicación que justifique salir de la base. Reutiliza
--  cartera_corridas_diarias (ya existe) como guarda de "ya corrió hoy",
--  con origen='alertas' distinto del origen='cron' que ya usa el
--  recalculo diario — mismo tenant y fecha, dos corridas independientes,
--  no deben pisarse.
-- ═══════════════════════════════════════════════════════════════════════

create function public.cartera_alertas_evaluar(p_tenant_id uuid, p_fecha date default current_date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alertas  record;
  v_emitidas int := 0;
  v_tipo_id  bigint;
begin
  select * into v_alertas from public.fn_alertas_cartera(p_tenant_id, p_fecha);

  if v_alertas.obligaciones_mayor_90_cantidad > 0 then
    select id into v_tipo_id from public.lista_tipos
      where tipo = 'TIPO_ALERTA_CARTERA' and codigo = 'obligaciones_mayor_90';
    insert into public.cartera_alerta_emitida (tenant_id, tipo_id, fecha_emision, detalle)
    values (p_tenant_id, v_tipo_id, p_fecha, jsonb_build_object(
      'cantidad', v_alertas.obligaciones_mayor_90_cantidad,
      'monto', v_alertas.obligaciones_mayor_90_monto
    ))
    on conflict (tenant_id, tipo_id, fecha_emision) do nothing;
    if found then v_emitidas := v_emitidas + 1; end if;
  end if;

  if v_alertas.promesas_por_vencer_cantidad > 0 then
    select id into v_tipo_id from public.lista_tipos
      where tipo = 'TIPO_ALERTA_CARTERA' and codigo = 'promesas_por_vencer';
    insert into public.cartera_alerta_emitida (tenant_id, tipo_id, fecha_emision, detalle)
    values (p_tenant_id, v_tipo_id, p_fecha, jsonb_build_object(
      'cantidad', v_alertas.promesas_por_vencer_cantidad,
      'monto', v_alertas.promesas_por_vencer_monto
    ))
    on conflict (tenant_id, tipo_id, fecha_emision) do nothing;
    if found then v_emitidas := v_emitidas + 1; end if;
  end if;

  if v_alertas.cuotas_acuerdo_vencidas_cantidad > 0 then
    select id into v_tipo_id from public.lista_tipos
      where tipo = 'TIPO_ALERTA_CARTERA' and codigo = 'cuotas_acuerdo_vencidas';
    insert into public.cartera_alerta_emitida (tenant_id, tipo_id, fecha_emision, detalle)
    values (p_tenant_id, v_tipo_id, p_fecha, jsonb_build_object(
      'cantidad', v_alertas.cuotas_acuerdo_vencidas_cantidad,
      'monto', v_alertas.cuotas_acuerdo_vencidas_monto
    ))
    on conflict (tenant_id, tipo_id, fecha_emision) do nothing;
    if found then v_emitidas := v_emitidas + 1; end if;
  end if;

  if v_alertas.obligaciones_sin_vencimiento_cantidad > 0 then
    select id into v_tipo_id from public.lista_tipos
      where tipo = 'TIPO_ALERTA_CARTERA' and codigo = 'obligaciones_sin_vencimiento';
    insert into public.cartera_alerta_emitida (tenant_id, tipo_id, fecha_emision, detalle)
    values (p_tenant_id, v_tipo_id, p_fecha, jsonb_build_object(
      'cantidad', v_alertas.obligaciones_sin_vencimiento_cantidad,
      'monto', v_alertas.obligaciones_sin_vencimiento_monto
    ))
    on conflict (tenant_id, tipo_id, fecha_emision) do nothing;
    if found then v_emitidas := v_emitidas + 1; end if;
  end if;

  return v_emitidas;
end;
$$;

comment on function public.cartera_alertas_evaluar(uuid, date) is
  'Ola 1 §2.2: evalúa las 4 condiciones fijas de fn_alertas_cartera para un tenant y emite en '
  'cartera_alerta_emitida — SOLO inserta, idempotente por (tenant, tipo, día), nunca cambia otro '
  'estado (DI-09). Sin dispatch por tabla de reglas: las 4 condiciones son fijas, no '
  'configurables por tenant.';

create function public.cron_cartera_alertas_diario()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant     record;
  v_procesados int := 0;
begin
  for v_tenant in
    select t.id from public.tenants t where t.status = 'active'
  loop
    begin
      insert into public.cartera_corridas_diarias (tenant_id, fecha_corte, origen)
      values (v_tenant.id, current_date, 'alertas')
      on conflict (tenant_id, fecha_corte, origen) do nothing;

      if found then
        perform public.cartera_alertas_evaluar(v_tenant.id, current_date);
      end if;
      v_procesados := v_procesados + 1;
    exception when others then
      raise warning 'OLA1_CRON_ALERTAS_FALLIDO: tenant % — %', v_tenant.id, sqlerrm;
    end;
  end loop;

  raise notice 'OLA1_CRON_ALERTAS_CARTERA: % tenants procesados', v_procesados;
end;
$$;

revoke execute on function public.cron_cartera_alertas_diario() from public, anon, authenticated;
revoke execute on function public.cartera_alertas_evaluar(uuid, date) from public, anon, authenticated;

comment on function public.cron_cartera_alertas_diario() is
  'Ola 1 §2.2 — corrida diaria de alertas de cartera, todo tenant activo. Un tenant que falla '
  '(raise warning) no detiene a los demás. Corre vía pg_cron (job "cartera-alertas-diario"), '
  'mismo mecanismo que cron_finanzas_flujo_alertas_diario.';

select cron.schedule(
  'cartera-alertas-diario',
  '15 11 * * *',
  $$select public.cron_cartera_alertas_diario()$$
);
