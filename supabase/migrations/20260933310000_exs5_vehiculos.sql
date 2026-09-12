-- ═══════════════════════════════════════════════════════════════════════
--  EXS-5 · Vehículos (2/4) — el vehículo y sus relaciones
--
--  Un solo modelo de vehículo (prompt 04 §3): no hay
--  vehiculos_residenciales / _comerciales / _proveedores. Las diferencias
--  se expresan por RELACIÓN, no por tabla — el furgón de reparto del local
--  15 y el carro del apartamento 501 son la misma entidad con relaciones
--  distintas.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Normalización de la placa ─────────────────────────────────────────
--
--  Una sola implementación, server-side (prompt 04 §32: "evitar
--  implementaciones distintas en Vue, Edge Function y SQL"). Es IMMUTABLE
--  para poder usarse en una columna generada, que es lo que garantiza que
--  nadie pueda insertar una placa sin normalizar ni siquiera con
--  service_role: no hay camino que salte la generación.

create function public.fn_normalizar_placa(p_placa text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select upper(regexp_replace(p_placa, '[^a-zA-Z0-9]', '', 'g'))
$$;

comment on function public.fn_normalizar_placa is
  'EXS-5 — forma canónica de una placa: mayúsculas y solo alfanuméricos, de modo que "abc-123", '
  '"ABC 123" y "abc123" sean la misma. IMMUTABLE porque la usa una columna generada, y eso es '
  'justamente lo que hace imposible guardar una placa sin normalizar por ninguna vía.';

create table public.vehiculos (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants (id) on delete cascade,

  -- Se conserva lo que el usuario escribió (para mostrarlo tal cual) y se
  -- deriva la forma canónica (para comparar y buscar).
  placa              text not null,
  placa_normalizada  text generated always as (public.fn_normalizar_placa(placa)) stored,

  tipo_id            bigint not null references public.lista_tipos (id),
  servicio_id        bigint references public.lista_tipos (id),
  marca              text,
  modelo             text,
  color              text,
  anio               smallint,

  estado             public.vehiculo_estado_t not null default 'activo',
  retirado_at        timestamptz,
  motivo_retiro      text,

  observaciones      text,
  created_at         timestamptz not null default now(),
  creado_por         uuid references public.profiles (id),
  updated_at         timestamptz,

  constraint vehiculos_placa_no_vacia check (btrim(placa) <> ''),
  constraint vehiculos_anio_razonable check (anio is null or (anio between 1900 and 2100)),
  constraint vehiculos_retiro_coherente check (
    (estado = 'retirado') = (retirado_at is not null)
  )
);

-- Unicidad entre los ACTIVOS, historia conservada (decisión del usuario):
-- dos vehículos vigentes no pueden compartir placa, pero uno retirado
-- conserva su fila y su historial, y su placa queda libre para el carro
-- nuevo que llegue con ella.
create unique index vehiculos_placa_vigente_idx
  on public.vehiculos (tenant_id, placa_normalizada)
  where estado <> 'retirado';

create index vehiculos_tenant_estado_idx on public.vehiculos (tenant_id, estado);

alter table public.vehiculos enable row level security;
alter table public.vehiculos force row level security;

create policy vehiculos_select_miembro on public.vehiculos
  for select
  using (public.is_member(tenant_id) and public.puede_ver_modulo(tenant_id, 'movilidad'));

create policy vehiculos_insert_agente on public.vehiculos
  for insert
  with check (public.has_role(tenant_id, array['auxiliar', 'administrador']::public.tenant_role_t[]));

create policy vehiculos_update_agente on public.vehiculos
  for update
  using (public.has_role(tenant_id, array['auxiliar', 'administrador']::public.tenant_role_t[]));

-- Sin delete: un vehículo se retira, no se borra — su historial de accesos
-- y permisos es evidencia.

comment on table public.vehiculos is
  'EXS-5 — un único modelo de vehículo para residentes, empresas, proveedores y visitantes '
  'frecuentes (prompt 04 §3). Las diferencias van en vehiculo_relacion, no en tablas separadas. '
  'La placa se guarda como se escribió y se compara por placa_normalizada, columna generada.';

comment on column public.vehiculos.placa_normalizada is
  'Columna GENERADA con fn_normalizar_placa. Generada y no escrita por un trigger para que no '
  'exista ningún camino —ni service_role— capaz de guardar una placa sin normalizar.';

-- ── Relaciones: con quién y con qué unidad, y desde cuándo ────────────

create table public.vehiculo_relacion (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  vehiculo_id    uuid not null references public.vehiculos (id) on delete cascade,

  -- Al menos uno de los dos. Un vehículo puede estar ligado a una unidad
  -- (el parqueadero del 501), a una persona (el proveedor que viene a
  -- reparar), o a ambas.
  tercero_id     uuid references public.terceros (id) on delete cascade,
  inmueble_id    uuid references public.inmuebles (id) on delete cascade,

  rol_id         bigint not null references public.lista_tipos (id),

  vigente_desde  date not null default current_date,
  vigente_hasta  date,

  created_at     timestamptz not null default now(),

  constraint vehiculo_relacion_algun_extremo check (
    tercero_id is not null or inmueble_id is not null
  ),
  constraint vehiculo_relacion_vigencia_coherente check (
    vigente_hasta is null or vigente_hasta >= vigente_desde
  )
);

create index vehiculo_relacion_vehiculo_idx on public.vehiculo_relacion (vehiculo_id);
create index vehiculo_relacion_tercero_idx on public.vehiculo_relacion (tercero_id)
  where tercero_id is not null;
create index vehiculo_relacion_inmueble_idx on public.vehiculo_relacion (inmueble_id)
  where inmueble_id is not null;

alter table public.vehiculo_relacion enable row level security;
alter table public.vehiculo_relacion force row level security;

create policy vehiculo_relacion_select_miembro on public.vehiculo_relacion
  for select
  using (public.is_member(tenant_id) and public.puede_ver_modulo(tenant_id, 'movilidad'));

create policy vehiculo_relacion_write_agente on public.vehiculo_relacion
  for all
  using (public.has_role(tenant_id, array['auxiliar', 'administrador']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar', 'administrador']::public.tenant_role_t[]));

comment on table public.vehiculo_relacion is
  'EXS-5 — con quién y con qué unidad se relaciona un vehículo, y desde cuándo. Con vigencia '
  'porque un carro cambia de dueño y un arrendatario se va: cerrar la relación (vigente_hasta) '
  'conserva la historia, que es justo lo que permite responder "de quién era este carro en '
  'marzo" (prompt 04 §14, GC-005).';

comment on column public.vehiculo_relacion.rol_id is
  'lista_tipos familia ROL_VEHICULO. No se asume que el propietario del vehículo sea el del '
  'inmueble (prompt 04 §10): son relaciones independientes y se guardan por separado.';
