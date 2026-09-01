-- ═══════════════════════════════════════════════════════════════════════
--  plantillas_compositor — compositor de correo flotante (Buildium-style)
--
--  Plantillas libres para envío manual ad-hoc (N por tenant, sin evento
--  asociado). Distinto de email_templates (una plantilla por evento,
--  envío automático vía Brevo templates) y de plantillas_sms.
--
--  Dos niveles de activación:
--   1. tenants.compositor_correo_activo — muestra/oculta el botón global
--   2. plantillas_compositor.activa — activa/desactiva una plantilla puntual
--
--  Roles (20260830100000): administrador ⊇ auxiliar (has_role superset).
--   - SELECT: auxiliar + administrador (lectura/uso del compositor)
--   - INSERT/UPDATE/DELETE: solo administrador (gestión de plantillas)
-- ═══════════════════════════════════════════════════════════════════════

-- ── Columna de activación a nivel de tenant ───────────────────────────
alter table public.tenants
  add column compositor_correo_activo boolean not null default false;

comment on column public.tenants.compositor_correo_activo is
  'Muestra u oculta el compositor de correo flotante para este tenant. '
  'Se cambia únicamente vía fn_toggle_compositor_correo, nunca por UPDATE directo.';

-- ── Tabla de plantillas del compositor ────────────────────────────────
create table public.plantillas_compositor (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  nombre          text not null,
  asunto          text not null,
  cuerpo          text not null check (char_length(cuerpo) >= 10),
  activa          boolean not null default true,
  creado_por      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz,
  unique (tenant_id, nombre)
);

alter table public.plantillas_compositor enable row level security;
alter table public.plantillas_compositor force row level security;

create index plantillas_compositor_tenant_idx on public.plantillas_compositor (tenant_id);

comment on table public.plantillas_compositor is
  'Plantillas libres del compositor de correo flotante — N por tenant, '
  'sin evento asociado. El usuario las elige manualmente al redactar un '
  'correo rápido. activa es la baja/alta lógica de la plantilla.';

-- ── RLS ───────────────────────────────────────────────────────────────
-- SELECT: auxiliar + administrador (uso del compositor día a día)
create policy plantillas_compositor_select_miembro
  on public.plantillas_compositor for select
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar','administrador']::public.tenant_role_t[]));

-- INSERT: solo administrador
create policy plantillas_compositor_insert_admin
  on public.plantillas_compositor for insert
  to authenticated
  with check (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]));

-- UPDATE: solo administrador
create policy plantillas_compositor_update_admin
  on public.plantillas_compositor for update
  to authenticated
  using (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]));

-- DELETE: solo administrador
create policy plantillas_compositor_delete_admin
  on public.plantillas_compositor for delete
  to authenticated
  using (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]));

-- ── Trigger updated_at ────────────────────────────────────────────────
create trigger set_updated_at
  before update on public.plantillas_compositor
  for each row execute function public.set_updated_at();

-- ── fn_toggle_compositor_correo — activar/desactivar la feature ───────
-- SECURITY DEFINER: audit_log no tiene INSERT para authenticated.
create or replace function public.fn_toggle_compositor_correo(
  p_tenant_id uuid,
  p_activo boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED: se requiere sesión para cambiar esta configuración';
  end if;

  if not public.has_role(p_tenant_id, array['administrador']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol administrador en esta copropiedad';
  end if;

  update public.tenants
     set compositor_correo_activo = p_activo
   where id = p_tenant_id;

  insert into public.audit_log (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant_id,
    (select auth.uid()),
    'compositor_correo.toggle',
    'tenant',
    p_tenant_id,
    jsonb_build_object('activo', p_activo)
  );
end;
$$;

revoke execute on function public.fn_toggle_compositor_correo(uuid, boolean) from public, anon;
grant execute on function public.fn_toggle_compositor_correo(uuid, boolean) to authenticated;
