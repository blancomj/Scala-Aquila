-- ═══════════════════════════════════════════════════════════════════════
--  Automatización de controles automáticos — Continuous Control Monitoring
--  real (PROMPT AUDITORÍA §41, §76-79). Hasta esta migración los 9 controles
--  automáticos (20260914100000, 20260917100000) solo corrían con "Ejecutar
--  ahora": nada los disparaba solos.
--
--  A diferencia del cron de cartera (20260906160000), este NO necesita
--  cruzar a una Edge Function vía pg_net/Vault: auditoria_control_ejecutar()
--  ya es una función SQL pura, así que el disparador la llama directo. Más
--  simple y sin secretos que gestionar.
--
--  Dos problemas nuevos que trae correr esto sin supervisión humana:
--
--  1. Actor: auditoria_ejecuciones.ejecutado_por y auditoria_engagements.
--     created_by eran NOT NULL porque hasta ahora todo lo disparaba una
--     persona autenticada. Un cron no tiene auth.uid() — en vez de inventar
--     un "usuario sistema" y atribuirle acciones que no hizo (lo que
--     distorsionaría el propio rastro de auditoría), se vuelven NULLABLE
--     y se agrega `origen` ('manual'/'cron') para distinguir el caso,
--     mismo criterio que `creada_por` en acciones_cobranza (origen_accion_
--     cobranza_t) separado de `ejecutada_por`.
--
--  2. Duplicación: auditoria_control_ejecutar() creaba un hallazgo en CADA
--     ejecución con excepciones, sin mirar si ya había uno abierto. Bien
--     para un clic manual ocasional; corrido todos los días crearía un
--     hallazgo nuevo cada mañana para la MISMA excepción sin resolver.
--     Se agrega auditoria_hallazgos.control_id para poder preguntar "¿ya
--     hay uno abierto de este control?" y no duplicar — la ejecución igual
--     queda registrada en auditoria_ejecuciones cada vez, eso sí es el
--     rastro que importa conservar íntegro.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.auditoria_ejecuciones
  alter column ejecutado_por drop not null,
  add column origen text not null default 'manual' check (origen in ('manual', 'cron')),
  add constraint auditoria_ejecuciones_origen_actor_coherente check (
    (origen = 'manual' and ejecutado_por is not null)
    or (origen = 'cron' and ejecutado_por is null)
  );

comment on column public.auditoria_ejecuciones.origen is
  'manual: disparada por "Ejecutar ahora" de un auditor/administrador (ejecutado_por = quien la '
  'disparó). cron: disparada por auditoria_ejecutar_controles_automaticos_diario() sin sesión de '
  'usuario (ejecutado_por queda null — nadie la disparó, no se le atribuye a nadie).';

alter table public.auditoria_engagements
  alter column created_by drop not null;

comment on column public.auditoria_engagements.created_by is
  'Nullable: el engagement "Monitoreo continuo automático" (origen_tipo = ''cron_monitoreo_'
  'continuo'') lo crea el cron, sin usuario que atribuirle.';

alter table public.auditoria_hallazgos
  add column control_id uuid references public.auditoria_controles (id) on delete set null;

create index auditoria_hallazgos_control_idx
  on public.auditoria_hallazgos (tenant_id, control_id) where control_id is not null;

comment on column public.auditoria_hallazgos.control_id is
  'Qué control automático creó este hallazgo (null si es manual/no viene de un control). Permite '
  'a auditoria_control_ejecutar() detectar que ya hay un hallazgo abierto del mismo control y no '
  'duplicarlo en cada corrida del cron (PROMPT AUDITORÍA §76-79).';

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
  'AUDITORÍA §15, §42, §76-79). SECURITY INVOKER si hay sesión (RLS aplica); sin sesión (cron) corre '
  'con los privilegios de auditoria_ejecutar_controles_automaticos_diario(), que sí filtra por tenant.';

-- ── El disparo diario ─────────────────────────────────────────────────────
create function public.auditoria_ejecutar_controles_automaticos_diario()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_control        record;
  v_engagement_id  uuid;
  v_ejecutados     int := 0;
begin
  for v_control in
    select ac.id as control_id, ac.tenant_id
    from public.auditoria_controles ac
    join public.tenants t on t.id = ac.tenant_id
    where ac.automatizado = true
      and ac.codigo_automatico is not null
      and t.status = 'active'
    order by ac.tenant_id, ac.id
  loop
    begin
      -- Un engagement de monitoreo continuo por tenant, reutilizado día a
      -- día — no uno nuevo por corrida, que solo serviría para acumular
      -- registros vacíos entre auditorías puntuales de verdad.
      select id into v_engagement_id
      from public.auditoria_engagements
      where tenant_id = v_control.tenant_id and origen_tipo = 'cron_monitoreo_continuo'
      limit 1;

      if v_engagement_id is null then
        insert into public.auditoria_engagements (tenant_id, nombre, objetivo, estado, origen_tipo)
        values (
          v_control.tenant_id,
          'Monitoreo continuo automático',
          'Ejecución periódica de los controles automáticos (Continuous Control Monitoring, PROMPT AUDITORÍA §15, §76-79).',
          'EN_EJECUCION',
          'cron_monitoreo_continuo'
        )
        returning id into v_engagement_id;
      end if;

      perform public.auditoria_control_ejecutar(v_control.control_id, v_engagement_id);
      v_ejecutados := v_ejecutados + 1;
    exception when others then
      -- Un control mal configurado o un tenant con datos a medias no puede
      -- tumbar la corrida de los demás (mismo criterio que el cron de
      -- cartera: una petición por copropiedad, no un todo-o-nada).
      raise notice 'AUDITORIA_CRON: falló control % del tenant % — %',
        v_control.control_id, v_control.tenant_id, sqlerrm;
    end;
  end loop;

  raise notice 'AUDITORIA_CRON: % control(es) automático(s) ejecutados', v_ejecutados;
end;
$$;

revoke execute on function public.auditoria_ejecutar_controles_automaticos_diario() from public, anon, authenticated;

comment on function public.auditoria_ejecutar_controles_automaticos_diario() is
  'PROMPT AUDITORÍA §76-79 — corre auditoria_control_ejecutar() para cada control automatizado de '
  'cada tenant activo, contra un engagement "Monitoreo continuo automático" reutilizado por tenant. '
  'Corre vía pg_cron (job "auditoria-controles-diario", 12:00 UTC = 7:00 a.m. Colombia). A '
  'diferencia del cron de cartera no necesita Vault/pg_net: auditoria_control_ejecutar ya es SQL '
  'puro, se llama directo.';

select cron.schedule(
  'auditoria-controles-diario',
  '0 12 * * *',
  $$select public.auditoria_ejecutar_controles_automaticos_diario()$$
);
