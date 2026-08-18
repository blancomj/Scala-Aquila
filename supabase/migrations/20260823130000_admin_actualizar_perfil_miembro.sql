-- ═══════════════════════════════════════════════════════════════════════
--  E6 · Edición de miembro (nombre/teléfono/estado) por el agent del
--  tenant, y reenvío de invitación pendiente.
--
--  admin_actualizar_perfil_miembro: guard_privileged_columns (SEC-06,
--  20260813190400_triggers.sql) bloquea cualquier UPDATE de profiles.status
--  salvo que auth.uid() sea null (service_role) — eso vale incluso dentro
--  de una función SECURITY DEFINER invocada con el JWT del usuario, porque
--  auth.uid() lee un GUC de sesión, no el modo definer/invoker. Por eso
--  esta función NO puede volver a validar el rol del actor por sí misma
--  (auth.uid() ya es null acá) — la autorización (has_role) la hace la
--  Edge Function ANTES de llamar, con el cliente del usuario, y solo
--  entonces invoca esto con el cliente service_role. Por eso mismo debe
--  quedar inalcanzable para cualquier rol que no sea service_role — mismo
--  criterio que purge_audit_log_antiguo (20260814190000_purga_audit_log.sql).
-- ═══════════════════════════════════════════════════════════════════════

create function public.admin_actualizar_perfil_miembro(
  p_membership_id uuid,
  p_actor_id uuid,
  p_full_name text,
  p_phone text,
  p_status public.user_status_t
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membership public.memberships;
  v_profile    public.profiles;
begin
  select * into v_membership from public.memberships where id = p_membership_id;
  if not found then
    raise exception 'MEMBERSHIP_NOT_FOUND: membresía no encontrada';
  end if;

  if v_membership.user_id = p_actor_id then
    raise exception 'SELF_MODIFY: no podés editar tu propio estado desde acá';
  end if;

  update public.profiles
    set full_name = p_full_name, phone = p_phone, status = p_status, updated_at = now()
    where id = v_membership.user_id
    returning * into v_profile;

  insert into public.audit_log (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    v_membership.tenant_id, p_actor_id, 'member.profile_updated', 'profile', v_profile.id,
    jsonb_build_object('membership_id', p_membership_id, 'status', p_status)
  );

  return v_profile;
end;
$$;

revoke execute on function public.admin_actualizar_perfil_miembro(uuid, uuid, text, text, public.user_status_t)
  from public, anon, authenticated;

comment on function public.admin_actualizar_perfil_miembro(uuid, uuid, text, text, public.user_status_t) is
  'Solo invocable con service_role (ver revoke execute arriba) — la Edge Function '
  'update-member-profile valida has_role del actor ANTES de llamar, con el cliente '
  'del usuario, porque esta función corre con auth.uid() = null.';

-- ── Reenviar invitación pendiente: reutiliza la misma fila (mismo email/rol/
-- tenant), regenera token_hash + expires_at. No toca profiles, así que sí
-- puede validar el rol del actor con has_role() normalmente. ──────────────
create function public.resend_invitation(
  p_invitation_id uuid,
  p_token_hash text,
  p_expires_at timestamptz
)
returns public.invitations
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

  update public.invitations
    set token_hash = p_token_hash, expires_at = p_expires_at, updated_at = now()
    where id = p_invitation_id
    returning * into v_invitation;

  return v_invitation;
end;
$$;

revoke execute on function public.resend_invitation(uuid, text, timestamptz) from public, anon;
grant execute on function public.resend_invitation(uuid, text, timestamptz) to authenticated;
