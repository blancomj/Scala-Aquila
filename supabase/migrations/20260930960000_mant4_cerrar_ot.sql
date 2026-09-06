-- ═══════════════════════════════════════════════════════════════════════
--  MANT-4 · Incidencias y órdenes de trabajo (8/9)
--  Casos de uso/Tres Modulos/Mantenimiento/MANT_04_incidencias_ordenes_trabajo.md §3.3
--
--  fn_mant_cerrar_ot es el corte central: valida completitud, genera el
--  cumplimiento en MANT-2 si aplica, encadena la programación en MANT-3 si
--  aplica, resuelve la incidencia origen si aplica, y solo al final marca
--  la bandera de sesión para su propio UPDATE controlado a 'cerrada'.
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_mant_cerrar_ot(
  p_ot_id uuid,
  p_fecha_cierre date default current_date,
  p_evidencia_referencia text default null,
  p_aprobada_por uuid default null
)
returns public.mant_ordenes_trabajo
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ot            public.mant_ordenes_trabajo;
  v_requisito     public.mant_requisito;
  v_faltantes     text[] := array[]::text[];
  v_tarea         record;
begin
  select * into v_ot from public.mant_ordenes_trabajo where id = p_ot_id;
  if v_ot.id is null then
    raise exception 'OT_INEXISTENTE: %', p_ot_id;
  end if;

  if (select auth.uid()) is not null
     and not public.has_role(v_ot.tenant_id, array['auxiliar', 'administrador']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: no tienes rol suficiente en este tenant para cerrar esta OT';
  end if;

  if v_ot.estado = 'pendiente_aprobacion' then
    if v_ot.aprobada_por is null and p_aprobada_por is null then
      raise exception 'OT_TRANSICION_INVALIDA: % está pendiente_aprobacion y no tiene aprobada_por '
        '— pasa p_aprobada_por para aprobarla al cerrar', p_ot_id;
    end if;
  elsif v_ot.estado <> 'ejecutada' then
    raise exception 'OT_TRANSICION_INVALIDA: % no puede cerrarse desde el estado %', p_ot_id, v_ot.estado;
  end if;

  -- ── Completitud (§3.3, OT_CIERRE_INCOMPLETO con detalle) ──
  for v_tarea in select * from public.mant_ot_tareas where ot_id = p_ot_id order by orden loop
    if v_tarea.obligatoria and v_tarea.estado = 'pendiente' then
      v_faltantes := array_append(v_faltantes, format('tarea "%s": pendiente', v_tarea.descripcion));
    end if;
    if v_tarea.requiere_medicion
       and not exists (select 1 from public.mant_ot_mediciones m where m.tarea_id = v_tarea.id) then
      v_faltantes := array_append(v_faltantes, format('tarea "%s": falta la medición', v_tarea.descripcion));
    end if;
    if v_tarea.requiere_evidencia_foto
       and not exists (select 1 from public.mant_ot_evidencias e where e.tarea_id = v_tarea.id) then
      v_faltantes := array_append(v_faltantes, format('tarea "%s": falta la evidencia fotográfica', v_tarea.descripcion));
    end if;
  end loop;

  if array_length(v_faltantes, 1) > 0 then
    raise exception 'OT_CIERRE_INCOMPLETO: % — %', p_ot_id, array_to_string(v_faltantes, '; ');
  end if;

  -- ── Cumplimiento en MANT-2, si la OT satisface un requisito ──
  if v_ot.requisito_id is not null then
    select * into v_requisito from public.mant_requisito where id = v_ot.requisito_id;
    if v_requisito.requiere_tercero_acreditado
       and (v_ot.asignado_tercero_id is null
            or v_ot.acreditacion_referencia is null or btrim(v_ot.acreditacion_referencia) = '') then
      raise exception 'OT_CUMPLIMIENTO_SIN_ACREDITACION: el requisito %s exige tercero acreditado '
        'y su referencia de acreditación en la OT', v_requisito.nombre;
    end if;

    insert into public.mant_cumplimiento (
      tenant_id, requisito_id, activo_id, fecha_cumplimiento,
      ejecutado_por_tercero_id, acreditacion_referencia, evidencia_referencia
    ) values (
      v_ot.tenant_id, v_ot.requisito_id, v_ot.activo_id, p_fecha_cierre,
      v_ot.asignado_tercero_id, v_ot.acreditacion_referencia,
      coalesce(p_evidencia_referencia, format('OT %s/%s', v_ot.numero, v_ot.anio))
    );
  end if;

  -- ── Encadenamiento en MANT-3, si la OT nace de una programación ──
  if v_ot.origen = 'programacion' and v_ot.programacion_id is not null then
    update public.mant_programaciones
      set estado = 'generada', generada_at = p_fecha_cierre::timestamptz, orden_trabajo_id = v_ot.id
      where id = v_ot.programacion_id;
  end if;

  -- ── Resuelve la incidencia origen, si la OT nace de una incidencia ──
  if v_ot.origen = 'incidencia' and v_ot.incidencia_id is not null then
    update public.mant_incidencias set estado = 'resuelta' where id = v_ot.incidencia_id;
  end if;

  -- ── El UPDATE controlado — la única vía legítima a 'cerrada' (ver guard_mant_ot) ──
  perform set_config('aquila.cerrando_ot', 'true', true);
  update public.mant_ordenes_trabajo
    set estado = 'cerrada', cerrada_at = now(),
        aprobada_por = coalesce(aprobada_por, p_aprobada_por),
        aprobada_at = case when aprobada_at is null and p_aprobada_por is not null then now() else aprobada_at end
    where id = p_ot_id
    returning * into v_ot;
  perform set_config('aquila.cerrando_ot', 'false', true);

  return v_ot;
end;
$$;

comment on function public.fn_mant_cerrar_ot(uuid, date, text, uuid) is
  'MANT-4 §3.3: cierre atómico de una OT — valida tareas/mediciones/evidencias obligatorias '
  '(OT_CIERRE_INCOMPLETO con el detalle exacto de qué falta), genera el cumplimiento en '
  'mant_cumplimiento si la OT satisface un requisito (OT_CUMPLIMIENTO_SIN_ACREDITACION si falta '
  'la acreditación exigida), encadena mant_programaciones (MANT-3, D-55) si el origen es '
  'programación, resuelve la incidencia origen si aplica, y solo entonces marca ''cerrada'' vía '
  'la bandera de sesión que el guard exige.';

-- ── Convertir una incidencia en OT (§3.6, botón "Convertir a OT" de la UI) ──
create function public.fn_mant_convertir_incidencia_a_ot(
  p_incidencia_id uuid,
  p_tipo_mantenimiento_id bigint,
  p_titulo text default null,
  p_asignado_tercero_id uuid default null,
  p_asignado_usuario_id uuid default null
)
returns public.mant_ordenes_trabajo
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_incidencia public.mant_incidencias;
  v_ot         public.mant_ordenes_trabajo;
  v_anio       smallint;
  v_numero     integer;
begin
  select * into v_incidencia from public.mant_incidencias where id = p_incidencia_id;
  if v_incidencia.id is null then
    raise exception 'INCIDENCIA_INEXISTENTE: %', p_incidencia_id;
  end if;

  if (select auth.uid()) is not null
     and not public.has_role(v_incidencia.tenant_id, array['auxiliar', 'administrador']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: no tienes rol suficiente en este tenant';
  end if;

  if v_incidencia.estado not in ('reportada', 'en_evaluacion') then
    raise exception 'INCIDENCIA_TRANSICION_INVALIDA: % no puede convertirse desde el estado %',
      p_incidencia_id, v_incidencia.estado;
  end if;

  v_anio := extract(year from now())::smallint;
  v_numero := public.fn_mant_siguiente_numero(
    v_incidencia.tenant_id, v_anio,
    (select id from public.lista_tipos where tipo = 'MANT_SERIE_CONSECUTIVO' and codigo = 'orden_trabajo')
  );

  insert into public.mant_ordenes_trabajo (
    tenant_id, numero, anio, activo_id, tipo_mantenimiento_id, origen, incidencia_id,
    titulo, descripcion, prioridad_id, asignado_tercero_id, asignado_usuario_id, estado
  ) values (
    v_incidencia.tenant_id, v_numero, v_anio, v_incidencia.activo_id, p_tipo_mantenimiento_id,
    'incidencia', v_incidencia.id, coalesce(p_titulo, v_incidencia.titulo), v_incidencia.descripcion,
    v_incidencia.prioridad_id, p_asignado_tercero_id, p_asignado_usuario_id, 'borrador'
  ) returning * into v_ot;

  update public.mant_incidencias
    set estado = 'convertida', orden_trabajo_id = v_ot.id
    where id = p_incidencia_id;

  return v_ot;
end;
$$;

comment on function public.fn_mant_convertir_incidencia_a_ot(uuid, bigint, text, uuid, uuid) is
  'MANT-4 §3.6: crea la OT desde una incidencia (reportada/en_evaluacion) y marca la incidencia '
  'convertida, enlazando ambos lados (orden_trabajo_id / incidencia_id).';

-- ── Generar una OT desde una programación pendiente (MANT-3) ────────────
create function public.fn_mant_generar_ot_desde_programacion(p_programacion_id uuid)
returns public.mant_ordenes_trabajo
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prog   public.mant_programaciones;
  v_plan   public.mant_planes;
  v_ot     public.mant_ordenes_trabajo;
  v_anio   smallint;
  v_numero integer;
  v_tarea  record;
  v_orden  smallint := 0;
begin
  select * into v_prog from public.mant_programaciones where id = p_programacion_id;
  if v_prog.id is null then
    raise exception 'PLAN_INEXISTENTE: programación % no existe', p_programacion_id;
  end if;
  if v_prog.estado <> 'pendiente' then
    raise exception 'OT_TRANSICION_INVALIDA: la programación % no está pendiente (es %)',
      p_programacion_id, v_prog.estado;
  end if;

  select * into v_plan from public.mant_planes where id = v_prog.plan_id;

  if (select auth.uid()) is not null
     and not public.has_role(v_prog.tenant_id, array['auxiliar', 'administrador']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: no tienes rol suficiente en este tenant';
  end if;

  v_anio := extract(year from v_prog.fecha_programada)::smallint;
  v_numero := public.fn_mant_siguiente_numero(
    v_prog.tenant_id, v_anio,
    (select id from public.lista_tipos where tipo = 'MANT_SERIE_CONSECUTIVO' and codigo = 'orden_trabajo')
  );

  insert into public.mant_ordenes_trabajo (
    tenant_id, numero, anio, activo_id, tipo_mantenimiento_id, origen, programacion_id,
    requisito_id, titulo, descripcion, fecha_programada, fecha_limite,
    requiere_parada_servicio, estado
  ) values (
    v_prog.tenant_id, v_numero, v_anio, v_prog.activo_id, v_plan.tipo_mantenimiento_id,
    'programacion', v_prog.id, v_plan.requisito_id, v_plan.nombre, v_plan.descripcion,
    v_prog.fecha_programada, v_prog.ventana_hasta, v_plan.requiere_parada_servicio, 'programada'
  ) returning * into v_ot;

  for v_tarea in select * from public.mant_plan_tareas where plan_id = v_plan.id order by orden loop
    v_orden := v_orden + 1;
    insert into public.mant_ot_tareas (
      tenant_id, ot_id, orden, descripcion, obligatoria, requiere_medicion, requiere_evidencia_foto
    ) values (
      v_prog.tenant_id, v_ot.id, v_orden, v_tarea.descripcion, true,
      v_tarea.requiere_medicion, v_tarea.requiere_evidencia_foto
    );
  end loop;

  return v_ot;
end;
$$;

comment on function public.fn_mant_generar_ot_desde_programacion(uuid) is
  'MANT-4 §3.3/§3.6: crea la OT desde una programación pendiente (MANT-3), copiando las tareas '
  'del plan 1:1. No toca el estado de la programación todavía — eso pasa al cerrar la OT '
  '(fn_mant_cerrar_ot), con la fecha de ejecución real, no la de creación de la OT.';
