-- ═══════════════════════════════════════════════════════════════════════
--  Personalización del menú lateral por tenant (orden y grupos).
--
--  El catálogo de ítems/grupos (rutas, íconos, permisos) sigue viviendo en
--  código (apps/web/app/utils/navegacion.ts) — esta tabla SOLO guarda el
--  orden preferido del tenant, referenciando grupos por su título e ítems
--  por su ruta (`to`), ambos ya estables. Nunca introduce una ruta o
--  permiso nuevo: el filtro de visibilidad (puedeVer, en NavSidebar.vue)
--  sigue aplicando siempre después de este orden, sin cambios.
-- ═══════════════════════════════════════════════════════════════════════

create table public.sidebar_config (
  tenant_id       uuid primary key references public.tenants(id) on delete cascade,
  configuracion   jsonb not null default '{}'::jsonb,
  actualizado_por uuid references auth.users(id),
  actualizado_at  timestamptz not null default now()
);

comment on table public.sidebar_config is
  'Orden/agrupación del menú lateral personalizado por el administrador de cada tenant. '
  'La forma de `configuracion` es { grupos: string[] (titulos, en el orden deseado), '
  'items: Record<string, string[]> (titulo de grupo -> rutas `to`, en el orden deseado) }. '
  'Grupos/items no mencionados se agregan al final en su posición original — un ítem nuevo '
  'agregado por un corte futuro en navegacion.ts aparece solo, sin requerir migrar esta tabla.';

comment on column public.sidebar_config.configuracion is
  'Solo reordena/reagrupa el catálogo fijo de navegacion.ts — nunca contiene una ruta, ícono '
  'o permiso que no exista ya ahí. El filtro de visibilidad por rol/permiso de NavSidebar.vue '
  'se aplica siempre después de este orden, sin excepción.';

alter table public.sidebar_config enable row level security;
alter table public.sidebar_config force row level security;

create policy sidebar_config_select_miembro on public.sidebar_config
  for select to authenticated
  using (public.is_member(tenant_id));

-- Solo administrador (a diferencia de ia_config/'auxiliar'): el usuario pidió
-- explícitamente que personalizar el menú sea privilegio del administrador.
create policy sidebar_config_insert_administrador on public.sidebar_config
  for insert to authenticated
  with check (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]));

create policy sidebar_config_update_administrador on public.sidebar_config
  for update to authenticated
  using (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]));
