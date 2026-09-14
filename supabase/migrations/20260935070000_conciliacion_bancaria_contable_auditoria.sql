-- ═══════════════════════════════════════════════════════════════════════
--  Conciliación bancaria CONTABLE — Fase 7 (opcional, §7.7/§3.8 del prompt),
--  D-118/D-119. Control hermano de BANCOS_CONCILIACION_PENDIENTE (CTRL-BAN-001,
--  20260917100000): ese evalúa la conciliación #1 (recaudo, extracto_linea
--  pendiente); este evalúa la #4 (contable, banco↔libro) — glosario §2, no
--  confundir los dos.
--
--  BANCOS_CONCILIACION_CONTABLE_PENDIENTE detecta:
--   (a) conciliaciones en 'borrador' generadas hace más de 15 días y nunca
--       certificadas (mismo umbral que su hermano), y
--   (b) partidas no cruzadas (`conciliacion_bancaria_partida.resuelta = false`)
--       de más de 15 días — una nota débito/crédito sin llevar a un
--       comprobante, o un cheque/depósito en tránsito que nunca se aclaró.
--  Ambas cuentan hacia el mismo hallazgo (mismo criterio que
--  CONTABILIDAD_DESCUADRE, que también suma señales de distinta naturaleza
--  en un solo conteo).
--
--  Se reproduce la función completa (create or replace) porque Postgres no
--  permite parchear un solo branch de un plpgsql existente — mismo criterio
--  documentado en 20260930100000_fondo_auditoria.sql.
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
    'GUARDAS_INMUTABILIDAD_DESHABILITADAS',
    'FONDO_SIN_AUTORIZACION',
    'FONDO_COMPROMISO_EXCEDE_DISPONIBLE',
    'FONDO_CERRADO_CON_SALDO',
    'BANCOS_CONCILIACION_CONTABLE_PENDIENTE'
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
  -- Sin sesión de usuario (el cron) auth.uid() es null — se usa eso mismo
  -- para distinguir el origen en vez de que el llamador tenga que decirlo.
  v_origen        text := case when (select auth.uid()) is not null then 'manual' else 'cron' end;
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

  elsif v_control.codigo_automatico = 'FONDO_SIN_AUTORIZACION' then
    select count(*), coalesce(jsonb_agg(jsonb_build_object(
             'fondo_id', f.id, 'codigo', f.codigo, 'nombre', f.nombre, 'estado', f.estado
           )), '[]'::jsonb)
      into v_conteo, v_detalle
    from public.fondos f
    where f.tenant_id = v_control.tenant_id
      and f.naturaleza = 'destinacion_especifica'
      and f.estado not in ('propuesto', 'cancelado')
      and not exists (select 1 from public.fondo_autorizaciones fa where fa.fondo_id = f.id);
    v_resumen := format('%s fondo(s) de destinación específica activos sin autorización registrada.', v_conteo);
    v_nivel := 'ALTO';

  elsif v_control.codigo_automatico = 'FONDO_COMPROMISO_EXCEDE_DISPONIBLE' then
    select count(*), coalesce(jsonb_agg(jsonb_build_object(
             'fondo_id', f.id, 'codigo', f.codigo, 'saldo', s.saldo,
             'comprometido', s.comprometido, 'disponible', s.disponible
           )), '[]'::jsonb)
      into v_conteo, v_detalle
    from public.fondos f
    cross join lateral public.fn_fondo_saldos(f.id) s
    where f.tenant_id = v_control.tenant_id
      and s.disponible < 0;
    v_resumen := format('%s fondo(s) con comprometido superior al saldo (disponible negativo).', v_conteo);
    v_nivel := 'CRITICO';

  elsif v_control.codigo_automatico = 'FONDO_CERRADO_CON_SALDO' then
    select count(*), coalesce(jsonb_agg(jsonb_build_object(
             'fondo_id', f.id, 'codigo', f.codigo, 'saldo', s.saldo, 'comprometido', s.comprometido
           )), '[]'::jsonb)
      into v_conteo, v_detalle
    from public.fondos f
    cross join lateral public.fn_fondo_saldos(f.id) s
    where f.tenant_id = v_control.tenant_id
      and f.estado = 'cerrado'
      and (s.saldo <> 0 or s.comprometido <> 0);
    v_resumen := format('%s fondo(s) cerrado(s) con saldo o comprometido pendiente.', v_conteo);
    v_nivel := 'CRITICO';

  elsif v_control.codigo_automatico = 'BANCOS_CONCILIACION_CONTABLE_PENDIENTE' then
    declare
      v_borradores_viejos integer;
      v_borradores_detalle jsonb;
      v_partidas_viejas    integer;
      v_partidas_detalle   jsonb;
    begin
      select count(*), coalesce(jsonb_agg(jsonb_build_object(
               'conciliacion_id', id, 'cuenta_bancaria_id', cuenta_bancaria_id,
               'periodo_id', periodo_id, 'preparado_at', preparado_at
             )), '[]'::jsonb)
        into v_borradores_viejos, v_borradores_detalle
      from public.conciliacion_bancaria
      where tenant_id = v_control.tenant_id
        and estado = 'borrador'
        and preparado_at < now() - interval '15 days';

      select count(*), coalesce(jsonb_agg(jsonb_build_object(
               'partida_id', p.id, 'conciliacion_id', p.conciliacion_id,
               'origen', p.origen, 'monto', p.monto, 'created_at', p.created_at
             )), '[]'::jsonb)
        into v_partidas_viejas, v_partidas_detalle
      from public.conciliacion_bancaria_partida p
      where p.tenant_id = v_control.tenant_id
        and p.resuelta = false
        and p.created_at < now() - interval '15 days';

      v_conteo := v_borradores_viejos + v_partidas_viejas;
      v_detalle := jsonb_build_object(
        'borradores_sin_certificar', v_borradores_detalle,
        'partidas_no_cruzadas_sin_resolver', v_partidas_detalle
      );
      v_resumen := format(
        '%s conciliación(es) bancaria(s) contable(s) sin certificar y %s partida(s) no cruzada(s) sin resolver, ambas desde hace más de 15 días.',
        v_borradores_viejos, v_partidas_viejas
      );
    end;
    v_nivel := 'MEDIO';

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

  insert into public.auditoria_ejecuciones (tenant_id, engagement_id, resultado, observaciones, ejecutado_por, origen)
  values (v_control.tenant_id, p_engagement_id, v_resultado, v_resumen, (select auth.uid()), v_origen)
  returning id into v_ejecucion_id;

  if v_resultado = 'FAIL' then
    -- No duplicar: si ya hay un hallazgo abierto de este mismo control, la
    -- ejecución de hoy queda igual registrada arriba, pero no se crea un
    -- segundo hallazgo para la misma excepción sin resolver (§76-79 exige
    -- que correr esto todos los días no inunde la bandeja).
    select id into v_hallazgo_id
    from public.auditoria_hallazgos
    where tenant_id = v_control.tenant_id
      and control_id = p_control_id
      and estado not in ('CERRADO', 'RECHAZADO')
    order by created_at desc
    limit 1;

    if v_hallazgo_id is null then
      insert into public.auditoria_hallazgos (
        tenant_id, engagement_id, proceso, criterio, condicion, nivel,
        recomendacion, evidencia, control_id, created_by
      ) values (
        v_control.tenant_id, p_engagement_id, coalesce(v_control.proceso, v_control.nombre),
        v_control.objetivo, v_resumen, v_nivel,
        format('Revisar y corregir las %s excepción(es) detectadas por el control automático %s.',
               v_conteo, v_control.codigo_automatico),
        array[v_detalle::text], p_control_id, (select auth.uid())
      )
      returning id into v_hallazgo_id;
    end if;
  end if;

  return query select v_ejecucion_id, v_resultado, v_conteo, v_hallazgo_id;
end;
$$;

comment on function public.auditoria_control_ejecutar is
  'Continuous Control Monitoring — ejecuta la prueba SQL asociada a un control automático, registra el '
  'resultado y crea un hallazgo si hay excepciones y no hay ya uno abierto del mismo control (PROMPT '
  'AUDITORÍA §15, §42, §76-79; Prompt Fondos §37, §60 para los 3 códigos FONDO_*; §3.8/§7.7 del prompt '
  'de conciliación bancaria contable para BANCOS_CONCILIACION_CONTABLE_PENDIENTE, D-119). SECURITY '
  'INVOKER si hay sesión (RLS aplica); sin sesión (cron) corre con los privilegios de '
  'auditoria_ejecutar_controles_automaticos_diario(), que sí filtra por tenant.';
