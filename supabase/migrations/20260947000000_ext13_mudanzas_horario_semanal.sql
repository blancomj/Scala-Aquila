-- ═══════════════════════════════════════════════════════════════════════
--  EXT-13 (Ola 2, M18) · Mi Copropiedad — horario semanal de zonas comunes
--  (mudanzas). Ver PROMPT_MI_COPROPIEDAD_FASE2.md §4.1/§7.8/§8.3.
--
--  GAP-VERIFY resuelto: guard_mant_reserva() vive HOY en
--  20260932850000_ext3_extender_guard_reserva.sql (CREATE OR REPLACE sobre
--  el original de MANT-10, 20260932730000) — confirmado con \df+ antes de
--  tocarlo. Este corte hace un tercer CREATE OR REPLACE sobre la misma
--  firma, mismo criterio de diff mínimo que EXT-03 ya usó sobre MANT-10:
--  no se reescribe la función completa desde cero, se copia su cuerpo
--  actual y se agrega SOLO el bloque nuevo.
--
--  "Zona sin filas aquí" sigue funcionando exactamente igual que hoy (spec
--  explícito, §4.1): el nuevo EXISTS solo se activa si la zona tiene AL
--  MENOS UNA fila en mant_zona_horario_semanal — ninguna zona existente
--  queda retroactivamente más estricta.
-- ═══════════════════════════════════════════════════════════════════════

create table public.mant_zona_horario_semanal (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  zona_comun_id  uuid not null references public.zonas_comunes (id) on delete cascade,
  dia_semana     smallint not null check (dia_semana between 0 and 6),
  hora_desde     time not null,
  hora_hasta     time not null,
  created_at     timestamptz not null default now(),

  constraint mant_zona_horario_semanal_horario_valido check (hora_hasta > hora_desde)
);

alter table public.mant_zona_horario_semanal enable row level security;
alter table public.mant_zona_horario_semanal force row level security;

create index mant_zona_horario_semanal_zona_idx on public.mant_zona_horario_semanal (zona_comun_id);

comment on table public.mant_zona_horario_semanal is
  'EXT-13 (Ola 2, M18): franjas horarias permitidas por día de semana para una zona común '
  '(típicamente el ascensor/zona de mudanzas). 0=domingo..6=sábado (public.extract(dow from date), '
  'mismo criterio que JS Date.prototype.getDay() — sin conversión en ningún extremo). Una zona '
  'sin ninguna fila aquí se comporta exactamente igual que antes de este corte (sin restricción '
  'de horario) — el corte es aditivo, nunca retroactivo.';

create policy mant_zona_horario_semanal_select_miembro
  on public.mant_zona_horario_semanal for select
  to authenticated
  using (public.is_member(tenant_id));

-- Mismo criterio exacto que mant_zona_reserva_regla (20260932720000): solo administrador
-- gestiona la configuración de una zona (crear/editar/borrar franjas), staff auxiliar y el actor
-- externo solo leen (el externo ni siquiera por RLS — lee vía external-reservas-disponibilidad
-- con admin client, mismo patrón ya establecido por esa función para zonas_comunes/
-- mant_zona_reserva_regla).
create policy mant_zona_horario_semanal_administrador_todo
  on public.mant_zona_horario_semanal for all
  to authenticated
  using (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]));

-- ── guard_mant_reserva(): agrega la validación de horario semanal ────────────────────────────
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

    -- EXT-13 (Ola 2, M18): si la zona tiene AL MENOS UNA fila en mant_zona_horario_semanal, la
    -- franja pedida debe caer DENTRO de alguna franja configurada para ese día de la semana —
    -- mismo criterio que las validaciones de arriba (un solo punto: este guard). Una zona sin
    -- ninguna fila aquí no entra a este bloque, exactamente el mismo comportamiento de siempre.
    if exists (
      select 1 from public.mant_zona_horario_semanal
       where zona_comun_id = new.zona_comun_id and tenant_id = new.tenant_id
    ) then
      if not exists (
        select 1 from public.mant_zona_horario_semanal
         where zona_comun_id = new.zona_comun_id
           and tenant_id = new.tenant_id
           and dia_semana = extract(dow from new.fecha)
           and hora_desde <= new.hora_inicio
           and hora_hasta >= new.hora_fin
      ) then
        raise exception 'RESERVA_FUERA_DE_HORARIO_SEMANAL: la zona % no tiene un horario '
          'configurado que cubra % de % a %', new.zona_comun_id, new.fecha, new.hora_inicio, new.hora_fin;
      end if;
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
  'MANT-10 §3.3, extendido por EXT-03 (20260932850000) y EXT-13 (20260947000000, M18): valida '
  'cupo/traslape/vínculo/ventana/duración/horario-semanal y promueve a aprobada si la regla no '
  'exige aprobación. Transiciones válidas: solicitada -> aprobada/rechazada/cancelada; aprobada '
  '-> completada/cancelada/no_show. cancelada desde solicitada nunca queda penalizada (el bloque '
  'de penalidad exige old.estado=aprobada). El cargo de una reserva auto-aprobada con '
  'genera_cargo=true lo crea mant_reserva_generar_cargo_auto_aprobada (AFTER INSERT, EXT-03).';
