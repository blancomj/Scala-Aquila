-- 20260908140000_audit_platform_admin.sql
--
-- `guard_privileged_columns` (20260813190400) impide que un usuario
-- autenticado cambie `is_platform_admin` (SEC-06), pero su primera línea es
--
--     if (select auth.uid()) is null then return new; end if;
--
-- de modo que la protección no aplica cuando NO hay sesión. En la práctica:
-- conceder o revocar el privilegio de plataforma se hace con service role o
-- SQL directo, deliberadamente fuera del producto. Es la decisión correcta —
-- una pantalla para otorgarlo sería una superficie permanente de escalamiento
-- de privilegios a cambio de una operación que ocurre dos o tres veces en la
-- vida del sistema.
--
-- Lo que faltaba es el rastro: hasta ahora ese cambio no quedaba registrado
-- en ninguna parte. Este trigger lo audita, ocurra por donde ocurra.
--
-- `tenant_id` queda NULL a propósito: `is_platform_admin` no pertenece a
-- ninguna copropiedad (AD-09/SEC-10, es un plano de autorización aparte).
-- `actor_id` también puede quedar NULL, y esa ausencia ES la información:
-- significa que la concesión no la hizo nadie autenticado desde la
-- aplicación, sino alguien con acceso directo a la base.

create function public.audit_platform_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_platform_admin is distinct from old.is_platform_admin then
    insert into public.audit_log (tenant_id, actor_id, action, entity_type, entity_id, metadata)
    values (
      null,
      (select auth.uid()),
      case
        when new.is_platform_admin then 'platform_admin.concedido'
        else 'platform_admin.revocado'
      end,
      'profile',
      new.id,
      jsonb_build_object(
        'email', new.email,
        'anterior', old.is_platform_admin,
        'nuevo', new.is_platform_admin,
        'via_sesion_autenticada', (select auth.uid()) is not null
      )
    );
  end if;
  return new;
end;
$$;

comment on function public.audit_platform_admin() is
  'SEC-06: registra en audit_log toda concesión o revocación de is_platform_admin. '
  'El privilegio se otorga fuera del producto (service role o SQL, donde '
  'guard_privileged_columns no aplica porque auth.uid() es null), así que este '
  'trigger es el único registro de que ocurrió. actor_id null significa '
  'exactamente eso: no lo hizo nadie autenticado desde la aplicación.';

create trigger audit_platform_admin
  after update on public.profiles
  for each row execute function public.audit_platform_admin();
