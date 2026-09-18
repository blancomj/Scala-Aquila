-- ═══════════════════════════════════════════════════════════════════════
--  Hallazgo QA f1-01 (severidad alta, qa/resultados.jsonl) — invite_user()
--  solo exigía has_role(tenant, ['auxiliar']) para invitar, sin restringir
--  A QUÉ ROL se invita. has_role('auxiliar') también es satisfecho por un
--  administrador (20260822260000: administrador ⊇ auxiliar), así que la
--  intención siempre fue "cualquiera con capacidad de invitar", pero el
--  código nunca comparó el rol del invitado contra el del que invita — un
--  auxiliar podía invitar a alguien como administrador via RPC directa,
--  saltándose la restricción que la UI y la Edge Function solo aparentan
--  (ambas fijan las opciones a auxiliar|auditor sin distinguir quién
--  invita — ver apps/web/app/components/usuarios/MiembroDrawer.vue:28 y
--  supabase/functions/invite-user/index.ts:25).
--
--  Decisión del usuario (2026-09-16, qa/decisiones.md § f1-01): un usuario
--  solo puede invitar a un rol IGUAL O INFERIOR al propio. Jerarquía de
--  tenant_role_t (apps/web/app/types/permissions.ts:17-72, de menor a
--  mayor): auditor < auxiliar ≈ administrador (administrador ⊇ auxiliar en
--  permisos, más la capacidad extra de aprobar acciones de cobranza de alto
--  impacto). Con esa jerarquía: un auxiliar puede invitar auxiliar o
--  auditor, nunca administrador; un administrador puede invitar cualquiera
--  de los tres.
--
--  auditor nunca llega a este chequeo: has_role(tenant, ['auxiliar']) ya lo
--  rechaza más arriba (auditor no tiene 'users:invite' en la matriz de
--  permisos), así que el nivel de auditor solo importa como techo — nadie
--  puede invitar por encima de auditor si su propio rol es auditor, pero
--  ese caso ya está cubierto por el rechazo existente.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.invite_user(
  p_tenant_id uuid, p_email text, p_role tenant_role_t, p_token_hash text,
  p_expires_at timestamp with time zone
)
returns invitations
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_email extensions.citext := lower(btrim(p_email));
  v_invitation public.invitations;
  v_caller_role public.tenant_role_t;
  v_nivel_caller int;
  v_nivel_invitado int;
begin
  if not public.has_role(p_tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol auxiliar en la copropiedad';
  end if;

  select m.role into v_caller_role
  from public.memberships m
  where m.user_id = (select auth.uid())
    and m.tenant_id = p_tenant_id
    and m.status = 'active'
  order by case m.role
      when 'administrador' then 3
      when 'auxiliar' then 2
      when 'auditor' then 1
      else 0
    end desc
  limit 1;

  v_nivel_caller := case v_caller_role
      when 'administrador' then 3
      when 'auxiliar' then 2
      when 'auditor' then 1
      else 0
    end;
  v_nivel_invitado := case p_role
      when 'administrador' then 3
      when 'auxiliar' then 2
      when 'auditor' then 1
      else 0
    end;

  if v_nivel_invitado > v_nivel_caller then
    raise exception 'PRIVILEGE_ESCALATION: no se puede invitar a un rol superior al propio (% > %)',
      p_role, v_caller_role;
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
    raise exception 'INVITE_PENDING: ya existe una invitación pendiente para ese correo';
end;
$function$;
