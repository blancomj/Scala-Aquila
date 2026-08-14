-- ═══════════════════════════════════════════════════════════════════════
--  E6 · guard_self_modify — nadie modifica su propia membership
--  Propietario: PROMPT_MAESTRO_FASE1.md §8 (contrato update-membership,
--  error SELF_MODIFY), §7.3 "nadie puede modificar su propia membresía".
--
--  update-membership NO es una Edge Function (a diferencia de create-tenant/
--  invitaciones): memberships_update_agent (RLS) ya permite UPDATE directo
--  al agent, y guard_last_agent ya protege al último agent activo. Faltaba
--  este guard — sin él, un agent podría degradarse o revocarse a sí mismo
--  (posible incluso siendo el único agent, si guard_last_agent no lo
--  bloqueara primero; pero un segundo agent sí podría auto-revocarse sin
--  este trigger, dejando el sistema sin nadie que lo cambie de vuelta más
--  que otro agent).
-- ═══════════════════════════════════════════════════════════════════════

create function public.guard_self_modify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if old.user_id = (select auth.uid())
     and (new.role is distinct from old.role or new.status is distinct from old.status)
  then
    raise exception 'SELF_MODIFY: no puedes modificar tu propia membresía';
  end if;

  return new;
end;
$$;

create trigger guard_self_modify
  before update on public.memberships
  for each row execute function public.guard_self_modify();
