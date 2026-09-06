-- ═══════════════════════════════════════════════════════════════════════
--  CO-6 · Reapertura de periodo — fn_contable_reabrir_periodo(tenant, periodo, motivo)
--  (CO_06_cierre_apertura_correccion.md §3.3)
--
--  has_role(['administrador']) estricto, NO 'auxiliar': "es una acción de mayor impacto" (§3.3),
--  mismo criterio que contable_castigo_cartera_insert_administrador (CO-7) — has_role ya expresa
--  "solo administrador" sin necesitar superset, no hace falta tocar la matriz de permisos.
--
--  Prohibida si el periodo está bloqueado (guard_contable_periodo_transicion de CO-2 ya lo
--  impide: solo permite cerrado→abierto, no bloqueado→abierto — se deja que el trigger lo
--  rechace con CONTABLE_PERIODO_TRANSICION_INVALIDA, no se duplica el guard aquí).
--  Prohibida si un periodo POSTERIOR ya está cerrado/bloqueado (corrompería la secuencia) y si
--  el ejercicio ya tiene comprobante CIERRE (reabrir un periodo de un ejercicio ya cerrado exige
--  antes deshacer el cierre del ejercicio, que este corte no implementa como operación inversa —
--  fuera de alcance, ver DECISIONES.md).
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_contable_reabrir_periodo(
  p_tenant_id uuid,
  p_periodo_id uuid,
  p_motivo text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_periodo   public.periodos%rowtype;
  v_posterior public.periodos%rowtype;
  v_cierre_id uuid;
begin
  if not public.has_role(p_tenant_id, array['administrador']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol administrador para reabrir un periodo contable';
  end if;

  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'CONTABLE_PERIODO_REAPERTURA_SIN_MOTIVO: reabrir el periodo % exige motivo',
      p_periodo_id;
  end if;

  select * into v_periodo from public.periodos
  where id = p_periodo_id and tenant_id = p_tenant_id;
  if v_periodo.id is null then
    raise exception 'PERIODO_INEXISTENTE: % no existe para este tenant', p_periodo_id;
  end if;

  select * into v_posterior from public.periodos
  where tenant_id = p_tenant_id
    and (anio * 12 + mes) > (v_periodo.anio * 12 + v_periodo.mes)
    and contable_estado in ('cerrado', 'bloqueado')
  order by anio, mes
  limit 1;
  if v_posterior.id is not null then
    raise exception 'CONTABLE_PERIODO_POSTERIOR_CERRADO: el periodo % (%-%) ya está %',
      v_posterior.id, v_posterior.anio, lpad(v_posterior.mes::text, 2, '0'), v_posterior.contable_estado;
  end if;

  select c.id into v_cierre_id
  from public.contable_comprobante c
  join public.lista_tipos lt on lt.id = c.tipo_id
  where c.tenant_id = p_tenant_id and lt.codigo = 'CIERRE' and c.estado = 'contabilizado'
    and c.anio = v_periodo.anio;
  if v_cierre_id is not null then
    raise exception 'CONTABLE_EJERCICIO_YA_CERRADO: el ejercicio % ya tiene comprobante de '
      'cierre (%) — deshaga el cierre del ejercicio antes de reabrir uno de sus periodos',
      v_periodo.anio, v_cierre_id;
  end if;

  update public.periodos
  set contable_estado = 'abierto', contable_reabierto_motivo = p_motivo
  where id = p_periodo_id;

  insert into public.audit_log (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant_id, (select auth.uid()), 'contable.periodo.reabierto', 'periodo', p_periodo_id,
    jsonb_build_object('motivo', p_motivo, 'anio', v_periodo.anio, 'mes', v_periodo.mes)
  );

  return p_periodo_id;
end;
$$;

comment on function public.fn_contable_reabrir_periodo(uuid, uuid, text) is
  'CO-6 §3.3: exige rol administrador (no auxiliar) y motivo no vacío. Bloquea si hay un periodo '
  'posterior cerrado/bloqueado (CONTABLE_PERIODO_POSTERIOR_CERRADO) o si el ejercicio ya tiene '
  'comprobante CIERRE (CONTABLE_EJERCICIO_YA_CERRADO). La transición cerrado→abierto en sí y el '
  'sellado de contable_reabierto_motivo los exige guard_contable_periodo_transicion (CO-2); '
  'bloqueado→abierto ya es rechazado por ese mismo guard, no se duplica aquí. Deja traza en '
  'audit_log (módulo existente, sin tabla propia — §3.3).';
