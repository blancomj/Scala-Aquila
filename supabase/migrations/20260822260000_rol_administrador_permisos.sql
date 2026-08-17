-- ═══════════════════════════════════════════════════════════════════════
--  GAP-CAR-009 (2/2) — administrador hereda los permisos de agent
--  Propietario: Docs/Motor de gestion de cartera/CAR_00_Guia_Oficial.md §21/§24
--
--  No se reescriben las 88 policies existentes de has_role(tenant_id,
--  array['agent'...]) repartidas en 15 migraciones — todas pasan por esta
--  única función, así que basta con ampliar su semántica aquí:
--  administrador satisface cualquier chequeo que ya satisfacía agent
--  (administrador ⊇ agent), y además puede satisfacer chequeos que pidan
--  'administrador' explícitamente (los futuros de aprobación en F4, que
--  NO deben ser satisfechos por un simple agent).
--
--  guard_last_agent() (SEC-07, 20260813190400_triggers.sql) comparaba
--  role = 'agent' directo, sin pasar por has_role() — si no se amplía
--  también, una copropiedad podría quedar con un administrador y cero
--  agents, y ese administrador quedaría desprotegido (el guard no lo ve).
--  Se amplía a "agent o administrador" para que la copropiedad conserve
--  siempre ≥1 persona activa que pueda actuar.
-- ═══════════════════════════════════════════════════════════════════════

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
        or (m.role = 'administrador' and 'agent' = any(p_roles))
      )
  )
$$;

create or replace function public.guard_last_agent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role in ('agent', 'administrador') and old.status = 'active'
     and (new.role is distinct from old.role or new.status is distinct from old.status)
  then
    if not exists (
      select 1 from public.memberships m
      where m.tenant_id = old.tenant_id
        and m.role in ('agent', 'administrador')
        and m.status = 'active'
        and m.id <> old.id
    ) then
      raise exception 'LAST_AGENT: no se puede revocar ni degradar el último agent o administrador activo (SEC-07)';
    end if;
  end if;
  return new;
end;
$$;
