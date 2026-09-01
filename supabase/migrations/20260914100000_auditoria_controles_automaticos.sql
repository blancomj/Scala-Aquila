-- ═══════════════════════════════════════════════════════════════════════
--  Controles automáticos de auditoría — Continuous Control Monitoring
--  (Prompt Maestro Modulo Auditoria AQUILA, §15-23, §42, §106)
--
--  Un auditoria_controles con automatizado=true puede llevar un
--  codigo_automatico que lo conecta a una prueba SQL real, dispatchada por
--  auditoria_control_ejecutar(). El resultado se registra en
--  auditoria_ejecuciones y, si hay excepciones, se crea automáticamente un
--  auditoria_hallazgos (§15 "el resultado debe crear automáticamente una
--  alerta/hallazgo según severidad").
--
--  Deliberadamente SECURITY INVOKER (no DEFINER): la función corre con los
--  permisos del que la llama. auditor/administrador ya tienen SELECT sobre
--  los datos operativos del tenant (D-19: "auditor = solo lectura en la
--  operación general del tenant") y las políticas de auditoria_ejecuciones/
--  auditoria_hallazgos ya exigen has_role(tenant,['auditor','administrador'])
--  para INSERT — no hace falta (ni conviene) elevar privilegios aquí.
--
--  5 controles implementados, elegidos porque son verificables con datos
--  reales existentes (no controles de juguete):
--    PERIODO_CERRADO_CON_MOVIMIENTOS — gap real: nada bloquea insertar
--      cargos/presupuesto_ejecucion en un período cerrado/bloqueado.
--    CARTERA_SOBREAPLICACION — defensa en profundidad sobre
--      guard_pago_aplicacion_no_excede (verifica que nunca se haya
--      esquivado, vía v_cargo_saldo.monto_pendiente < 0).
--    PRESUPUESTO_VIGENTE_SIN_RUBROS — gap real: guard_presupuesto_reconciliado
--      solo exige que la suma cuadre, un presupuesto vigente con 0 rubros
--      pasa trivialmente si monto_total=0.
--    CONTABILIDAD_DESCUADRE — defensa en profundidad sobre la garantía
--      estructural de contable_movimientos() (contable_cuadre +
--      contable_parametrizacion_pendiente).
--    SEGURIDAD_CAMBIOS_PRIVILEGIOS — informativo, nunca FAIL (§26 "no
--      convertir heurísticas en acusaciones"): reporta cambios de rol en
--      audit_log como REVIEW, sin crear hallazgo automático.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.auditoria_controles
  add column codigo_automatico text
  check (codigo_automatico in (
    'PERIODO_CERRADO_CON_MOVIMIENTOS',
    'CARTERA_SOBREAPLICACION',
    'PRESUPUESTO_VIGENTE_SIN_RUBROS',
    'CONTABILIDAD_DESCUADRE',
    'SEGURIDAD_CAMBIOS_PRIVILEGIOS'
  ));

comment on column public.auditoria_controles.codigo_automatico is
  'Identificador de la prueba SQL real que ejecuta auditoria_control_ejecutar() cuando automatizado=true. '
  'Lista cerrada — un código nuevo requiere implementar su rama en la función (PROMPT AUDITORÍA §15).';

create function public.auditoria_control_ejecutar(p_control_id uuid, p_engagement_id uuid)
returns table (ejecucion_id uuid, resultado text, conteo integer, hallazgo_id uuid)
language plpgsql
as $$
declare
  v_control       public.auditoria_controles%rowtype;
  v_engagement    public.auditoria_engagements%rowtype;
  v_conteo        integer := 0;
  v_detalle       jsonb := '[]'::jsonb;
  v_resultado     text;
  v_nivel         text;
  v_resumen       text;
  v_ejecucion_id  uuid;
  v_hallazgo_id   uuid;
begin
  select * into v_control from public.auditoria_controles where id = p_control_id;
  if not found then
    raise exception 'AUD-CTRL: control % no existe', p_control_id;
  end if;
  if v_control.codigo_automatico is null then
    raise exception 'AUD-CTRL: el control % no tiene codigo_automatico configurado', p_control_id;
  end if;

  select * into v_engagement from public.auditoria_engagements where id = p_engagement_id;
  if not found then
    raise exception 'AUD-CTRL: auditoría % no existe', p_engagement_id;
  end if;
  if v_engagement.tenant_id <> v_control.tenant_id then
    raise exception 'AUD-CTRL: el control y la auditoría pertenecen a tenants distintos';
  end if;

  if v_control.codigo_automatico = 'PERIODO_CERRADO_CON_MOVIMIENTOS' then
    select count(*), coalesce(jsonb_agg(jsonb_build_object(
             'origen', origen, 'id', id, 'periodo_id', periodo_id, 'fecha', fecha
           )), '[]'::jsonb)
      into v_conteo, v_detalle
    from (
      select 'cargo' as origen, c.id, c.periodo_id, c.created_at as fecha
      from public.cargos c
      join public.periodos per on per.id = c.periodo_id
      where c.tenant_id = v_control.tenant_id
        and per.estado in ('cerrado', 'bloqueado')
        and per.cerrado_at is not null
        and c.created_at > per.cerrado_at
      union all
      select 'presupuesto_ejecucion' as origen, pe.id, pe.periodo_id, pe.created_at as fecha
      from public.presupuesto_ejecucion pe
      join public.periodos per on per.id = pe.periodo_id
      where pe.tenant_id = v_control.tenant_id
        and per.estado in ('cerrado', 'bloqueado')
        and per.cerrado_at is not null
        and pe.created_at > per.cerrado_at
    ) excepciones;
    v_resumen := format('%s movimiento(s) registrados en un período cerrado/bloqueado.', v_conteo);
    v_nivel := 'ALTO';

  elsif v_control.codigo_automatico = 'CARTERA_SOBREAPLICACION' then
    select count(*), coalesce(jsonb_agg(jsonb_build_object(
             'cargo_id', id, 'inmueble_id', inmueble_id, 'monto_pendiente', monto_pendiente
           )), '[]'::jsonb)
      into v_conteo, v_detalle
    from public.v_cargo_saldo
    where tenant_id = v_control.tenant_id and monto_pendiente < 0;
    v_resumen := format('%s cargo(s) con saldo pendiente negativo (aplicación superior al cargo).', v_conteo);
    v_nivel := 'CRITICO';

  elsif v_control.codigo_automatico = 'PRESUPUESTO_VIGENTE_SIN_RUBROS' then
    select count(*), coalesce(jsonb_agg(jsonb_build_object(
             'presupuesto_id', id, 'anio', anio, 'estado', estado
           )), '[]'::jsonb)
      into v_conteo, v_detalle
    from public.presupuestos pr
    where pr.tenant_id = v_control.tenant_id
      and pr.estado in ('aprobado', 'vigente')
      and not exists (select 1 from public.presupuesto_rubros pru where pru.presupuesto_id = pr.id);
    v_resumen := format('%s presupuesto(s) aprobado/vigente sin rubros definidos.', v_conteo);
    v_nivel := 'MEDIO';

  elsif v_control.codigo_automatico = 'CONTABILIDAD_DESCUADRE' then
    declare
      v_cuadre record;
      v_pendientes integer;
    begin
      select * into v_cuadre
      from public.contable_cuadre(v_control.tenant_id, date_trunc('year', now())::date, now()::date);
      select count(*) into v_pendientes
      from public.contable_parametrizacion_pendiente(v_control.tenant_id);

      v_conteo := (case when coalesce(v_cuadre.diferencia, 0) <> 0 then 1 else 0 end)
                + coalesce(v_cuadre.sin_cuenta, 0)
                + v_pendientes;
      v_detalle := jsonb_build_object(
        'diferencia', v_cuadre.diferencia,
        'sin_cuenta', v_cuadre.sin_cuenta,
        'parametrizacion_pendiente', v_pendientes
      );
      v_resumen := format(
        'Diferencia contable: %s. Líneas sin cuenta: %s. Parametrización pendiente: %s.',
        coalesce(v_cuadre.diferencia, 0), coalesce(v_cuadre.sin_cuenta, 0), v_pendientes
      );
    end;
    v_nivel := 'CRITICO';

  elsif v_control.codigo_automatico = 'SEGURIDAD_CAMBIOS_PRIVILEGIOS' then
    select count(*), coalesce(jsonb_agg(jsonb_build_object(
             'accion', action, 'actor_id', actor_id, 'fecha', created_at, 'metadata', metadata
           )), '[]'::jsonb)
      into v_conteo, v_detalle
    from public.audit_log
    where tenant_id = v_control.tenant_id
      and action in (
        'membership.role_changed', 'membership.created', 'membership.revoked',
        'membership_rol_funcional.asignado', 'membership_rol_funcional.revocado'
      )
      and created_at > now() - interval '30 days';
    v_resumen := format('%s cambio(s) de rol/privilegio en los últimos 30 días.', v_conteo);
    v_nivel := 'OBSERVACION';

  else
    raise exception 'AUD-CTRL: codigo_automatico % sin implementación', v_control.codigo_automatico;
  end if;

  -- SEGURIDAD_CAMBIOS_PRIVILEGIOS nunca es FAIL: es un reporte para revisión
  -- humana, no una acusación (§26, §59).
  if v_control.codigo_automatico = 'SEGURIDAD_CAMBIOS_PRIVILEGIOS' then
    v_resultado := case when v_conteo > 0 then 'REVIEW' else 'PASS' end;
  else
    v_resultado := case when v_conteo > 0 then 'FAIL' else 'PASS' end;
  end if;

  insert into public.auditoria_ejecuciones (tenant_id, engagement_id, resultado, observaciones, ejecutado_por)
  values (v_control.tenant_id, p_engagement_id, v_resultado, v_resumen, (select auth.uid()))
  returning id into v_ejecucion_id;

  if v_resultado = 'FAIL' then
    insert into public.auditoria_hallazgos (
      tenant_id, engagement_id, proceso, criterio, condicion, nivel,
      recomendacion, evidencia, created_by
    ) values (
      v_control.tenant_id, p_engagement_id, coalesce(v_control.proceso, v_control.nombre),
      v_control.objetivo, v_resumen, v_nivel,
      format('Revisar y corregir las %s excepción(es) detectadas por el control automático %s.',
             v_conteo, v_control.codigo_automatico),
      array[v_detalle::text], (select auth.uid())
    )
    returning id into v_hallazgo_id;
  end if;

  return query select v_ejecucion_id, v_resultado, v_conteo, v_hallazgo_id;
end;
$$;

comment on function public.auditoria_control_ejecutar is
  'Continuous Control Monitoring — ejecuta la prueba SQL asociada a un control automático, registra el '
  'resultado y crea un hallazgo si hay excepciones (PROMPT AUDITORÍA §15, §42). SECURITY INVOKER: corre '
  'con los permisos de quien llama, las políticas RLS existentes son la única puerta de acceso.';

grant execute on function public.auditoria_control_ejecutar(uuid, uuid) to authenticated;
