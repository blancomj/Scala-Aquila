-- ═══════════════════════════════════════════════════════════════════════
--  EXS-6 · Marketplace (4/4) — interés, reporte, listado y módulo
-- ═══════════════════════════════════════════════════════════════════════

-- ── Interés ───────────────────────────────────────────────────────────
--
--  POR QUÉ NO VA A `solicitudes` (Atención), que es lo que el prompt 05
--  §15 pedía estudiar: se estudió, y no encaja. `solicitudes` es el
--  radicado formal de una PQRS — consecutivo único por año, SLA con fecha
--  de vencimiento, `inmueble_id` y `solicitante_ref` NOT NULL, enlace a
--  expedientes de convivencia y a decisiones de gobierno. Abrir un radicado
--  con SLA cada vez que alguien pregunta por un sofá usado no es reutilizar
--  el dominio: es desnaturalizarlo, y además mete a la administración en
--  una transacción de la que Johnny decidió expresamente que se mantenga
--  fuera. El interés es un post-it, no un caso.

create table public.publicacion_interes (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants (id) on delete cascade,
  publicacion_id        uuid not null references public.publicaciones (id) on delete cascade,

  -- Quién se interesó. Nullable porque hoy lo anota el staff de oído
  -- ("vino alguien del 302 preguntando") y puede no saber a qué tercero
  -- corresponde; cuando el residente lo deje él mismo, vendrá siempre.
  interesado_tercero_id uuid references public.terceros (id),
  interesado_nombre     text,
  mensaje               text,

  atendido              boolean not null default false,
  atendido_at           timestamptz,

  created_at            timestamptz not null default now(),
  registrado_por        uuid references public.profiles (id),

  constraint publicacion_interes_alguien check (
    interesado_tercero_id is not null
    or (interesado_nombre is not null and btrim(interesado_nombre) <> '')
  ),
  constraint publicacion_interes_atencion_coherente check (
    atendido = (atendido_at is not null)
  )
);

create index publicacion_interes_publicacion_idx
  on public.publicacion_interes (publicacion_id);
create index publicacion_interes_pendiente_idx
  on public.publicacion_interes (tenant_id) where not atendido;

alter table public.publicacion_interes enable row level security;
alter table public.publicacion_interes force row level security;

create policy publicacion_interes_select_miembro on public.publicacion_interes
  for select
  using (public.is_member(tenant_id) and public.puede_ver_modulo(tenant_id, 'marketplace'));

create policy publicacion_interes_write_agente on public.publicacion_interes
  for all
  using (public.has_role(tenant_id, array['auxiliar', 'administrador']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar', 'administrador']::public.tenant_role_t[]));

comment on table public.publicacion_interes is
  'EXS-6 §15 — "estoy interesado". Es el ÚNICO canal de contacto: la publicación no lleva teléfono '
  'ni correo (§22), así que el interés es lo que pone en contacto a las partes. La administración '
  'los presenta y se aparta — no media ni garantiza la transacción.';

-- Un interés solo tiene sentido sobre algo que está en el tablón.
create function public.guard_publicacion_interes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pub record;
begin
  select tenant_id, estado into v_pub
    from public.publicaciones where id = new.publicacion_id;

  if v_pub.tenant_id is null or v_pub.tenant_id <> new.tenant_id then
    raise exception 'INTERES_TENANT_INCONSISTENTE: la publicación % no pertenece al tenant',
      new.publicacion_id;
  end if;

  if tg_op = 'INSERT' and v_pub.estado <> 'publicada' then
    raise exception 'INTERES_PUBLICACION_NO_DISPONIBLE: solo se puede expresar interés en una '
      'publicación que está en el tablón';
  end if;

  if new.atendido and (tg_op = 'INSERT' or not old.atendido) then
    new.atendido_at := coalesce(new.atendido_at, now());
  end if;

  if tg_op = 'INSERT' then
    new.registrado_por := coalesce(new.registrado_por, (select auth.uid()));
  end if;

  return new;
end;
$$;

create trigger publicacion_interes_guard
  before insert or update on public.publicacion_interes
  for each row execute function public.guard_publicacion_interes();

revoke execute on function public.guard_publicacion_interes() from public, authenticated, anon;

-- ── Reporte ───────────────────────────────────────────────────────────
--
--  Mismo razonamiento que el interés, aunque aquí la tentación de usar
--  `solicitudes` era mayor —un reporte SÍ es un caso que alguien atiende y
--  resuelve—: no encaja porque `solicitudes` exige `solicitante_ref` (un
--  tercero) e `inmueble_id`, ambos NOT NULL, y quien reporta hoy es un
--  miembro del equipo, que no tiene ni lo uno ni lo otro. Forzarlo pediría
--  inventar un tercero y un inmueble ficticios por cada reporte.

create table public.publicacion_reporte (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  publicacion_id uuid not null references public.publicaciones (id) on delete cascade,

  motivo_id      bigint not null references public.lista_tipos (id),
  descripcion    text,

  resuelto       boolean not null default false,
  resolucion     text,
  resuelto_por   uuid references public.profiles (id),
  resuelto_at    timestamptz,

  created_at     timestamptz not null default now(),
  reportado_por  uuid references public.profiles (id),

  constraint publicacion_reporte_resolucion_coherente check (
    resuelto = (resuelto_at is not null)
  ),
  constraint publicacion_reporte_resolucion_con_texto check (
    not resuelto or (resolucion is not null and btrim(resolucion) <> '')
  )
);

create index publicacion_reporte_publicacion_idx on public.publicacion_reporte (publicacion_id);
create index publicacion_reporte_pendiente_idx
  on public.publicacion_reporte (tenant_id) where not resuelto;

alter table public.publicacion_reporte enable row level security;
alter table public.publicacion_reporte force row level security;

create policy publicacion_reporte_select_miembro on public.publicacion_reporte
  for select
  using (public.is_member(tenant_id) and public.puede_ver_modulo(tenant_id, 'marketplace'));

create policy publicacion_reporte_insert_miembro on public.publicacion_reporte
  for insert
  with check (public.is_member(tenant_id));

-- Resolver un reporte es un acto de moderación: exige administrador.
create policy publicacion_reporte_update_administrador on public.publicacion_reporte
  for update
  using (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]));

comment on table public.publicacion_reporte is
  'EXS-6 §14 — reporte de una publicación. Tabla propia y NO `solicitudes`: aquella exige '
  'solicitante (tercero) e inmueble NOT NULL, consecutivo anual y SLA, y quien reporta aquí es un '
  'miembro del equipo que no tiene ni tercero ni inmueble. Reportar lo puede cualquier miembro; '
  'resolver, solo administrador.';

create function public.guard_publicacion_reporte()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_familia text;
  v_tenant  uuid;
begin
  select lt.tipo into v_familia from public.lista_tipos lt where lt.id = new.motivo_id;
  if v_familia is distinct from 'MOTIVO_REPORTE_MARKETPLACE' then
    raise exception 'REPORTE_MOTIVO_INVALIDO: % no pertenece a MOTIVO_REPORTE_MARKETPLACE',
      new.motivo_id;
  end if;

  select tenant_id into v_tenant from public.publicaciones where id = new.publicacion_id;
  if v_tenant is null or v_tenant <> new.tenant_id then
    raise exception 'REPORTE_TENANT_INCONSISTENTE: la publicación % no pertenece al tenant',
      new.publicacion_id;
  end if;

  if tg_op = 'INSERT' then
    new.reportado_por := coalesce(new.reportado_por, (select auth.uid()));
  end if;

  if new.resuelto and (tg_op = 'INSERT' or not old.resuelto) then
    new.resuelto_at  := coalesce(new.resuelto_at, now());
    new.resuelto_por := coalesce(new.resuelto_por, (select auth.uid()));
  end if;

  return new;
end;
$$;

create trigger publicacion_reporte_guard
  before insert or update on public.publicacion_reporte
  for each row execute function public.guard_publicacion_reporte();

revoke execute on function public.guard_publicacion_reporte() from public, authenticated, anon;

-- ── El tablón ─────────────────────────────────────────────────────────
--
--  Función y no vista, por el mismo motivo que fn_directorio_listar en
--  EXS-4: una vista dejaría `publicador_tercero_id` al alcance de un select
--  más ancho, y lo que identifica públicamente a quien publica debe ser
--  `identidad_publica` y nada más (§7, §22).

create function public.fn_marketplace_listar(
  p_tenant_id  uuid,
  p_categoria  bigint default null,
  p_tipo       bigint default null,
  p_texto      text default null
)
returns table (
  id                uuid,
  titulo            text,
  descripcion       text,
  identidad_publica text,
  tipo_codigo       text,
  tipo_nombre       text,
  categoria_codigo  text,
  categoria_nombre  text,
  condicion_nombre  text,
  precio            numeric,
  moneda            char(3),
  negociable        boolean,
  publicada_at      timestamptz,
  vigente_hasta     date,
  intereses         bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_member(p_tenant_id) then
    raise exception 'MARKETPLACE_NO_DISPONIBLE: no hay marketplace para esta copropiedad';
  end if;

  return query
  select
    p.id,
    p.titulo,
    p.descripcion,
    p.identidad_publica,
    lt.codigo,
    lt.nombre,
    lc.codigo,
    lc.nombre,
    lcond.nombre,
    p.precio,
    p.moneda,
    p.negociable,
    p.publicada_at,
    p.vigente_hasta,
    (select count(*) from public.publicacion_interes i where i.publicacion_id = p.id)
  from public.publicaciones p
  join public.lista_tipos lt on lt.id = p.tipo_id
  join public.lista_tipos lc on lc.id = p.categoria_id
  left join public.lista_tipos lcond on lcond.id = p.condicion_id
  where p.tenant_id = p_tenant_id
    and p.estado = 'publicada'
    and (p_categoria is null or p.categoria_id = p_categoria)
    and (p_tipo is null or p.tipo_id = p_tipo)
    and (
      p_texto is null
      or btrim(p_texto) = ''
      -- unaccent + lower: buscar "bicicleta" encuentra "Bicicleta" y
      -- buscar "television" encuentra "Televisión". Mismo criterio que
      -- fn_directorio_listar.
      or public.fn_unaccent_immutable(lower(p.titulo)) like '%' || public.fn_unaccent_immutable(lower(p_texto)) || '%'
      or public.fn_unaccent_immutable(lower(coalesce(p.descripcion, ''))) like
         '%' || public.fn_unaccent_immutable(lower(p_texto)) || '%'
    )
  order by p.publicada_at desc;
end;
$$;

comment on function public.fn_marketplace_listar is
  'EXS-6 — el tablón visible. Función y no vista para que `publicador_tercero_id` no quede al '
  'alcance de un select: lo público es `identidad_publica` (§7, §22). Solo devuelve lo que está '
  'en estado ''publicada''; los borradores y lo pendiente de aprobar se consultan por la tabla, '
  'que es lo que el equipo administrativo necesita para trabajarlos.';

revoke execute on function public.fn_marketplace_listar(uuid, bigint, bigint, text)
  from public, anon;
grant execute on function public.fn_marketplace_listar(uuid, bigint, bigint, text)
  to authenticated, service_role;

-- ── El módulo 'marketplace' ───────────────────────────────────────────
--
--  Mismo criterio que 'anuncios' (EXS-3) y 'movilidad' (EXS-5): sembrar
--  los roles funcionales existentes evita el efecto perverso de que
--  asignarle a alguien un rol cualquiera le oculte el tablón.

insert into public.rol_funcional_modulo (lista_tipos_id, modulo)
select lt.id, 'marketplace'
from public.lista_tipos lt
where lt.tipo = 'ROL_FUNCIONAL'
on conflict (lista_tipos_id, modulo) do nothing;
