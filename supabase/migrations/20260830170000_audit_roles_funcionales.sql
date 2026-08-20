-- ═══════════════════════════════════════════════════════════════════════
--  Auditoría de asignación/revocación de roles funcionales — cabo suelto
--  detectado durante la verificación visual (2026-08-20): a diferencia de
--  membership.role_changed (audit_membership_change, 20260813190400), no
--  quedaba rastro de quién le dio o le quitó un rol funcional a quién.
--
--  Mismo patrón que audit_membership_change: trigger AFTER en la tabla,
--  no en el store — así queda registrado sin importar por qué camino
--  llegue el cambio (drawer de hoy, o lo que se construya después).
--  membership_roles_funcionales no tiene UPDATE (solo insert/delete), así
--  que el trigger solo cubre esos dos eventos.
-- ═══════════════════════════════════════════════════════════════════════

create function public.audit_membership_rol_funcional_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membership_id uuid := coalesce(new.membership_id, old.membership_id);
  v_rol_funcional_id bigint := coalesce(new.rol_funcional_id, old.rol_funcional_id);
  v_tenant_id uuid;
  v_user_id uuid;
  v_codigo text;
begin
  select m.tenant_id, m.user_id into v_tenant_id, v_user_id
  from public.memberships m
  where m.id = v_membership_id;

  select lt.codigo into v_codigo
  from public.lista_tipos lt
  where lt.id = v_rol_funcional_id;

  insert into public.audit_log (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    (select auth.uid()),
    case tg_op when 'INSERT' then 'membership_rol_funcional.asignado' else 'membership_rol_funcional.revocado' end,
    'membership',
    v_membership_id,
    jsonb_build_object('user_id', v_user_id, 'rol_funcional_codigo', v_codigo)
  );

  return coalesce(new, old);
end;
$$;

create trigger audit_membership_rol_funcional_change
  after insert or delete on public.membership_roles_funcionales
  for each row execute function public.audit_membership_rol_funcional_change();
