-- ═══════════════════════════════════════════════════════════════════════
--  MANT-5 · fix: la reescritura completa de guard_mant_ot() en
--  20260931080000 (contratista habilitado + SLA del contrato) perdió por
--  accidente el bloque que asigna numero/anio en el INSERT (el que
--  20260931000000 ya documentó como "asignado siempre por guard_mant_ot
--  vía fn_mant_siguiente_numero"). Sin ese bloque, numero se queda en su
--  DEFAULT placeholder (0) para toda OT nueva, y la segunda OT del mismo
--  tenant/año choca con la unique (tenant_id, anio, numero) —
--  exactamente el 23505 que rompió
--  tests/mantenimiento/ot-incidencias.test.ts #1 en la regresión
--  post-MANT-5. Encontrado por esa regresión, no por lectura; se repone
--  el bloque tal cual estaba antes de 20260931080000, en la misma
--  posición (justo tras el chequeo de OT_CERRADA_INMUTABLE).
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.guard_mant_ot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo_mant text;
  v_prioridad text;
  v_politica public.mant_politica_aprobacion_ot;
  v_permitida boolean := false;
  v_contrato public.mant_contratos%rowtype;
  v_falta record;
begin
  if tg_op = 'UPDATE' and old.estado = 'cerrada' then
    raise exception 'OT_CERRADA_INMUTABLE: la OT % ya está cerrada y no admite cambios', old.id;
  end if;

  if tg_op = 'INSERT' then
    new.anio := coalesce(new.anio, extract(year from new.fecha_programada)::smallint, extract(year from now())::smallint);
    new.numero := public.fn_mant_siguiente_numero(
      new.tenant_id, new.anio,
      (select id from public.lista_tipos where tipo = 'MANT_SERIE_CONSECUTIVO' and codigo = 'orden_trabajo')
    );
  end if;

  select tipo into v_tipo_mant from public.lista_tipos where id = new.tipo_mantenimiento_id;
  if v_tipo_mant is distinct from 'TIPO_MANTENIMIENTO' then
    raise exception 'OT_TIPO_MANTENIMIENTO_INVALIDO: tipo_mantenimiento_id % no pertenece a '
      'TIPO_MANTENIMIENTO (es %)', new.tipo_mantenimiento_id, coalesce(v_tipo_mant, 'inexistente');
  end if;

  if new.prioridad_id is not null then
    select tipo into v_prioridad from public.lista_tipos where id = new.prioridad_id;
    if v_prioridad is distinct from 'PRIORIDAD' then
      raise exception 'INCIDENCIA_PRIORIDAD_INVALIDA: prioridad_id % no pertenece a PRIORIDAD (es %)',
        new.prioridad_id, coalesce(v_prioridad, 'inexistente');
    end if;
  end if;

  -- ── Consistencia de origen (§3.3) ──
  case new.origen
    when 'programacion' then
      if new.programacion_id is null or new.incidencia_id is not null or new.inspeccion_id is not null then
        raise exception 'OT_ORIGEN_INCONSISTENTE: origen = ''programacion'' exige solo programacion_id';
      end if;
    when 'incidencia' then
      if new.incidencia_id is null or new.programacion_id is not null or new.inspeccion_id is not null then
        raise exception 'OT_ORIGEN_INCONSISTENTE: origen = ''incidencia'' exige solo incidencia_id';
      end if;
    when 'inspeccion' then
      if new.inspeccion_id is null or new.programacion_id is not null or new.incidencia_id is not null then
        raise exception 'OT_ORIGEN_INCONSISTENTE: origen = ''inspeccion'' exige solo inspeccion_id';
      end if;
    when 'manual' then
      if new.programacion_id is not null or new.incidencia_id is not null or new.inspeccion_id is not null then
        raise exception 'OT_ORIGEN_INCONSISTENTE: origen = ''manual'' no admite programacion_id/incidencia_id/inspeccion_id';
      end if;
  end case;

  -- ── Consistencia de tenant ──
  if new.activo_id is not null
     and not exists (select 1 from public.activos where id = new.activo_id and tenant_id = new.tenant_id) then
    raise exception 'OT_TENANT_INCONSISTENTE: el activo % no pertenece al tenant', new.activo_id;
  end if;
  if new.programacion_id is not null
     and not exists (select 1 from public.mant_programaciones where id = new.programacion_id and tenant_id = new.tenant_id) then
    raise exception 'OT_TENANT_INCONSISTENTE: la programación % no pertenece al tenant', new.programacion_id;
  end if;
  if new.requisito_id is not null
     and not exists (select 1 from public.mant_requisito where id = new.requisito_id and tenant_id = new.tenant_id) then
    raise exception 'OT_TENANT_INCONSISTENTE: el requisito % no pertenece al tenant', new.requisito_id;
  end if;
  if new.asignado_tercero_id is not null
     and not exists (select 1 from public.terceros where id = new.asignado_tercero_id and tenant_id = new.tenant_id) then
    raise exception 'OT_TENANT_INCONSISTENTE: el tercero % no pertenece al tenant', new.asignado_tercero_id;
  end if;

  -- ── MANT-5 §4.3: contrato de la OT — tenant + SLA como fecha límite ──
  if new.contrato_id is not null then
    select * into v_contrato from public.mant_contratos where id = new.contrato_id;
    if v_contrato.id is null or v_contrato.tenant_id <> new.tenant_id then
      raise exception 'CONTRATO_TENANT_INCONSISTENTE: contrato_id % no pertenece al tenant',
        new.contrato_id;
    end if;
    if tg_op = 'INSERT' and new.fecha_limite is null and v_contrato.sla_solucion_horas is not null then
      new.fecha_limite := (now() + (v_contrato.sla_solucion_horas || ' hours')::interval)::date;
    end if;
  end if;

  -- ── Umbral de aprobación (§3.3): piso, nunca techo — la política solo puede EXIGIR más, ──
  -- nunca relajar lo que el propio usuario ya marcó true.
  if tg_op = 'INSERT' then
    v_politica := public.fn_mant_politica_aprobacion_vigente(new.tenant_id);
    if v_politica.id is not null then
      if (v_politica.monto_umbral is not null and coalesce(new.costo_estimado, 0) > v_politica.monto_umbral)
         or (v_politica.exige_por_parada_servicio and new.requiere_parada_servicio) then
        new.requiere_aprobacion := true;
      end if;
    end if;
  end if;

  -- ── Cancelar exige motivo ──
  if new.estado = 'cancelada' and (new.cancelada_motivo is null or btrim(new.cancelada_motivo) = '') then
    raise exception 'OT_CANCELACION_SIN_MOTIVO: cancelar una OT exige cancelada_motivo';
  end if;

  -- ── MANT-5 §4.2: prueba central del corte — contratista sin habilitación bloqueante ──
  if new.asignado_tercero_id is not null
     and (tg_op = 'INSERT' or new.asignado_tercero_id is distinct from old.asignado_tercero_id) then
    for v_falta in
      select * from public.mant_verificar_habilitacion_tercero(
        new.tenant_id, new.asignado_tercero_id, new.activo_id, new.tipo_mantenimiento_id,
        new.requiere_trabajo_alturas, new.requiere_parada_servicio, new.costo_estimado
      )
      where bloqueante
    loop
      raise exception 'OT_CONTRATISTA_NO_HABILITADO: el tercero % no tiene "%" vigente (%)',
        new.asignado_tercero_id, v_falta.tipo_habilitacion_nombre, v_falta.motivo;
    end loop;
  end if;

  -- ── Máquina de estados (solo en UPDATE) ──
  if tg_op = 'UPDATE' and new.estado is distinct from old.estado then
    if new.estado = 'cerrada' then
      -- Cerrar SIEMPRE pasa por fn_mant_cerrar_ot, que marca esta bandera de sesión antes de
      -- su propio UPDATE controlado (mismo mecanismo que aquila.propagacion_solicitud, Fondos).
      if coalesce(current_setting('aquila.cerrando_ot', true), 'false') <> 'true' then
        raise exception 'OT_TRANSICION_INVALIDA: cerrar una OT exige fn_mant_cerrar_ot, no un UPDATE directo';
      end if;
    else
      v_permitida := case old.estado
        when 'borrador'              then new.estado in ('programada', 'asignada', 'cancelada')
        when 'programada'            then new.estado in ('asignada', 'cancelada')
        when 'asignada'              then new.estado in ('en_ejecucion', 'cancelada')
        when 'en_ejecucion'          then new.estado in ('ejecutada', 'cancelada')
        when 'ejecutada'             then new.estado in ('pendiente_aprobacion', 'cancelada')
        when 'pendiente_aprobacion'  then new.estado = 'cancelada'
        else false
      end;
      -- 'ejecutada' -> 'pendiente_aprobacion' solo tiene sentido si la OT lo exige; si no lo
      -- exige, 'ejecutada' es ya el estado final previo al cierre (fn_mant_cerrar_ot lo cierra
      -- directo desde ahí).
      if old.estado = 'ejecutada' and new.estado = 'pendiente_aprobacion' and not new.requiere_aprobacion then
        v_permitida := false;
      end if;
      if not v_permitida then
        raise exception 'OT_TRANSICION_INVALIDA: % -> % no está permitida', old.estado, new.estado;
      end if;
    end if;

    insert into public.mant_ot_estado_historial (tenant_id, ot_id, estado_anterior, estado_nuevo, motivo, registrado_por)
    values (new.tenant_id, new.id, old.estado, new.estado, new.cancelada_motivo, (select auth.uid()));
  end if;

  new.updated_at := now();
  return new;
end;
$$;

comment on function public.guard_mant_ot() is
  'MANT-4/5: asigna numero/anio SIEMPRE desde fn_mant_siguiente_numero al INSERT (repuesto en '
  '20260931110000 tras perderse en la reescritura de 20260931080000). Valida catálogos/'
  'consistencia de tenant, la coherencia de origen, aplica el umbral de aprobación como piso, '
  'deriva fecha_limite del SLA del contrato al nacer (MANT-5 §4.3), exige motivo para cancelar, '
  'bloquea un contratista sin habilitación bloqueante vigente (OT_CONTRATISTA_NO_HABILITADO, '
  'MANT-5 §4.2, prueba central), valida la máquina de estados y bloquea ''cerrada'' salvo que la '
  'dispare fn_mant_cerrar_ot. cerrada es terminal para cualquier columna (chequeo al inicio, '
  'lección D-54/D-55 aplicada desde el arranque).';
