-- ═══════════════════════════════════════════════════════════════════════
--  Controles automáticos de auditoría — segunda tanda del catálogo §14
--  (Prompt Maestro Modulo Auditoria AQUILA §14-23, §42, §106).
--
--  Extiende auditoria_control_ejecutar() (20260914100000) con 4 códigos más.
--  Elegidos tras explorar el esquema real (no controles de juguete):
--
--    CARTERA_ANTICIPOS_SIN_APLICAR (CTRL-CAR-002) — gap real: un pago con
--      remanente sin aplicar (monto - Σpago_aplicaciones.monto > 0) puede
--      quedar así indefinidamente; nada lo señala hoy. El remanente no vive
--      en una columna — se calcula igual que fn_aplicar_anticipos().
--    BANCOS_CONCILIACION_PENDIENTE (CTRL-BAN-001) — gap real: una línea de
--      extracto_linea en estado='pendiente' puede envejecer sin que nadie
--      la resuelva (conciliar o descartar con motivo).
--    TERCEROS_PROVEEDOR_DUPLICADO (CTRL-CXP-001) — CxP como módulo no
--      existe todavía (verificado: sin tablas cuenta_por_pagar/obligacion/
--      documento_soporte), así que se implementa sobre lo que sí existe:
--      terceros con rol 'proveedor' (tenant_tercero_rol) que comparten
--      numero_documento bajo distinto tipo_identificacion_id — el unique
--      constraint (tenant_id, tipo_identificacion_id, numero_documento) no
--      cubre ese caso. Informativo, nunca FAIL (§85 "marcar
--      REQUIERE_REVISION, no acusar") — mismo tratamiento que
--      SEGURIDAD_CAMBIOS_PRIVILEGIOS.
--    GUARDAS_INMUTABILIDAD_DESHABILITADAS (CTRL-LIQ-001/002 + CTRL-CON-002)
--      — estos tres códigos del catálogo describen garantías que YA están
--      blindadas por triggers incondicionales, no por lógica de aplicación:
--        · guard_liquidacion_resultado_inmutable bloquea cualquier UPDATE a
--          los campos clave de liquidaciones (no solo tras aprobar) — cubre
--          CTRL-LIQ-002 tal cual.
--        · cargos/pagos/pago_aplicaciones/presupuesto_ejecucion son
--          append-only sin excepción (ni tienen columna updated_at) — un
--          período cerrado no necesita protección adicional porque nada se
--          modifica nunca, ninguna fila, en ningún estado. Cubre
--          CTRL-CON-002 tal cual.
--        · fn_crear_preliquidacion ya valida período/tenant al crear.
--      Implementar estos tres tal como los describe el catálogo sería un
--      control redundante contra una garantía que ya es absoluta. Lo que sí
--      aporta valor real es verificar que esas garantías siguen en pie: (a)
--      que los triggers de inmutabilidad no fueron eliminados/deshabilitados
--      (pg_trigger, la única forma en que alguien podría des-blindarlas), y
--      (b) que ninguna liquidación referencia hoy un período de otro tenant
--      (defensa en profundidad sobre fn_crear_preliquidacion, cubre
--      CTRL-LIQ-001 con datos reales en vez de solo confiar en la función).
-- ═══════════════════════════════════════════════════════════════════════

alter table public.auditoria_controles
  drop constraint auditoria_controles_codigo_automatico_check,
  add constraint auditoria_controles_codigo_automatico_check check (codigo_automatico in (
    'PERIODO_CERRADO_CON_MOVIMIENTOS',
    'CARTERA_SOBREAPLICACION',
    'PRESUPUESTO_VIGENTE_SIN_RUBROS',
    'CONTABILIDAD_DESCUADRE',
    'SEGURIDAD_CAMBIOS_PRIVILEGIOS',
    'CARTERA_ANTICIPOS_SIN_APLICAR',
    'BANCOS_CONCILIACION_PENDIENTE',
    'TERCEROS_PROVEEDOR_DUPLICADO',
    'GUARDAS_INMUTABILIDAD_DESHABILITADAS'
  ));

create or replace function public.auditoria_control_ejecutar(p_control_id uuid, p_engagement_id uuid)
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

  elsif v_control.codigo_automatico = 'CARTERA_ANTICIPOS_SIN_APLICAR' then
    select count(*), coalesce(jsonb_agg(jsonb_build_object(
             'pago_id', pago_id, 'inmueble_id', inmueble_id, 'fecha_pago', fecha_pago, 'monto_sin_aplicar', remanente
           )), '[]'::jsonb)
      into v_conteo, v_detalle
    from (
      select p.id as pago_id, p.inmueble_id, p.fecha_pago,
             p.monto - coalesce(sum(pa.monto), 0) as remanente
      from public.pagos p
      left join public.pago_aplicaciones pa on pa.pago_id = p.id
      where p.tenant_id = v_control.tenant_id
        and p.monto > 0
        and p.fecha_pago < (now() - interval '30 days')::date
      group by p.id, p.inmueble_id, p.fecha_pago, p.monto
      having p.monto - coalesce(sum(pa.monto), 0) > 0
    ) anticipos;
    v_resumen := format('%s pago(s) con saldo sin aplicar (anticipo) desde hace más de 30 días.', v_conteo);
    v_nivel := 'MEDIO';

  elsif v_control.codigo_automatico = 'BANCOS_CONCILIACION_PENDIENTE' then
    select count(*), coalesce(jsonb_agg(jsonb_build_object(
             'extracto_linea_id', id, 'fecha_movimiento', fecha_movimiento,
             'monto', monto, 'descripcion_banco', descripcion_banco
           )), '[]'::jsonb)
      into v_conteo, v_detalle
    from public.extracto_linea
    where tenant_id = v_control.tenant_id
      and estado = 'pendiente'
      and fecha_movimiento < (now() - interval '15 days')::date;
    v_resumen := format('%s línea(s) de extracto bancario sin conciliar desde hace más de 15 días.', v_conteo);
    v_nivel := 'MEDIO';

  elsif v_control.codigo_automatico = 'TERCEROS_PROVEEDOR_DUPLICADO' then
    select count(*), coalesce(jsonb_agg(jsonb_build_object(
             'numero_documento', numero_documento, 'tercero_ids', tercero_ids, 'tipos_identificacion', tipos
           )), '[]'::jsonb)
      into v_conteo, v_detalle
    from (
      select t.numero_documento,
             array_agg(distinct t.id) as tercero_ids,
             array_agg(distinct t.tipo_identificacion_id) as tipos
      from public.terceros t
      join public.tenant_tercero_rol ttr
        on ttr.tercero_id = t.id and ttr.tenant_id = v_control.tenant_id and ttr.vigente_hasta is null
      join public.lista_tipos rol on rol.id = ttr.rol_id
      where t.tenant_id = v_control.tenant_id
        and rol.tipo = 'PERSONA_COPROPIEDAD'
        and rol.codigo = 'proveedor'
      group by t.numero_documento
      having count(distinct t.tipo_identificacion_id) > 1
    ) duplicados;
    v_resumen := format(
      '%s número(s) de documento de proveedor registrados con más de un tipo de identificación.',
      v_conteo
    );
    v_nivel := 'MEDIO';

  elsif v_control.codigo_automatico = 'GUARDAS_INMUTABILIDAD_DESHABILITADAS' then
    declare
      v_guardas_ausentes integer;
      v_guardas_detalle  jsonb;
      v_liq_cruzadas     integer;
      v_liq_detalle      jsonb;
    begin
      -- (a) los triggers de inmutabilidad siguen presentes y activos. Es la
      -- única forma en que alguien podría des-blindar CTRL-LIQ-002/CON-002:
      -- eliminando o deshabilitando el trigger, nunca "editando una fila"
      -- (eso ya lo bloquea el propio trigger). No depende de v_control.tenant_id
      -- porque un trigger no es un dato por tenant.
      select count(*), coalesce(jsonb_agg(jsonb_build_object('tabla', tabla, 'guarda', guarda)), '[]'::jsonb)
        into v_guardas_ausentes, v_guardas_detalle
      from (
        select esperadas.tabla, esperadas.guarda
        from (values
          ('cargos', 'cargos_append_only'),
          ('pagos', 'pagos_append_only'),
          ('pago_aplicaciones', 'pago_aplicaciones_append_only'),
          ('presupuesto_ejecucion', 'presupuesto_ejecucion_append_only'),
          ('liquidaciones', 'guard_liquidacion_resultado_inmutable'),
          ('liquidaciones', 'guard_liquidacion_transicion')
        ) as esperadas(tabla, guarda)
        where not exists (
          select 1
          from pg_trigger tg
          join pg_class c on c.oid = tg.tgrelid
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public'
            and c.relname = esperadas.tabla
            and tg.tgname = esperadas.guarda
            and not tg.tgisinternal
            and tg.tgenabled <> 'D'
        )
      ) faltantes;

      -- (b) defensa en profundidad sobre fn_crear_preliquidacion (CTRL-LIQ-001):
      -- ninguna liquidación de este tenant debería referenciar un período de
      -- otro tenant. Esto sí es un dato real por tenant.
      select count(*), coalesce(jsonb_agg(jsonb_build_object(
               'liquidacion_id', l.id, 'periodo_id', l.periodo_id
             )), '[]'::jsonb)
        into v_liq_cruzadas, v_liq_detalle
      from public.liquidaciones l
      join public.periodos per on per.id = l.periodo_id
      where l.tenant_id = v_control.tenant_id and per.tenant_id <> l.tenant_id;

      v_conteo := v_guardas_ausentes + v_liq_cruzadas;
      v_detalle := jsonb_build_object(
        'guardas_ausentes', v_guardas_detalle,
        'liquidaciones_periodo_cruzado', v_liq_detalle
      );
      v_resumen := format(
        '%s guarda(s) de inmutabilidad ausente(s)/deshabilitada(s); %s liquidación(es) con período de otro tenant.',
        v_guardas_ausentes, v_liq_cruzadas
      );
    end;
    v_nivel := 'CRITICO';

  else
    raise exception 'AUD-CTRL: codigo_automatico % sin implementación', v_control.codigo_automatico;
  end if;

  -- SEGURIDAD_CAMBIOS_PRIVILEGIOS y TERCEROS_PROVEEDOR_DUPLICADO nunca son
  -- FAIL: son reportes para revisión humana, no una acusación (§26, §59, §85).
  if v_control.codigo_automatico in ('SEGURIDAD_CAMBIOS_PRIVILEGIOS', 'TERCEROS_PROVEEDOR_DUPLICADO') then
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
