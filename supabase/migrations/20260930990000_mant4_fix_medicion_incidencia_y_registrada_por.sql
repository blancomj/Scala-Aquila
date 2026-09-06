-- ═══════════════════════════════════════════════════════════════════════
--  MANT-4 · dos fixes encontrados al correr las pruebas por primera vez:
--
--  1. guard_mant_ot_medicion_generar_incidencia (AFTER INSERT) hacía un
--     UPDATE de vuelta sobre la propia fila para enlazar
--     incidencia_generada_id — pero RETURNING de la sentencia INSERT
--     original ya había fijado su salida ANTES de que el trigger AFTER
--     corriera esa actualización, así que el cliente nunca veía el enlace
--     en el mismo viaje (solo tras un SELECT aparte). Se mueve la
--     generación de la incidencia al propio guard BEFORE INSERT de la
--     medición, fijando `new.incidencia_generada_id` en la misma fila que
--     se va a insertar — ahí sí lo refleja el RETURNING.
--
--  2. guard_mant_incidencia nunca poblaba `registrada_por` cuando el
--     cliente no lo mandaba explícito — el campo quedaba null pese a que
--     el AD-26 de este corte exige que sea SIEMPRE un usuario con sesión
--     quien inserta. Se completa desde auth.uid() si llega null.
-- ═══════════════════════════════════════════════════════════════════════

drop trigger mant_ot_mediciones_generar_incidencia on public.mant_ot_mediciones;
drop function public.guard_mant_ot_medicion_generar_incidencia();

create or replace function public.guard_mant_ot_medicion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ot_estado     public.ot_estado_t;
  v_def           public.mant_atributo_definicion;
  v_ot            public.mant_ordenes_trabajo;
  v_anomalia_id   bigint;
  v_medicion_id   bigint;
  v_anio          smallint;
  v_numero        integer;
begin
  select estado into v_ot_estado from public.mant_ordenes_trabajo where id = new.ot_id;
  if v_ot_estado = 'cerrada' then
    raise exception 'OT_CERRADA_INMUTABLE: la OT de esta medición ya está cerrada';
  end if;

  select * into v_def from public.mant_atributo_definicion where id = new.atributo_definicion_id;
  if v_def.tenant_id is distinct from new.tenant_id then
    raise exception 'OT_TENANT_INCONSISTENTE: la definición de atributo % no pertenece al tenant',
      new.atributo_definicion_id;
  end if;
  if new.unidad_id is null then
    new.unidad_id := v_def.unidad_id;
  end if;

  new.fuera_de_rango :=
    (new.rango_min is not null and new.valor < new.rango_min)
    or (new.rango_max is not null and new.valor > new.rango_max);

  -- ── El bucle (§3.4, prueba 9): fuera de rango genera la incidencia AQUÍ, antes de que la ──
  -- fila de la medición se guarde, para que new.incidencia_generada_id quede fijado en la
  -- misma fila que ve el RETURNING del INSERT del cliente.
  if new.fuera_de_rango then
    select * into v_ot from public.mant_ordenes_trabajo where id = new.ot_id;
    select id into v_anomalia_id from public.lista_tipos where tipo = 'TIPO_INCIDENCIA' and codigo = 'anomalia';
    select id into v_medicion_id from public.lista_tipos where tipo = 'ORIGEN_REPORTE' and codigo = 'medicion';

    v_anio := extract(year from now())::smallint;
    v_numero := public.fn_mant_siguiente_numero(
      new.tenant_id, v_anio,
      (select id from public.lista_tipos where tipo = 'MANT_SERIE_CONSECUTIVO' and codigo = 'incidencia')
    );

    insert into public.mant_incidencias (
      tenant_id, numero, anio, activo_id, tipo_id, titulo, descripcion,
      origen_id, reportante_ref, registrada_por
    ) values (
      new.tenant_id, v_numero, v_anio, v_ot.activo_id, v_anomalia_id,
      'Medición fuera de rango en OT ' || v_ot.anio || '-' || v_ot.numero,
      format('Valor %s fuera del rango [%s, %s] registrado en la OT %s/%s',
        new.valor, new.rango_min, new.rango_max, v_ot.numero, v_ot.anio),
      v_medicion_id, 'Generada automáticamente por medición fuera de rango', (select auth.uid())
    ) returning id into new.incidencia_generada_id;
  end if;

  return new;
end;
$$;

comment on function public.guard_mant_ot_medicion() is
  'MANT-4 §3.4: valida tenant/OT no cerrada, autocompleta unidad_id, calcula fuera_de_rango y, '
  'si aplica, genera la incidencia de anomalía enlazada EN EL MISMO BEFORE INSERT (fija '
  'new.incidencia_generada_id directo — un AFTER INSERT que la enlazara con un UPDATE aparte '
  'llegaría tarde para el RETURNING del INSERT original, bug encontrado al correr la prueba 9).';

-- ── registrada_por: siempre quien tiene la sesión (AD-26), nunca queda null por omisión ──
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
    if new.registrada_por is null then
      new.registrada_por := (select auth.uid());
    end if;
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

comment on function public.guard_mant_incidencia() is
  'MANT-4 §3.1/§3.2: asigna numero/anio y registrada_por (AD-26: siempre quien tiene sesión, '
  'nunca queda null) al INSERT. Valida catálogos y consistencia de tenant, auto-calcula la '
  'prioridad sugerida al alta (nunca bloqueante), exige motivo si se sobrescribe o si se '
  'descarta, valida la máquina de estados y registra cada transición en '
  'mant_incidencia_actuaciones.';
