-- ═══════════════════════════════════════════════════════════════════════
--  FIN-4 · Flujo de caja proyectado y alertas de liquidez (7/8)
--
--  finanzas_alertas_evaluar(): dispatch fijo por código de TIPO_ALERTA_
--  LIQUIDEZ, sobre finanzas_flujo_proyectado/finanzas_facturas_pagables/
--  fn_evolucion_cartera_vencida — ninguna consulta nueva sobre tablas
--  ajenas. SOLO inserta en finanzas_alerta_emitida (append-only, ON
--  CONFLICT DO NOTHING por (regla_id, fecha_emision)) — nunca actualiza
--  ningún otro estado (§3.5, misma regla que GOB-9: alertar es notificar).
--
--  cron_finanzas_flujo_alertas_diario(): mismo patrón que cron_mant_salud_
--  snapshot_mensual (MANT-9) — SQL puro, sin Vault ni net.http_post (a
--  diferencia de cartera, que sí necesita una Edge Function porque
--  recalcula snapshots con lógica de aplicación). revoke execute total:
--  solo pg_cron la dispara.
-- ═══════════════════════════════════════════════════════════════════════

create function public.finanzas_alertas_evaluar(p_tenant_id uuid, p_fecha date default current_date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_regla record;
  v_emitidas int := 0;
  v_saldo_30d numeric;
  v_semanas_negativas int;
  v_cxp_sin_lote numeric;
  v_evolucion record;
  v_anterior numeric;
  v_detalle jsonb;
  v_disparar boolean;
begin
  for v_regla in
    select r.*, lt.codigo as tipo_codigo
      from public.finanzas_alerta_regla r
      join public.lista_tipos lt on lt.id = r.tipo_id
     where r.tenant_id = p_tenant_id and r.activa
  loop
    v_disparar := false;
    v_detalle := '{}'::jsonb;

    case v_regla.tipo_codigo
      when 'saldo_30d_bajo_umbral' then
        select fp.saldo_acumulado into v_saldo_30d
          from public.finanzas_flujo_proyectado(p_tenant_id, 30, 'base', p_fecha::timestamptz) fp
         order by fp.semana desc limit 1;
        if v_saldo_30d is not null and v_regla.umbral is not null and v_saldo_30d < v_regla.umbral then
          v_disparar := true;
          v_detalle := jsonb_build_object('saldo_acumulado_30d', v_saldo_30d, 'umbral', v_regla.umbral);
        end if;

      when 'saldo_30d_negativo' then
        select fp.saldo_acumulado into v_saldo_30d
          from public.finanzas_flujo_proyectado(p_tenant_id, 30, 'base', p_fecha::timestamptz) fp
         order by fp.semana desc limit 1;
        if v_saldo_30d is not null and v_saldo_30d < 0 then
          v_disparar := true;
          v_detalle := jsonb_build_object('saldo_acumulado_30d', v_saldo_30d);
        end if;

      when 'flujo_neto_negativo_n_semanas' then
        if v_regla.semanas_consecutivas is not null then
          select count(*) into v_semanas_negativas
            from public.finanzas_flujo_proyectado(
                   p_tenant_id, greatest(90, v_regla.semanas_consecutivas * 7), 'base', p_fecha::timestamptz
                 ) fp
           where fp.flujo_neto < 0;
          if v_semanas_negativas >= v_regla.semanas_consecutivas then
            v_disparar := true;
            v_detalle := jsonb_build_object('semanas_negativas', v_semanas_negativas,
                           'umbral_semanas', v_regla.semanas_consecutivas);
          end if;
        end if;

      when 'cxp_vencida_sin_lote' then
        select coalesce(sum(f.total_neto_pagar), 0) into v_cxp_sin_lote
          from public.finanzas_facturas_pagables(p_tenant_id, p_fecha, true) f
         where not f.ya_en_lote;
        if v_regla.umbral is not null and v_cxp_sin_lote > v_regla.umbral then
          v_disparar := true;
          v_detalle := jsonb_build_object('cxp_vencida_sin_lote', v_cxp_sin_lote, 'umbral', v_regla.umbral);
        end if;

      when 'cartera_vencida_deteriorando' then
        select * into v_evolucion
          from public.fn_evolucion_cartera_vencida(p_tenant_id, p_fecha, 2) e
         order by e.mes desc limit 1;
        if v_evolucion.deuda_vencida is not null then
          select e.deuda_vencida into v_anterior
            from public.fn_evolucion_cartera_vencida(p_tenant_id, p_fecha, 2) e
           order by e.mes asc limit 1;
          if v_anterior is not null and v_evolucion.deuda_vencida > v_anterior then
            v_disparar := true;
            v_detalle := jsonb_build_object('deuda_vencida_actual', v_evolucion.deuda_vencida,
                           'deuda_vencida_anterior', v_anterior);
          end if;
        end if;

      else
        null; -- tipo desconocido: no dispara nada, no falla la corrida completa
    end case;

    if v_disparar then
      insert into public.finanzas_alerta_emitida (tenant_id, regla_id, fecha_emision, detalle)
      values (p_tenant_id, v_regla.id, p_fecha, v_detalle)
      on conflict (regla_id, fecha_emision) do nothing;
      if found then
        v_emitidas := v_emitidas + 1;
      end if;
    end if;
  end loop;

  return v_emitidas;
end;
$$;

comment on function public.finanzas_alertas_evaluar(uuid, date) is
  'FIN-4 §3.5: evalúa las reglas activas de un tenant y emite alertas — SOLO inserta en '
  'finanzas_alerta_emitida (idempotente por día), nunca cambia otro estado. Dispatch fijo por '
  'código de TIPO_ALERTA_LIQUIDEZ; un tipo desconocido no dispara nada y no rompe la corrida.';

create function public.cron_finanzas_flujo_alertas_diario()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant record;
  v_procesados int := 0;
begin
  for v_tenant in
    select t.id from public.tenants t where t.status = 'active'
  loop
    begin
      insert into public.finanzas_flujo_corridas_diarias (tenant_id, fecha_corte, origen)
      values (v_tenant.id, current_date, 'cron')
      on conflict (tenant_id, fecha_corte, origen) do nothing;

      if found then
        perform public.finanzas_alertas_evaluar(v_tenant.id, current_date);
      end if;
      v_procesados := v_procesados + 1;
    exception when others then
      raise warning 'FIN4_CRON_ALERTAS_FALLIDO: tenant % — %', v_tenant.id, sqlerrm;
    end;
  end loop;

  raise notice 'FIN4_CRON_ALERTAS: % tenants procesados', v_procesados;
end;
$$;

revoke execute on function public.cron_finanzas_flujo_alertas_diario() from public, anon, authenticated;
revoke execute on function public.finanzas_alertas_evaluar(uuid, date) from public, anon, authenticated;

comment on function public.cron_finanzas_flujo_alertas_diario() is
  'FIN-4 §3.5 — corrida diaria de alertas de liquidez, todo tenant activo. Un tenant que falla '
  '(raise warning) no detiene a los demás. Corre vía pg_cron (job '
  '"finanzas-flujo-alertas-diario"), mismo mecanismo que mant3_cron/mant9_salud/gob9.';

select cron.schedule(
  'finanzas-flujo-alertas-diario',
  '0 7 * * *',
  $$select public.cron_finanzas_flujo_alertas_diario()$$
);
