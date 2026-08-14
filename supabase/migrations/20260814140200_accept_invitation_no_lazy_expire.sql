-- ═══════════════════════════════════════════════════════════════════════
--  Fix: accept_invitation() — el UPDATE a status='expired' se revertía
--
--  Intentaba "marcar perezosamente" la invitación como expirada (UPDATE)
--  y luego RAISE EXCEPTION en la misma invocación de función — pero un
--  RAISE EXCEPTION no capturado revierte TODO lo que hizo esa invocación,
--  incluido el UPDATE que la precede (todo-o-nada, sin sub-transacciones
--  autónomas en PL/pgSQL). El UPDATE nunca sobrevivía.
--
--  Encontrado por tests/invitations/invitations.test.ts (el test
--  INV_EXPIRED esperaba status='expired' tras el intento y seguía viendo
--  'pending'). Corregido: se quita el intento de UPDATE — el chequeo
--  `expires_at < now()` ya es suficiente y estable para rechazar
--  invitaciones vencidas sin necesidad de mutar `status`.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.accept_invitation(p_token_hash text)
returns table (out_tenant_id uuid, out_role public.tenant_role_t)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.invitations;
  v_email extensions.citext;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED: se requiere sesión para aceptar una invitación';
  end if;

  select * into v_invitation
  from public.invitations
  where token_hash = p_token_hash
  for update;

  if not found then
    raise exception 'INV_NOT_FOUND: invitación no encontrada';
  end if;

  if v_invitation.status = 'accepted' then
    raise exception 'INV_USED: la invitación ya fue utilizada';
  end if;

  if v_invitation.status = 'revoked' then
    raise exception 'INV_NOT_FOUND: invitación no encontrada';
  end if;

  if v_invitation.status = 'expired' or v_invitation.expires_at < now() then
    raise exception 'INV_EXPIRED: la invitación expiró';
  end if;

  select email into v_email from public.profiles where id = (select auth.uid());
  if v_email is distinct from v_invitation.email then
    raise exception 'INV_EMAIL_MISMATCH: el correo de la sesión no coincide con el invitado';
  end if;

  update public.invitations
  set status = 'accepted', accepted_at = now(), accepted_by = (select auth.uid())
  where id = v_invitation.id;

  insert into public.memberships (user_id, tenant_id, role, status, invited_by)
  values ((select auth.uid()), v_invitation.tenant_id, v_invitation.role, 'active', v_invitation.invited_by)
  on conflict (user_id, tenant_id)
  do update set role = excluded.role, status = 'active', invited_by = excluded.invited_by;

  update public.profiles
  set active_tenant_id = v_invitation.tenant_id
  where id = (select auth.uid());

  return query select v_invitation.tenant_id, v_invitation.role;
end;
$$;

revoke execute on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;
