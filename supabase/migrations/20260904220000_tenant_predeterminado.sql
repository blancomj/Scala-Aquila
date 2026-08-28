-- ─────────────────────────────────────────────────────────────────────
--  Copropiedad predeterminada — distinta de profiles.active_tenant_id.
--
--  active_tenant_id es "en qué copropiedad estoy trabajando ahora" (cambia
--  con switch_tenant, persiste entre sesiones porque vive en la fila, no en
--  una cookie). tenant_predeterminado_id es una preferencia explícita del
--  usuario: "con cuál copropiedad quiero que se me pregunte empezar" —
--  ambas pueden diferir (hoy trabajo en B, pero mi default para la próxima
--  vez sigue siendo A).
--
--  Reutiliza el guard existente (guard_active_tenant, 20260813190400) en
--  vez de crear uno paralelo: mismo criterio de validación (debe ser una
--  membresía activa del propio usuario), misma función, ahora cubre las
--  dos columnas. El trigger ya existente (`before update on profiles`)
--  recoge el cambio de cuerpo sin necesidad de recrearlo.
-- ─────────────────────────────────────────────────────────────────────

alter table public.profiles
  add column tenant_predeterminado_id uuid references public.tenants (id) on delete set null;

comment on column public.profiles.tenant_predeterminado_id is
  'Copropiedad que el usuario eligió como predeterminada para el selector de inicio de sesión '
  '(distinta de active_tenant_id, que es la copropiedad de la sesión actual). NULL = sin '
  'preferencia explícita todavía; el selector cae a active_tenant_id como respaldo. Solo puede '
  'apuntar a un tenant con membresía activa (guard_active_tenant, extendido aquí).';

create or replace function public.guard_active_tenant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.active_tenant_id is not null
     and new.active_tenant_id is distinct from old.active_tenant_id then
    if not exists (
      select 1 from public.memberships m
      where m.user_id = new.id
        and m.tenant_id = new.active_tenant_id
        and m.status = 'active'
    ) then
      raise exception 'NO_MEMBERSHIP: sin membresía activa en la copropiedad %',
        new.active_tenant_id;
    end if;
  end if;

  if new.tenant_predeterminado_id is not null
     and new.tenant_predeterminado_id is distinct from old.tenant_predeterminado_id then
    if not exists (
      select 1 from public.memberships m
      where m.user_id = new.id
        and m.tenant_id = new.tenant_predeterminado_id
        and m.status = 'active'
    ) then
      raise exception 'NO_MEMBERSHIP: sin membresía activa en la copropiedad %',
        new.tenant_predeterminado_id;
    end if;
  end if;

  return new;
end;
$$;

-- ── set_tenant_predeterminado: mismo patrón exacto que switch_tenant
--    (20260814120000) — SECURITY INVOKER, profiles_update_propio (RLS) +
--    guard_active_tenant (extendido arriba) ya autorizan y validan esta
--    escritura, no hace falta escalar privilegios. ─────────────────────
create function public.set_tenant_predeterminado(p_tenant_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.profiles
  set tenant_predeterminado_id = p_tenant_id
  where id = (select auth.uid());
end;
$$;

revoke execute on function public.set_tenant_predeterminado(uuid) from public, anon;
grant execute on function public.set_tenant_predeterminado(uuid) to authenticated;

-- ── create_tenant: fusiona el cambio de esta tarea (llena
--    tenant_predeterminado_id SOLO si venía vacío — la primera copropiedad
--    de alguien es su default natural, pero crear una quinta copropiedad no
--    debe pisarle una preferencia ya elegida) sobre el cuerpo VIGENTE
--    (20260903120000_contable_cuentas_default_en_alta.sql: audit_log, rol
--    'administrador' y la siembra de presupuesto/plan contable/cuentas/
--    puentes/conceptos) — no sobre una versión anterior. ────────────────
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
  values ((select auth.uid()), v_tenant.id, 'administrador', 'active');

  -- PC-2b/PC-2c: siembra los árboles presupuestal y contable. Conceptos depende de
  -- presupuesto_cuenta (ADMINISTRACION se liga a cuotas_administracion por código), así que
  -- tiene que ir después de fn_instanciar_presupuesto_cuenta, en la misma transacción de alta.
  perform public.fn_instanciar_presupuesto_cuenta(v_tenant.id);
  perform public.fn_instanciar_plan_contable(v_tenant.id);
  -- PC-3c: y los dos puentes entre ambos árboles, sin los cuales toda la contabilidad
  -- proyectada de la copropiedad saldría sin cuenta.
  perform public.fn_instanciar_cuentas_default(v_tenant.id);
  perform public.fn_instanciar_puentes_presupuesto(v_tenant.id);
  perform public.fn_instanciar_conceptos(v_tenant.id);

  update public.profiles
  set active_tenant_id = v_tenant.id,
      tenant_predeterminado_id = coalesce(tenant_predeterminado_id, v_tenant.id)
  where id = (select auth.uid());

  return v_tenant;
exception
  when unique_violation then
    raise exception 'SLUG_TAKEN: ya existe una copropiedad con ese slug';
  when check_violation then
    raise exception 'SLUG_INVALID: el nombre o el slug no cumplen el formato requerido';
end;
$$;

-- ── accept_invitation: mismo criterio — llena el default solo si estaba
--    vacío (primera copropiedad a la que alguien es invitado). Cuerpo base
--    sin cambios desde 20260814140200_accept_invitation_no_lazy_expire.sql
--    (verificado: es la versión vigente). ──────────────────────────────
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
  set active_tenant_id = v_invitation.tenant_id,
      tenant_predeterminado_id = coalesce(tenant_predeterminado_id, v_invitation.tenant_id)
  where id = (select auth.uid());

  return query select v_invitation.tenant_id, v_invitation.role;
end;
$$;

revoke execute on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;
