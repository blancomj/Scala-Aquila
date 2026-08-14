-- ═══════════════════════════════════════════════════════════════════════
--  E1 · Políticas RLS
--  Propietario: PROMPT_MAESTRO_FASE1.md §6.2
--
--  Deny-by-default: solo se concede lo que aparece aquí.
--  El rol de plataforma NO aparece en ninguna política de datos de tenant
--  (SEC-10): su único acceso es la vista de metadatos.
-- ═══════════════════════════════════════════════════════════════════════

-- ── profiles ───────────────────────────────────────────────────────────
-- SELECT: el propio, o el de alguien de la misma copropiedad.
create policy profiles_select
  on public.profiles for select
  to authenticated
  using (
    id = (select auth.uid())
    or public.shares_tenant_with(id)
  );

-- UPDATE: solo el propio. Las columnas privilegiadas las bloquea
-- guard_privileged_columns (SEC-06); WITH CHECK por sí solo no basta.
create policy profiles_update_propio
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Sin INSERT (solo el trigger on_auth_user_created) ni DELETE.

-- ── tenants ────────────────────────────────────────────────────────────
create policy tenants_select_miembro
  on public.tenants for select
  to authenticated
  using (public.is_member(id));

create policy tenants_update_agent
  on public.tenants for update
  to authenticated
  using (public.has_role(id, array['agent']::public.tenant_role_t[]))
  with check (public.has_role(id, array['agent']::public.tenant_role_t[]));

-- Sin INSERT (solo Edge Function create-tenant, AD-05) ni DELETE.

-- ── memberships ────────────────────────────────────────────────────────
create policy memberships_select_miembro
  on public.memberships for select
  to authenticated
  using (public.is_member(tenant_id));

create policy memberships_update_agent
  on public.memberships for update
  to authenticated
  using (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

-- Sin INSERT (solo Edge Functions) ni DELETE (soft-delete vía status).

-- ── invitations ────────────────────────────────────────────────────────
create policy invitations_select_agent
  on public.invitations for select
  to authenticated
  using (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

-- Sin INSERT / UPDATE / DELETE: todo pasa por Edge Functions (AD-05).

-- ── audit_log ──────────────────────────────────────────────────────────
create policy audit_log_select_agent_auditor
  on public.audit_log for select
  to authenticated
  using (
    tenant_id is not null
    and public.has_role(tenant_id, array['agent', 'auditor']::public.tenant_role_t[])
  );

-- Sin INSERT (trigger/Edge Function), sin UPDATE, sin DELETE (SEC-14).
