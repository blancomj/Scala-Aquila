-- ═══════════════════════════════════════════════════════════════════════
--  EXT-03 · extiende guard_mant_reserva() (MANT-10) — cancelación desde
--  solicitada y cargo del camino auto-aprobado
--  Ver Casos de uso/Solicitudes - Reservas - Visitantes/EXT_03_reservas.md.
--
--  No se toca 20260932730000_mant10_reservas.sql (ya en producción, ya con
--  su propia suite verde) — CREATE OR REPLACE de la misma firma, mismo
--  criterio que el fix de fn_actor_externo_mis_vinculos en EXT-02
--  (20260932840000).
--
--  Dos extensiones, documentadas en el Plan del corte aprobado:
--
--  1. `solicitada -> cancelada`: MANT-10 solo definía `aprobada ->
--     cancelada` (su propio spec §3.4/§4.1). Un residente que quiere
--     retirar una solicitud todavía pendiente de aprobación no tenía
--     manera de hacerlo — y esa solicitud pendiente SÍ ocupa el cupo si
--     cupo_simultaneo=1 (el exclude constraint cuenta 'solicitada' como
--     ocupación). Mismo criterio que fn_solicitud_cancelar_externa en
--     EXT-02: extiende el dominio dueño, no lo esquiva. Sin penalidad —
--     el bloque de penalidad_cancelacion_tardia_horas sigue exigiendo
--     explícitamente old.estado = 'aprobada', así que cancelar una todavía
--     pendiente nunca la marca penalizada.
--
--  2. Hallazgo real, confirmado en el Plan: con requiere_aprobacion=false
--     Y genera_cargo=true a la vez, la reserva nacía aprobada automática
--     (bloque ya existente) pero SIN cargo — solo fn_reserva_aprobar()
--     (acción explícita de staff, exige estado='solicitada') lo crea, y
--     una reserva auto-aprobada nunca pasa por ahí. Hueco preexistente de
--     MANT-10 (afectaría igual a una reserva creada directo por staff con
--     esa combinación), nunca ejercitado por ningún test de MANT-10 (sus
--     pruebas 6 y 8 prueban cada flag por separado).
--
--     Hallazgo de implementación (no en el Plan): el primer intento puso
--     el `insert into cargos (..., reserva_id, ...) values (..., new.id,
--     ...)` DENTRO del mismo BEFORE INSERT de guard_mant_reserva — falló
--     con "violates foreign key constraint" porque `cargos.reserva_id`
--     referencia `mant_reservas.id`, y en un BEFORE INSERT la fila de
--     mant_reservas TODAVÍA no existe en la tabla (mismo principio que
--     feedback_trigger_before_insert_no_ve_su_propia_fila, aplicado aquí a
--     una FK en vez de a una consulta). Corregido con un trigger AFTER
--     INSERT nuevo y separado (mant_reserva_generar_cargo_auto_aprobada),
--     que sí ve la fila ya escrita — duplica el mismo bloque pequeño que
--     ya tiene fn_reserva_aprobar (resolver periodo por anio/mes, tomar
--     valor_fijo del concepto, insertar el cargo, enlazarlo vía UPDATE) —
--     no se extrajo a una función compartida para no tocar fn_reserva_
--     aprobar, ya en producción.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.guard_mant_reserva()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_regla            public.mant_zona_reserva_regla;
  v_duracion_min     integer;
  v_activas_inmueble integer;
  v_ocupadas         integer;
  v_vinculado        boolean;
begin
  if tg_op = 'INSERT' then
    select * into v_regla
      from public.mant_zona_reserva_regla
     where zona_comun_id = new.zona_comun_id
       and tenant_id = new.tenant_id
       and vigente_desde <= new.fecha
       and (vigente_hasta is null or vigente_hasta >= new.fecha)
     order by vigente_desde desc
     limit 1;

    if v_regla.id is null then
      raise exception 'RESERVA_ZONA_SIN_REGLA_VIGENTE: la zona % no tiene una regla de reserva '
        'vigente para %', new.zona_comun_id, new.fecha;
    end if;

    new.zona_cupo_simultaneo := v_regla.cupo_simultaneo;

    v_duracion_min := extract(epoch from (new.hora_fin - new.hora_inicio)) / 60;
    if v_regla.duracion_maxima_minutos is not null and v_duracion_min > v_regla.duracion_maxima_minutos then
      raise exception 'RESERVA_DURACION_EXCEDIDA: % minutos excede el máximo de % para esta zona',
        v_duracion_min, v_regla.duracion_maxima_minutos;
    end if;

    if v_regla.anticipacion_minima_horas is not null
       and (new.fecha + new.hora_inicio) < (now() + (v_regla.anticipacion_minima_horas || ' hours')::interval) then
      raise exception 'RESERVA_FUERA_DE_VENTANA: no cumple la anticipación mínima de % horas',
        v_regla.anticipacion_minima_horas;
    end if;

    if v_regla.anticipacion_maxima_dias is not null
       and (new.fecha + new.hora_inicio) > (now() + (v_regla.anticipacion_maxima_dias || ' days')::interval) then
      raise exception 'RESERVA_FUERA_DE_VENTANA: excede la anticipación máxima de % días',
        v_regla.anticipacion_maxima_dias;
    end if;

    if v_regla.maximo_activas_por_inmueble is not null then
      select count(*) into v_activas_inmueble
        from public.mant_reservas
       where inmueble_id = new.inmueble_id
         and zona_comun_id = new.zona_comun_id
         and estado in ('solicitada', 'aprobada');
      if v_activas_inmueble >= v_regla.maximo_activas_por_inmueble then
        raise exception 'RESERVA_LIMITE_INMUEBLE_EXCEDIDO: el inmueble % ya tiene % reservas '
          'activas en esta zona (máximo %)', new.inmueble_id, v_activas_inmueble,
          v_regla.maximo_activas_por_inmueble;
      end if;
    end if;

    if new.solicitante_origen = 'externo' then
      select exists (
        select 1
          from public.actor_externo_vinculo v
          join public.inmueble_persona_rol ipr on ipr.id = v.persona_rol_id
         where v.id = new.solicitante_ref
           and ipr.inmueble_id = new.inmueble_id
           and (v.vigente_hasta is null or v.vigente_hasta >= current_date)
      ) into v_vinculado;

      if not v_vinculado then
        raise exception 'RESERVA_INMUEBLE_NO_VINCULADO: el actor externo % no está vinculado al '
          'inmueble %', new.solicitante_ref, new.inmueble_id;
      end if;
    end if;

    if v_regla.cupo_simultaneo > 1 and new.estado in ('solicitada', 'aprobada') then
      select count(*) into v_ocupadas
        from public.mant_reservas
       where zona_comun_id = new.zona_comun_id
         and estado in ('solicitada', 'aprobada')
         and tsrange(fecha + hora_inicio, fecha + hora_fin)
             && tsrange(new.fecha + new.hora_inicio, new.fecha + new.hora_fin);
      if v_ocupadas >= v_regla.cupo_simultaneo then
        raise exception 'RESERVA_CUPO_EXCEDIDO: la zona % ya tiene % reservas activas en esa '
          'franja (cupo %)', new.zona_comun_id, v_ocupadas, v_regla.cupo_simultaneo;
      end if;
    end if;

    if not v_regla.requiere_aprobacion and new.estado = 'solicitada' then
      new.estado := 'aprobada';
      new.aprobada_at := now();
    end if;

    return new;
  end if;

  -- UPDATE: solo estado y sus campos asociados son editables; todo lo que define
  -- la franja/el solicitante es inmutable tras el alta (mismo criterio que
  -- guard_actor_externo_vinculo, EXT-01).
  if old.tenant_id is distinct from new.tenant_id
    or old.zona_comun_id is distinct from new.zona_comun_id
    or old.inmueble_id is distinct from new.inmueble_id
    or old.solicitante_ref is distinct from new.solicitante_ref
    or old.solicitante_origen is distinct from new.solicitante_origen
    or old.fecha is distinct from new.fecha
    or old.hora_inicio is distinct from new.hora_inicio
    or old.hora_fin is distinct from new.hora_fin
    or old.zona_cupo_simultaneo is distinct from new.zona_cupo_simultaneo
    or old.created_at is distinct from new.created_at
  then
    raise exception 'RESERVA_INMUTABLE: solo el estado y sus campos asociados son editables '
      'tras el alta';
  end if;

  if old.estado is distinct from new.estado then
    if not (
      (old.estado = 'solicitada' and new.estado in ('aprobada', 'rechazada', 'cancelada'))
      or (old.estado = 'aprobada' and new.estado in ('completada', 'cancelada', 'no_show'))
    ) then
      raise exception 'RESERVA_TRANSICION_INVALIDA: % -> % no es una transición válida',
        old.estado, new.estado;
    end if;

    if new.estado = 'cancelada' and old.estado = 'aprobada' then
      select * into v_regla
        from public.mant_zona_reserva_regla
       where zona_comun_id = new.zona_comun_id
         and tenant_id = new.tenant_id
         and vigente_desde <= new.fecha
         and (vigente_hasta is null or vigente_hasta >= new.fecha)
       order by vigente_desde desc
       limit 1;
      if v_regla.penalidad_cancelacion_tardia_horas is not null
         and now() > ((new.fecha + new.hora_inicio) - (v_regla.penalidad_cancelacion_tardia_horas || ' hours')::interval) then
        new.penalizada := true;
      end if;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.guard_mant_reserva() is
  'MANT-10 §3.3, extendido por EXT-03 (20260932850000): valida cupo/traslape/vínculo/ventana/'
  'duración y promueve a aprobada si la regla no exige aprobación. Transiciones válidas: '
  'solicitada -> aprobada/rechazada/cancelada; aprobada -> completada/cancelada/no_show. '
  'cancelada desde solicitada nunca queda penalizada (el bloque de penalidad exige '
  'old.estado=aprobada). El cargo de una reserva auto-aprobada con genera_cargo=true lo crea '
  'mant_reserva_generar_cargo_auto_aprobada (AFTER INSERT, mismo archivo) — no este BEFORE, '
  'porque la fila de mant_reservas todavía no existe cuando este trigger corre y '
  'cargos.reserva_id es una FK real hacia ella.';

-- ── mant_reserva_generar_cargo_auto_aprobada (AFTER INSERT) ──────────────
create function public.mant_reserva_generar_cargo_auto_aprobada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_regla      public.mant_zona_reserva_regla;
  v_anio       int;
  v_mes        int;
  v_periodo_id uuid;
  v_cargo_id   uuid;
  v_monto      numeric(18, 2);
begin
  if new.estado <> 'aprobada' or new.cargo_id is not null then
    return new;
  end if;

  select * into v_regla
    from public.mant_zona_reserva_regla
   where zona_comun_id = new.zona_comun_id
     and tenant_id = new.tenant_id
     and vigente_desde <= new.fecha
     and (vigente_hasta is null or vigente_hasta >= new.fecha)
   order by vigente_desde desc
   limit 1;

  if v_regla.id is null or not v_regla.genera_cargo then
    return new;
  end if;

  v_anio := extract(year from new.fecha);
  v_mes := extract(month from new.fecha);

  select id into v_periodo_id
    from public.periodos
   where tenant_id = new.tenant_id and anio = v_anio and mes = v_mes;
  if v_periodo_id is null then
    raise exception 'PERIODO_NO_ENCONTRADO_PARA_FECHA_RESERVA: no existe periodo %-% para el '
      'tenant % (reserva % auto-aprobada)', v_anio, v_mes, new.tenant_id, new.id;
  end if;

  select valor_fijo into v_monto from public.conceptos where id = v_regla.concepto_id;

  insert into public.cargos (
    tenant_id, inmueble_id, periodo_id, categoria, origen_tipo, reserva_id, concepto_id, monto_original
  ) values (
    new.tenant_id, new.inmueble_id, v_periodo_id, 'otro', 'reserva', new.id, v_regla.concepto_id, v_monto
  )
  returning id into v_cargo_id;

  update public.mant_reservas set cargo_id = v_cargo_id where id = new.id;

  return new;
end;
$$;

comment on function public.mant_reserva_generar_cargo_auto_aprobada() is
  'EXT-03: crea el cargo de una reserva que nació directo en aprobada (regla con '
  'requiere_aprobacion=false) cuando esa misma regla tiene genera_cargo=true — hueco preexistente '
  'de MANT-10 (fn_reserva_aprobar, la única que antes creaba el cargo, exige estado=solicitada y '
  'una reserva auto-aprobada nunca pasa por ahí). AFTER INSERT porque cargos.reserva_id es FK '
  'real hacia mant_reservas — un BEFORE INSERT no puede insertarla todavía (la fila no existe).';

create trigger mant_reserva_generar_cargo_auto_aprobada
  after insert on public.mant_reservas
  for each row execute function public.mant_reserva_generar_cargo_auto_aprobada();

revoke execute on function public.mant_reserva_generar_cargo_auto_aprobada()
  from public, anon, authenticated;
