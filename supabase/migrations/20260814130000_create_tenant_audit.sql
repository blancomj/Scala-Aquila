-- ═══════════════════════════════════════════════════════════════════════
--  E3 · create_tenant() registra 'tenant.created' en audit_log
--  Propietario: PROMPT_MAESTRO_FASE1.md §8, §10.4 (catálogo de acciones)
--
--  20260814120000_tenancy_rpc.sql ya cubre 'membership.created' vía el
--  trigger audit_membership_change (dispara en cualquier INSERT sobre
--  memberships, incluido el de esta función). Faltaba 'tenant.created':
--  no hay trigger sobre tenants, así que se audita explícitamente aquí,
--  dentro de la misma transacción atómica de la función.
-- ═══════════════════════════════════════════════════════════════════════

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
