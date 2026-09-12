-- ═══════════════════════════════════════════════════════════════════════
--  EXS-5 · Vehículos (3/4) — permisos de acceso
--
--  Registrar NO es autorizar (prompt 04 §16). Son dos hechos distintos y
--  por eso son dos tablas: un vehículo puede estar registrado en la
--  copropiedad sin tener permiso de entrar, y eso debe poder decirse.
--
--  POR QUÉ NO CONVERGE CON mant_autorizaciones_visita (MANT-11), que era
--  la pregunta abierta de la hoja de ruta: aquella modela una visita de UN
--  SOLO USO — visitante_nombre, fecha_prevista, hora_desde/hasta, un QR
--  que se consume y un estado que transiciona a 'usada'. El vehículo de un
--  residente entra a diario durante años. Meterlos en la misma tabla
--  dejaría un enum donde la mitad de los estados no aplica a la mitad de
--  las filas, y un QR de un solo uso que nadie consumiría nunca.
--
--  La frontera queda así, y se documenta para que nadie la cruce por
--  descuido:
--    · visita puntual, con o sin carro  → mant_autorizaciones_visita
--    · movilidad estable de la copropiedad → vehiculo_permiso
-- ═══════════════════════════════════════════════════════════════════════

create table public.vehiculo_permiso (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  vehiculo_id      uuid not null references public.vehiculos (id) on delete cascade,

  tipo_id          bigint not null references public.lista_tipos (id),

  vigente_desde    date not null default current_date,
  vigente_hasta    date,

  estado           public.permiso_vehiculo_estado_t not null default 'vigente',

  -- Dónde aplica, cuando aplica en algún sitio concreto: el parqueadero
  -- asignado es un inmueble más (prompt 04 §19 — no se crea un segundo
  -- modelo de parqueaderos; si existe como inmueble, se reutiliza).
  inmueble_id      uuid references public.inmuebles (id) on delete set null,

  motivo           text,
  otorgado_por     uuid references public.profiles (id),
  created_at       timestamptz not null default now(),

  revocado_at      timestamptz,
  revocado_por     uuid references public.profiles (id),
  motivo_revocacion text,

  constraint vehiculo_permiso_vigencia_coherente check (
    vigente_hasta is null or vigente_hasta >= vigente_desde
  ),
  constraint vehiculo_permiso_revocacion_coherente check (
    (estado = 'revocado') = (revocado_at is not null)
  ),
  constraint vehiculo_permiso_revocacion_con_motivo check (
    estado <> 'revocado'
    or (motivo_revocacion is not null and btrim(motivo_revocacion) <> '')
  )
);

create index vehiculo_permiso_vehiculo_idx on public.vehiculo_permiso (vehiculo_id);
-- Para la consulta de portería: los permisos que hoy pueden dejar entrar.
create index vehiculo_permiso_vigente_idx
  on public.vehiculo_permiso (tenant_id, vigente_desde, vigente_hasta)
  where estado = 'vigente';

alter table public.vehiculo_permiso enable row level security;
alter table public.vehiculo_permiso force row level security;

create policy vehiculo_permiso_select_miembro on public.vehiculo_permiso
  for select
  using (public.is_member(tenant_id) and public.puede_ver_modulo(tenant_id, 'movilidad'));

-- Otorgar y revocar un permiso de acceso es más sensible que registrar un
-- carro: exige administrador, no basta con poder escribir.
create policy vehiculo_permiso_write_administrador on public.vehiculo_permiso
  for all
  using (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]));

comment on table public.vehiculo_permiso is
  'EXS-5 — autorización de acceso o parqueadero de un vehículo, con vigencia. Separada de '
  'vehiculos porque registrar no es autorizar (prompt 04 §16), y separada de '
  'mant_autorizaciones_visita porque aquella modela una visita de un solo uso con QR consumible '
  'y esta una habilitación estable. Solo administrador la otorga o revoca.';

comment on column public.vehiculo_permiso.inmueble_id is
  'Parqueadero asignado, cuando lo hay. Es un inmueble más: no se crea un segundo modelo de '
  'parqueaderos (prompt 04 §19/§20).';

-- ── Guard: coherencia y sellado de la revocación ──────────────────────

create function public.guard_vehiculo_permiso()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo    text;
  v_vehiculo record;
begin
  select tipo into v_tipo from public.lista_tipos where id = new.tipo_id;
  if v_tipo is distinct from 'TIPO_PERMISO_VEHICULO' then
    raise exception 'PERMISO_VEHICULO_TIPO_INVALIDO: % no pertenece a TIPO_PERMISO_VEHICULO',
      new.tipo_id;
  end if;

  select tenant_id, estado into v_vehiculo from public.vehiculos where id = new.vehiculo_id;
  if v_vehiculo.tenant_id is null or v_vehiculo.tenant_id <> new.tenant_id then
    raise exception 'PERMISO_VEHICULO_TENANT_INCONSISTENTE: el vehículo % no pertenece al tenant',
      new.vehiculo_id;
  end if;

  -- Un vehículo retirado no puede recibir permisos nuevos: retirar es
  -- terminal y su placa ya puede estar en uso por otro carro.
  if v_vehiculo.estado = 'retirado' and new.estado = 'vigente' then
    raise exception 'PERMISO_VEHICULO_RETIRADO: el vehículo % está retirado y no puede recibir '
      'permisos vigentes', new.vehiculo_id;
  end if;

  if new.estado = 'revocado' and (tg_op = 'INSERT' or old.estado <> 'revocado') then
    new.revocado_at := coalesce(new.revocado_at, now());
    new.revocado_por := coalesce(new.revocado_por, (select auth.uid()));
  end if;

  return new;
end;
$$;

create trigger vehiculo_permiso_guard
  before insert or update on public.vehiculo_permiso
  for each row execute function public.guard_vehiculo_permiso();

revoke execute on function public.guard_vehiculo_permiso() from public, authenticated, anon;

-- ── Retirar un vehículo revoca sus permisos ───────────────────────────
--
--  Sin esto, un carro retirado dejaría permisos 'vigente' colgando, y la
--  consulta de portería —que filtra por estado y fecha— seguiría diciendo
--  que puede entrar. La consistencia la impone la base, no la UI.

create function public.tg_vehiculo_retiro_revoca_permisos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.estado = 'retirado' and old.estado <> 'retirado' then
    update public.vehiculo_permiso
       set estado = 'revocado',
           revocado_at = now(),
           revocado_por = (select auth.uid()),
           motivo_revocacion = coalesce(
             motivo_revocacion,
             'Revocado automáticamente al retirar el vehículo'
           )
     where vehiculo_id = new.id
       and estado = 'vigente';
  end if;
  return new;
end;
$$;

create trigger vehiculo_retiro_revoca_permisos
  after update on public.vehiculos
  for each row execute function public.tg_vehiculo_retiro_revoca_permisos();

revoke execute on function public.tg_vehiculo_retiro_revoca_permisos() from public, authenticated, anon;

comment on function public.tg_vehiculo_retiro_revoca_permisos is
  'EXS-5 — retirar un vehículo revoca sus permisos vigentes. Sin esto, la consulta de portería '
  'seguiría autorizando a un carro que ya no pertenece a la copropiedad: la coherencia entre '
  'estado y permiso la garantiza la base, no la pantalla que lo retiró.';

-- ── Consulta de portería ──────────────────────────────────────────────

create function public.fn_vehiculo_por_placa(p_tenant_id uuid, p_placa text)
returns table (
  vehiculo_id      uuid,
  placa            text,
  tipo             text,
  marca            text,
  modelo           text,
  color            text,
  estado           public.vehiculo_estado_t,
  autorizado       boolean,
  permiso_hasta    date,
  responsables     text[],
  inmuebles        text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_member(p_tenant_id) then
    raise exception 'VEHICULO_NO_ENCONTRADO: no hay vehículo con esa placa';
  end if;

  return query
  select
    v.id,
    v.placa,
    lt.nombre,
    v.marca,
    v.modelo,
    v.color,
    v.estado,
    -- "Autorizado" es derivado, nunca una columna: un permiso con
    -- vigente_hasta en el pasado deja de autorizar por sí solo, sin que
    -- ningún job tenga que pasar a marcarlo.
    exists (
      select 1 from public.vehiculo_permiso p
      where p.vehiculo_id = v.id
        and p.estado = 'vigente'
        and p.vigente_desde <= current_date
        and (p.vigente_hasta is null or p.vigente_hasta >= current_date)
    ),
    (
      select max(p.vigente_hasta) from public.vehiculo_permiso p
      where p.vehiculo_id = v.id and p.estado = 'vigente'
    ),
    coalesce((
      select array_agg(distinct t.nombre_completo)
      from public.vehiculo_relacion r
      join public.terceros t on t.id = r.tercero_id
      where r.vehiculo_id = v.id and r.vigente_hasta is null
    ), '{}'::text[]),
    coalesce((
      select array_agg(distinct i.codigo)
      from public.vehiculo_relacion r
      join public.inmuebles i on i.id = r.inmueble_id
      where r.vehiculo_id = v.id and r.vigente_hasta is null
    ), '{}'::text[])
  from public.vehiculos v
  join public.lista_tipos lt on lt.id = v.tipo_id
  where v.tenant_id = p_tenant_id
    and v.placa_normalizada = public.fn_normalizar_placa(p_placa);
end;
$$;

comment on function public.fn_vehiculo_por_placa is
  'EXS-5 — consulta de portería: quién responde por este carro y si hoy puede entrar. Busca por '
  'placa normalizada, así que da igual cómo la teclee quien pregunta. `autorizado` se DERIVA de '
  'los permisos y la fecha, nunca se lee de una columna: un permiso vencido deja de autorizar '
  'solo. Devuelve cero filas para una placa desconocida, sin distinguirla de una ajena.';

revoke execute on function public.fn_vehiculo_por_placa(uuid, text) from public, anon;
grant execute on function public.fn_vehiculo_por_placa(uuid, text) to authenticated, service_role;
