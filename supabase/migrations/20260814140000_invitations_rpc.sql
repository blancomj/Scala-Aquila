-- ═══════════════════════════════════════════════════════════════════════
--  E5 · Invitaciones — RPC de invitar, aceptar y revocar
--  Propietario: PROMPT_MAESTRO_FASE1.md §8, §9.2
--
--  Mismo patrón que D-18/D-19 (create_tenant/switch_tenant): la parte
--  atómica de base de datos vive en RPC SECURITY DEFINER (las políticas de
--  `invitations` deniegan INSERT/UPDATE a todo rol — "solo Edge Function",
--  ver 20260813190300_rls_policies.sql), invocada por la Edge Function
--  correspondiente. El token en claro NUNCA llega aquí — la Edge Function
--  genera `token_hash` (sha256 hex) antes de llamar a esta RPC (AD-04).
-- ═══════════════════════════════════════════════════════════════════════

-- ── invite_user: valida, inserta invitación, audita ─────────────────────
create function public.invite_user(
  p_tenant_id uuid,
  p_email text,
  p_role public.tenant_role_t,
  p_token_hash text,
  p_expires_at timestamptz
)
returns public.invitations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email extensions.citext := lower(btrim(p_email));
  v_invitation public.invitations;
begin
  if not public.has_role(p_tenant_id, array['agent']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol agent en la copropiedad';
  end if;

  if exists (
    select 1
    from public.memberships m
    join public.profiles p on p.id = m.user_id
    where m.tenant_id = p_tenant_id
      and m.status = 'active'
      and p.email = v_email
  ) then
    raise exception 'ALREADY_MEMBER: ese correo ya pertenece a esta copropiedad';
  end if;

  if exists (
    select 1 from public.invitations i
    where i.tenant_id = p_tenant_id and i.email = v_email and i.status = 'pending'
  ) then
    raise exception 'INVITE_PENDING: ya existe una invitación pendiente para ese correo';
  end if;

  insert into public.invitations (tenant_id, email, role, token_hash, expires_at, invited_by)
  values (p_tenant_id, v_email, p_role, p_token_hash, p_expires_at, (select auth.uid()))
  returning * into v_invitation;

  insert into public.audit_log (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant_id,
    (select auth.uid()),
    'invitation.sent',
    'invitation',
    v_invitation.id,
    jsonb_build_object('email', v_invitation.email, 'role', v_invitation.role)
  );

  return v_invitation;
exception
  when unique_violation then
    -- Backstop de invitations_pendiente_unica si dos requests concurrentes
    -- pasan el check de arriba a la vez.
    raise exception 'INVITE_PENDING: ya existe una invitación pendiente para ese correo';
end;
$$;

revoke execute on function public.invite_user(uuid, text, public.tenant_role_t, text, timestamptz) from public, anon;
grant execute on function public.invite_user(uuid, text, public.tenant_role_t, text, timestamptz) to authenticated;

-- ── accept_invitation: transacción atómica (§8) ──────────────────────────
-- Marca la invitación aceptada + crea/reactiva la membership +
-- active_tenant_id + audita, todo en la misma transacción de función.
-- NO marca el email como verificado (AD-11) — eso requiere
-- auth.admin.updateUserById, que solo la Edge Function puede hacer con
-- supabaseAdmin (service_role); ver supabase/functions/accept-invitation.
create function public.accept_invitation(p_token_hash text)
returns table (tenant_id uuid, role public.tenant_role_t)
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

  -- ON CONFLICT: si ya era miembro (p. ej. una invitación vieja que
  -- reactiva), actualiza rol/estado en vez de fallar por
  -- memberships_user_tenant_unico — no hay código de error dedicado para
  -- este caso en el contrato (§8), así que se trata como "bienvenida de
  -- vuelta", no como un fallo.
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

-- ── revoke_invitation ────────────────────────────────────────────────────
create function public.revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.invitations;
begin
  select * into v_invitation from public.invitations where id = p_invitation_id;

  if not found then
    raise exception 'INV_NOT_FOUND: invitación no encontrada';
  end if;

  if not public.has_role(v_invitation.tenant_id, array['agent']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol agent en la copropiedad';
  end if;

  if v_invitation.status <> 'pending' then
    raise exception 'INV_NOT_PENDING: la invitación no está pendiente';
  end if;

  update public.invitations set status = 'revoked' where id = p_invitation_id;
end;
$$;

revoke execute on function public.revoke_invitation(uuid) from public, anon;
grant execute on function public.revoke_invitation(uuid) to authenticated;
