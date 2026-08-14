-- ═══════════════════════════════════════════════════════════════════════
--  E3 · Tenancy — RPC de creación y cambio de copropiedad activa
--  Propietario: PROMPT_MAESTRO_FASE1.md §6.5, §9.3, §9.4
--
--  D-18: create_tenant() es una función SECURITY DEFINER, no la Edge
--  Function que especifica AD-05. apps/web no tiene aún infraestructura de
--  Edge Functions (D-08: sin stack local, sin CLI vinculado con token). La
--  función no usa service_role ni cruza el límite de un tenant existente
--  (el usuario todavía no pertenece a ninguno); la atomicidad tenant +
--  membership + active_tenant_id se logra igual dentro de una única
--  transacción de función. Revisar cuando E5 (invitaciones) sí requiera
--  Edge Functions de verdad por el envío de email (Brevo, AD-07).
-- ═══════════════════════════════════════════════════════════════════════

-- ── create_tenant: tenant + membership(agent) + active_tenant_id ───────
create function public.create_tenant(p_name text, p_slug text)
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

  insert into public.memberships (user_id, tenant_id, role, status)
  values ((select auth.uid()), v_tenant.id, 'agent', 'active');

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

revoke execute on function public.create_tenant(text, text) from public, anon;
grant execute on function public.create_tenant(text, text) to authenticated;

-- ── switch_tenant: cambia profiles.active_tenant_id ─────────────────────
-- SECURITY INVOKER (default): profiles_update_propio (id = auth.uid()) ya
-- autoriza esta escritura vía RLS y guard_active_tenant ya valida la
-- membresía activa — no hace falta escalar privilegios para esto.
create function public.switch_tenant(p_tenant_id uuid)
returns void
language sql
set search_path = ''
as $$
  update public.profiles
  set active_tenant_id = p_tenant_id
  where id = (select auth.uid())
$$;

revoke execute on function public.switch_tenant(uuid) from public, anon;
grant execute on function public.switch_tenant(uuid) to authenticated;
