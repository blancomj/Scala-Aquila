-- ═══════════════════════════════════════════════════════════════════════
--  E1 · Triggers
--  Propietario: PROMPT_MAESTRO_FASE1.md §6.4
--
--  Todas las funciones son SECURITY DEFINER con search_path = '' (SEC-08):
--  necesitan escribir en tablas sin política de INSERT (profiles, audit_log)
--  y leer memberships al margen de RLS.
-- ═══════════════════════════════════════════════════════════════════════

-- ── updated_at automático ──────────────────────────────────────────────
create function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger set_updated_at before update on public.tenants
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.memberships
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.invitations
  for each row execute function public.set_updated_at();

-- ── on_auth_user_created: crea el profile y audita ─────────────────────
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
  );

  insert into public.audit_log (actor_id, action, entity_type, entity_id)
  values (new.id, 'auth.signup', 'profile', new.id);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── SEC-06: nadie modifica sus propias columnas privilegiadas ──────────
-- auth.uid() es NULL cuando la operación viene de service_role o de una
-- migración; ahí sí se permite (cambio fuera de banda).
create function public.guard_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if new.is_platform_admin is distinct from old.is_platform_admin then
    raise exception 'PRIVILEGE_ESCALATION: is_platform_admin no es auto-modificable (SEC-06)';
  end if;

  if new.status is distinct from old.status then
    raise exception 'PRIVILEGE_ESCALATION: profiles.status no es auto-modificable (SEC-06)';
  end if;

  if new.email is distinct from old.email then
    raise exception 'INVALID_UPDATE: el email es espejo de auth.users; cámbialo por Auth';
  end if;

  return new;
end;
$$;

create trigger guard_privileged_columns
  before update on public.profiles
  for each row execute function public.guard_privileged_columns();

-- ── active_tenant_id solo puede apuntar a una membresía activa ─────────
create function public.guard_active_tenant()
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
  return new;
end;
$$;

create trigger guard_active_tenant
  before update on public.profiles
  for each row execute function public.guard_active_tenant();

-- ── SEC-07: toda copropiedad conserva ≥1 agent activo ──────────────────
create function public.guard_last_agent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'agent' and old.status = 'active'
     and (new.role is distinct from old.role or new.status is distinct from old.status)
  then
    if not exists (
      select 1 from public.memberships m
      where m.tenant_id = old.tenant_id
        and m.role = 'agent'
        and m.status = 'active'
        and m.id <> old.id
    ) then
      raise exception 'LAST_AGENT: no se puede revocar ni degradar el último agent activo (SEC-07)';
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_last_agent
  before update on public.memberships
  for each row execute function public.guard_last_agent();

-- ── Auditoría de cambios de membresía ──────────────────────────────────
create function public.audit_membership_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := 'membership.created';
  elsif new.status = 'revoked' and old.status <> 'revoked' then
    v_action := 'membership.revoked';
  elsif new.role is distinct from old.role then
    v_action := 'membership.role_changed';
  else
    return new;
  end if;

  insert into public.audit_log (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    new.tenant_id,
    (select auth.uid()),
    v_action,
    'membership',
    new.id,
    jsonb_build_object(
      'user_id',  new.user_id,
      'rol_antes', case when tg_op = 'UPDATE' then old.role::text end,
      'rol_ahora', new.role::text
    )
  );

  return new;
end;
$$;

create trigger audit_membership_change
  after insert or update on public.memberships
  for each row execute function public.audit_membership_change();

-- ── SEC-14: audit_log es append-only para todo rol ─────────────────────
create function public.forbid_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'APPEND_ONLY: % no admite % (SEC-14)', tg_table_name, tg_op;
end;
$$;

create trigger audit_log_append_only
  before update or delete on public.audit_log
  for each row execute function public.forbid_mutation();
