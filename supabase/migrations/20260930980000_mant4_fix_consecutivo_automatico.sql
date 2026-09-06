-- ═══════════════════════════════════════════════════════════════════════
--  MANT-4 · fix: numero/anio nunca se digitan, se asignan siempre desde
--  fn_mant_siguiente_numero al INSERT — encontrado por lectura cuidadosa
--  antes de escribir las pruebas (§5.1: "consecutivos sin huecos"), no
--  como bug detectado en ejecución. Sin esto, el cliente tendría que leer
--  el consecutivo y adivinar el siguiente número — exactamente la ventana
--  de carrera que fn_mant_siguiente_numero existe para evitar.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.guard_mant_incidencia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo text;
  v_origen text;
  v_severidad text;
  v_prioridad text;
  v_sugerida record;
begin
  if tg_op = 'INSERT' then
    new.anio := coalesce(new.anio, extract(year from new.reportada_at)::smallint, extract(year from now())::smallint);
    new.numero := public.fn_mant_siguiente_numero(
      new.tenant_id, new.anio,
      (select id from public.lista_tipos where tipo = 'MANT_SERIE_CONSECUTIVO' and codigo = 'incidencia')
    );
  end if;

  select tipo into v_tipo from public.lista_tipos where id = new.tipo_id;
  if v_tipo is distinct from 'TIPO_INCIDENCIA' then
    raise exception 'INCIDENCIA_TIPO_INVALIDO: tipo_id % no pertenece a TIPO_INCIDENCIA (es %)',
      new.tipo_id, coalesce(v_tipo, 'inexistente');
  end if;

  select tipo into v_origen from public.lista_tipos where id = new.origen_id;
  if v_origen is distinct from 'ORIGEN_REPORTE' then
    raise exception 'INCIDENCIA_ORIGEN_INVALIDO: origen_id % no pertenece a ORIGEN_REPORTE (es %)',
      new.origen_id, coalesce(v_origen, 'inexistente');
  end if;

  if new.severidad_id is not null then
    select tipo into v_severidad from public.lista_tipos where id = new.severidad_id;
    if v_severidad is distinct from 'SEVERIDAD_INCIDENCIA' then
      raise exception 'INCIDENCIA_SEVERIDAD_INVALIDA: severidad_id % no pertenece a '
        'SEVERIDAD_INCIDENCIA (es %)', new.severidad_id, coalesce(v_severidad, 'inexistente');
    end if;
  end if;

  if new.prioridad_id is not null then
    select tipo into v_prioridad from public.lista_tipos where id = new.prioridad_id;
    if v_prioridad is distinct from 'PRIORIDAD' then
      raise exception 'INCIDENCIA_PRIORIDAD_INVALIDA: prioridad_id % no pertenece a PRIORIDAD '
        '(es %)', new.prioridad_id, coalesce(v_prioridad, 'inexistente');
    end if;
  end if;

  if new.activo_id is not null
     and not exists (select 1 from public.activos where id = new.activo_id and tenant_id = new.tenant_id) then
    raise exception 'INCIDENCIA_TENANT_INCONSISTENTE: el activo % no pertenece al tenant', new.activo_id;
  end if;
  if new.zona_comun_id is not null
     and not exists (select 1 from public.zonas_comunes where id = new.zona_comun_id and tenant_id = new.tenant_id) then
    raise exception 'INCIDENCIA_TENANT_INCONSISTENTE: la zona común % no pertenece al tenant', new.zona_comun_id;
  end if;
  if new.agrupacion_id is not null
     and not exists (select 1 from public.agrupaciones where id = new.agrupacion_id and tenant_id = new.tenant_id) then
    raise exception 'INCIDENCIA_TENANT_INCONSISTENTE: la agrupación % no pertenece al tenant', new.agrupacion_id;
  end if;
  if new.reportante_inmueble_id is not null
     and not exists (select 1 from public.inmuebles where id = new.reportante_inmueble_id and tenant_id = new.tenant_id) then
    raise exception 'INCIDENCIA_TENANT_INCONSISTENTE: el inmueble % no pertenece al tenant', new.reportante_inmueble_id;
  end if;
  if new.incidencia_padre_id is not null then
    if new.incidencia_padre_id = new.id then
      raise exception 'INCIDENCIA_TENANT_INCONSISTENTE: una incidencia no puede ser su propio padre';
    end if;
    if not exists (select 1 from public.mant_incidencias where id = new.incidencia_padre_id and tenant_id = new.tenant_id) then
      raise exception 'INCIDENCIA_TENANT_INCONSISTENTE: la incidencia padre % no pertenece al tenant', new.incidencia_padre_id;
    end if;
  end if;

  if tg_op = 'INSERT' and new.activo_id is not null and new.severidad_id is not null then
    begin
      select * into v_sugerida from public.mant_prioridad_sugerida(new.activo_id, new.severidad_id);
    exception when others then
      v_sugerida := null;
    end;
    if v_sugerida.prioridad_id is not null then
      new.prioridad_sugerida_id := v_sugerida.prioridad_id;
      if new.prioridad_id is null then
        new.prioridad_id := v_sugerida.prioridad_id;
      end if;
    end if;
  end if;

  if new.prioridad_id is not null and new.prioridad_sugerida_id is not null
     and new.prioridad_id is distinct from new.prioridad_sugerida_id
     and (new.prioridad_sobrescrita_motivo is null or btrim(new.prioridad_sobrescrita_motivo) = '') then
    raise exception 'PRIORIDAD_SOBRESCRITA_SIN_MOTIVO: prioridad_id difiere de la sugerida (%) — '
      'exige prioridad_sobrescrita_motivo', new.prioridad_sugerida_id;
  end if;

  if new.estado = 'descartada' and (new.descartada_motivo is null or btrim(new.descartada_motivo) = '') then
    raise exception 'INCIDENCIA_DESCARTE_SIN_MOTIVO: descartar una incidencia exige descartada_motivo';
  end if;

  if tg_op = 'UPDATE' and new.estado is distinct from old.estado then
    if not (
      (old.estado = 'reportada' and new.estado in ('en_evaluacion', 'descartada'))
      or (old.estado = 'en_evaluacion' and new.estado in ('convertida', 'resuelta', 'descartada'))
      or (old.estado = 'convertida' and new.estado = 'resuelta')
    ) then
      raise exception 'INCIDENCIA_TRANSICION_INVALIDA: % -> % no está permitida', old.estado, new.estado;
    end if;

    insert into public.mant_incidencia_actuaciones (tenant_id, incidencia_id, tipo_actuacion, descripcion, registrado_por)
    values (new.tenant_id, new.id, 'cambio_estado', old.estado || ' -> ' || new.estado, (select auth.uid()));
  end if;

  new.updated_at := now();
  return new;
end;
$$;

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

  if tg_op = 'INSERT' then
    v_politica := public.fn_mant_politica_aprobacion_vigente(new.tenant_id);
    if v_politica.id is not null then
      if (v_politica.monto_umbral is not null and coalesce(new.costo_estimado, 0) > v_politica.monto_umbral)
         or (v_politica.exige_por_parada_servicio and new.requiere_parada_servicio) then
        new.requiere_aprobacion := true;
      end if;
    end if;
  end if;

  if new.estado = 'cancelada' and (new.cancelada_motivo is null or btrim(new.cancelada_motivo) = '') then
    raise exception 'OT_CANCELACION_SIN_MOTIVO: cancelar una OT exige cancelada_motivo';
  end if;

  if tg_op = 'UPDATE' and new.estado is distinct from old.estado then
    if new.estado = 'cerrada' then
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

comment on function public.guard_mant_incidencia() is
  'MANT-4 §3.1/§3.2: asigna numero/anio SIEMPRE desde fn_mant_siguiente_numero al INSERT (nunca '
  'se acepta el valor que llegue del cliente — fix de esta migración, encontrado antes de correr '
  'las pruebas). Valida catálogos y consistencia de tenant, auto-calcula la prioridad sugerida '
  'al alta (mant_prioridad_sugerida, nunca bloqueante), exige motivo si se sobrescribe o si se '
  'descarta, valida la máquina de estados y registra cada transición real en '
  'mant_incidencia_actuaciones.';

comment on function public.guard_mant_ot() is
  'MANT-4 §3.3: asigna numero/anio SIEMPRE desde fn_mant_siguiente_numero al INSERT (mismo fix '
  'que guard_mant_incidencia). Valida catálogos/consistencia de tenant, la coherencia de '
  'origen, aplica el umbral de aprobación como piso, exige motivo para cancelar, valida la '
  'máquina de estados y bloquea ''cerrada'' salvo que la dispare fn_mant_cerrar_ot.';
