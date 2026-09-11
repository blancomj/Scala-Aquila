-- ═══════════════════════════════════════════════════════════════════════
--  MANT-10 · Reservas de zonas comunes (3/5) — mant_reservas
--  Casos de uso/Solicitudes - Reservas - Visitantes/MANT_10_reservas_zonas_comunes.md §3.2-3.3
--
--  Desviaciones frente al spec:
--   - `creado_at` -> `created_at`, alineado con la convención del dominio MANT
--     (mant_matriz_prioridad, activos, etc.), no con EXT-01 (que sí usó
--     `creado_at` porque así lo pedía su propio spec).
--   - `penalizada boolean` no está en el bloque de esquema de §3.2 pero el
--     texto de guards (regla de penalidad tardía) la exige — se agrega.
--   - `zona_cupo_simultaneo` (nueva, no está en el mockup del spec): snapshot
--     inmutable de mant_zona_reserva_regla.cupo_simultaneo tomado al crear la
--     reserva. Necesaria porque un EXCLUDE constraint no puede consultar otra
--     tabla dinámicamente — solo así el exclude puede aplicarse condicionado
--     (cupo = 1) sin bloquear las zonas de cupo > 1 (prueba 2), cuyo guard es
--     un conteo de traslapes en el trigger, tal como el spec mismo pide
--     ("verificar con un conteo en vez de exclusión pura cuando
--     cupo_simultaneo > 1", §3.3).
-- ═══════════════════════════════════════════════════════════════════════

create table public.mant_reservas (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references public.tenants (id) on delete cascade,
  zona_comun_id          uuid not null references public.zonas_comunes (id),
  inmueble_id            uuid not null references public.inmuebles (id),
  solicitante_ref        uuid,
  solicitante_origen     public.reserva_solicitante_t not null,
  fecha                  date not null,
  hora_inicio            time not null,
  hora_fin               time not null,
  estado                 public.reserva_estado_t not null default 'solicitada',
  motivo_rechazo         text,
  motivo_cancelacion     text,
  aprobada_por           uuid references public.profiles (id),
  aprobada_at            timestamptz,
  cargo_id               uuid references public.cargos (id),
  penalizada             boolean not null default false,
  zona_cupo_simultaneo   integer,
  created_at             timestamptz not null default now(),

  constraint mant_reservas_horario_valido check (hora_fin > hora_inicio)
);

alter table public.mant_reservas enable row level security;
alter table public.mant_reservas force row level security;

create index mant_reservas_tenant_idx on public.mant_reservas (tenant_id);
create index mant_reservas_zona_fecha_idx on public.mant_reservas (zona_comun_id, fecha);
create index mant_reservas_inmueble_idx on public.mant_reservas (inmueble_id);

comment on table public.mant_reservas is
  'MANT-10 §3.2: reservas de zonas comunes. Sin traslapes garantizado por '
  'mant_reservas_sin_traslape (exclude using gist, cupo=1) + conteo en guard_mant_reserva '
  '(cupo>1) — nunca por validación de aplicación.';

comment on column public.mant_reservas.zona_cupo_simultaneo is
  'Snapshot inmutable de mant_zona_reserva_regla.cupo_simultaneo al momento de crear la '
  'reserva, tomado por guard_mant_reserva. No está en el spec original — necesario para que el '
  'exclude constraint pueda condicionarse a cupo=1 sin depender de una subconsulta.';

-- btree_gist ya existe (20260822220000_cartera_tasas_referencia.sql).
alter table public.mant_reservas
  add constraint mant_reservas_sin_traslape
  exclude using gist (
    zona_comun_id with =,
    tsrange(fecha + hora_inicio, fecha + hora_fin) with &&
  ) where (estado in ('solicitada', 'aprobada') and zona_cupo_simultaneo = 1);

create function public.guard_mant_reserva()
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
      (old.estado = 'solicitada' and new.estado in ('aprobada', 'rechazada'))
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

create trigger guard_mant_reserva
  before insert or update on public.mant_reservas
  for each row execute function public.guard_mant_reserva();

create policy mant_reservas_select_miembro
  on public.mant_reservas for select
  to authenticated
  using (public.is_member(tenant_id));

create policy mant_reservas_staff_todo
  on public.mant_reservas for all
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

revoke execute on function public.guard_mant_reserva() from public, anon, authenticated;
