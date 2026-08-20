-- ═══════════════════════════════════════════════════════════════════════
--  Consolidación del modelo de roles del sistema (decisión del usuario,
--  2026-08-19) — resuelve la ambigüedad detectada entre `agent` y
--  `administrador` en tenant_role_t.
--
--  Origen del problema: tenant_role_t nació como ('agent', 'auditor') con
--  el comentario "agent = administrador (rol máximo del tenant)"
--  (20260813190000). GAP-CAR-009 agregó después un valor 'administrador'
--  real, como superconjunto de 'agent' — dejando dos nombres para "el rol
--  fuerte": el original 'agent' (que su propio comentario llamaba
--  "administrador") y el nuevo 'administrador' (que en la práctica es
--  ahora el más fuerte de los dos). Confuso y con un bug real ya detectado
--  (email_invitation.ts etiquetaba a un 'agent' como "administrador" en el
--  correo de invitación).
--
--  Modelo final, sin ambigüedad:
--   - admin de plataforma → profiles.is_platform_admin (AD-09, sin cambios,
--     eje completamente aparte de tenant_role_t).
--   - Administrador → tenant_role_t más fuerte. Quien crea el tenant queda
--     con este rol automáticamente (antes quedaba con 'agent').
--   - Auxiliar → reemplaza a 'agent'. Nivel operativo por debajo de
--     Administrador: opera el tenant (captura/factura/cobra) pero no
--     administra. Sigue satisfaciendo cualquier chequeo has_role() que
--     antes pedía 'agent' — el rename preserva la semántica, solo corrige
--     el nombre.
--   - Auditor → sin cambios, solo lectura.
--
--  ALTER TYPE ... RENAME VALUE (a diferencia de ADD VALUE) sí puede usarse
--  en la misma transacción en la que se usa el valor renombrado — por eso
--  has_role()/guard_last_agent()/create_tenant() se redefinen en este mismo
--  archivo sin necesitar una segunda migración.
--
--  No se reescriben las 34 migraciones existentes que usan 'agent' en RLS
--  policies (historial inmutable) — Postgres actualiza automáticamente
--  cualquier política/función ya creada para que reconozca el valor
--  renombrado, sin necesidad de tocarlas.
-- ═══════════════════════════════════════════════════════════════════════

alter type public.tenant_role_t rename value 'agent' to 'auxiliar';

comment on type public.tenant_role_t is
  'Roles dentro de una copropiedad. administrador = rol máximo del tenant (quien lo crea lo recibe '
  'automáticamente; también gana los chequeos exclusivos de aprobación de cartera/jurídico, GAP-CAR-009). '
  'auxiliar = opera el tenant (captura, factura, cobra) pero no administra — nivel por debajo de '
  'administrador. auditor = solo lectura, incluida auditoría. El admin de plataforma vive aparte, en '
  'profiles.is_platform_admin (AD-09).';

-- ── has_role(): mismo criterio de superconjunto (administrador ⊇ auxiliar),
--    solo con el nombre correcto. ──────────────────────────────────────
create or replace function public.has_role(p_tenant uuid, p_roles public.tenant_role_t[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.user_id = (select auth.uid())
      and m.tenant_id = p_tenant
      and m.status = 'active'
      and (
        m.role = any(p_roles)
        or (m.role = 'administrador' and 'auxiliar' = any(p_roles))
      )
  )
$$;

-- ── guard_last_agent() (SEC-07): mismo criterio, nombre de función y
--    código de error sin cambiar (identificadores internos, no texto de
--    usuario) — solo el literal de rol y el mensaje. ────────────────────
create or replace function public.guard_last_agent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role in ('auxiliar', 'administrador') and old.status = 'active'
     and (new.role is distinct from old.role or new.status is distinct from old.status)
  then
    if not exists (
      select 1 from public.memberships m
      where m.tenant_id = old.tenant_id
        and m.role in ('auxiliar', 'administrador')
        and m.status = 'active'
        and m.id <> old.id
    ) then
      raise exception 'LAST_AGENT: no se puede revocar ni degradar el último auxiliar o administrador activo (SEC-07)';
    end if;
  end if;
  return new;
end;
$$;

-- ── create_tenant(): quien crea el tenant recibe 'administrador', no
--    'auxiliar' — antes de esta decisión, el creador quedaba con el rol
--    operativo, sin las aprobaciones exclusivas de cartera/jurídico sobre
--    su propio tenant. ─────────────────────────────────────────────────
create or replace function public.create_tenant(p_name text, p_slug text)
returns public.tenants
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant public.tenants;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED: se requiere sesión para crear una copropiedad';
  end if;

  insert into public.tenants (name, slug, created_by)
  values (btrim(p_name), lower(btrim(p_slug)), (select auth.uid()))
  returning * into v_tenant;

  insert into public.audit_log (tenant_id, actor_id, action, entity_type, entity_id)
  values (v_tenant.id, (select auth.uid()), 'tenant.created', 'tenant', v_tenant.id);

  insert into public.memberships (user_id, tenant_id, role, status)
  values ((select auth.uid()), v_tenant.id, 'administrador', 'active');

  update public.profiles
  set active_tenant_id = v_tenant.id
  where id = (select auth.uid());

  return v_tenant;
exception
  when unique_violation then
    raise exception 'SLUG_TAKEN: ya existe una copropiedad con ese slug';
  when check_violation then
    raise exception 'SLUG_INVALID: el nombre o el slug no cumplen el formato requerido';
end;
$$;
