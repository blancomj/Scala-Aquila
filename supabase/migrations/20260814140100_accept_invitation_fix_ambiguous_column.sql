-- ═══════════════════════════════════════════════════════════════════════
--  Fix: accept_invitation() — "column reference tenant_id is ambiguous"
--
--  RETURNS TABLE (tenant_id uuid, role tenant_role_t) declara `tenant_id` y
--  `role` como variables de salida en el scope de la función — chocan con
--  las columnas reales `memberships.tenant_id`/`.role` que se usan dentro
--  del cuerpo (el INSERT ... ON CONFLICT (user_id, tenant_id) y la lista de
--  columnas del INSERT). Postgres no puede decidir si "tenant_id" ahí se
--  refiere a la variable de salida o a la columna → 42702.
--
--  Encontrado por tests/invitations/invitations.test.ts (flujo feliz e
--  INV_USED fallaban). Corregido renombrando las variables de salida a
--  algo que no colisiona con ninguna columna real.
-- ═══════════════════════════════════════════════════════════════════════

-- CREATE OR REPLACE no puede cambiar el tipo de fila (los nombres de las
-- columnas de OUT) de una función existente — hay que soltarla primero.
drop function public.accept_invitation(text);

create function public.accept_invitation(p_token_hash text)
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
    if v_invitation.status <> 'expired' then
      update public.invitations set status = 'expired' where id = v_invitation.id;
    end if;
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
