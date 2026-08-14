-- ═══════════════════════════════════════════════════════════════════════
--  E1 · Funciones helper de autorización
--  Propietario: PROMPT_MAESTRO_FASE1.md §6.1
--
--  AD-03 — las tres cláusulas son OBLIGATORIAS:
--    SECURITY DEFINER  rompe la recursión: una política sobre memberships
--                      que consulta memberships provoca 42P17.
--    STABLE            sin ella la función se re-evalúa por fila.
--    SET search_path   sin ella, SECURITY DEFINER es vector de escalada.
--
--  Nota: Fase I §6.1 especifica `search_path = public`. Se usa `= ''` con
--  nombres totalmente cualificados, que satisface SEC-08 de forma más
--  estricta: ni siquiera `public` puede ser secuestrado.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Copropiedad activa del usuario autenticado ─────────────────────────
create function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.active_tenant_id
  from public.profiles p
  where p.id = (select auth.uid())
$$;

-- ── ¿Pertenece a esta copropiedad, con membresía activa? ───────────────
create function public.is_member(p_tenant uuid)
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
  )
$$;

-- ── ¿Tiene alguno de estos roles de tenant? ────────────────────────────
create function public.has_role(p_tenant uuid, p_roles public.tenant_role_t[])
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
      and m.role = any(p_roles)
  )
$$;

-- ── ¿Comparte alguna copropiedad con este usuario? ────────────────────
-- Necesaria para la política de profiles: sin SECURITY DEFINER habría que
-- consultar memberships desde una política, lo que anida evaluaciones RLS.
create function public.shares_tenant_with(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m_yo
    join public.memberships m_otro on m_otro.tenant_id = m_yo.tenant_id
    where m_yo.user_id = (select auth.uid())
      and m_yo.status = 'active'
      and m_otro.user_id = p_user
      and m_otro.status = 'active'
  )
$$;

-- ── Rol de plataforma (AD-09) — plano de autorización separado ─────────
create function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.is_platform_admin from public.profiles p where p.id = (select auth.uid())),
    false
  )
$$;

-- El rol anónimo no necesita ejecutar estos helpers.
revoke execute on function public.current_tenant_id()      from public, anon;
revoke execute on function public.is_member(uuid)          from public, anon;
revoke execute on function public.has_role(uuid, public.tenant_role_t[]) from public, anon;
revoke execute on function public.is_platform_admin()      from public, anon;
revoke execute on function public.shares_tenant_with(uuid) from public, anon;

grant execute on function public.current_tenant_id()       to authenticated;
grant execute on function public.is_member(uuid)           to authenticated;
grant execute on function public.has_role(uuid, public.tenant_role_t[]) to authenticated;
grant execute on function public.is_platform_admin()       to authenticated;
grant execute on function public.shares_tenant_with(uuid)  to authenticated;
