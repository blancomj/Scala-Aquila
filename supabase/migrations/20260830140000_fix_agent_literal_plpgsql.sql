-- ═══════════════════════════════════════════════════════════════════════
--  Corrección urgente — 20260830100000 asumió que ALTER TYPE ... RENAME
--  VALUE actualizaba automáticamente CUALQUIER objeto existente. Eso es
--  cierto para políticas RLS y funciones `language sql` (su expresión
--  queda parseada/resuelta por OID al crearse, pg_get_expr() la imprime
--  con la etiqueta vigente). NO es cierto para funciones `language
--  plpgsql`: su cuerpo se guarda como texto y el cast 'agent'::tenant_role_t
--  se resuelve en cada ejecución — al no existir ya la etiqueta 'agent',
--  revienta en runtime con "invalid input value for enum
--  public.tenant_role_t: agent". Detectado por un test real
--  (cartera-recalcular.test.ts) que dejó de pasar tras 20260830100000, no
--  por revisión de código — verificado el resto del catálogo con
--  pg_proc.prosrc ilike '%''agent''%' en dev, esta es la lista completa.
--
--  guard_accion_cobranza_transicion apareció en esa búsqueda pero solo
--  tiene la palabra en un comentario ("no basta 'agent'") — no tiene cast
--  roto, no se toca.
--
--  create or replace function, cuerpo idéntico al ya desplegado salvo
--  'agent'→'auxiliar' (cast y mensajes de error) — ningún otro cambio de
--  comportamiento.
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
begin
  if not public.has_role(p_tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol auxiliar en la copropiedad';
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

create or replace function public.resend_invitation(
  p_invitation_id uuid, p_token_hash text, p_expires_at timestamp with time zone
)
returns invitations
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_invitation public.invitations;
begin
  select * into v_invitation from public.invitations where id = p_invitation_id;
  if not found then
    raise exception 'INV_NOT_FOUND: invitación no encontrada';
  end if;

  if not public.has_role(v_invitation.tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol auxiliar en la copropiedad';
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
$function$;

create or replace function public.revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_invitation public.invitations;
begin
  select * into v_invitation from public.invitations where id = p_invitation_id;

  if not found then
    raise exception 'INV_NOT_FOUND: invitación no encontrada';
  end if;

  if not public.has_role(v_invitation.tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol auxiliar en la copropiedad';
  end if;

  if v_invitation.status <> 'pending' then
    raise exception 'INV_NOT_PENDING: la invitación no está pendiente';
  end if;

  update public.invitations set status = 'revoked' where id = p_invitation_id;
end;
$function$;

create or replace function public.fn_guardar_plantilla_sms(
  p_tenant_id uuid, p_event_type text, p_cuerpo text
)
returns plantillas_sms
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_cuerpo_anterior text;
  v_row public.plantillas_sms;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED: se requiere sesión para guardar una plantilla SMS';
  end if;

  if not public.has_role(p_tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol auxiliar en esta copropiedad';
  end if;

  if char_length(p_cuerpo) > 480 then
    raise exception 'SMS_BODY_TOO_LONG: el texto excede el máximo de 480 caracteres';
  end if;

  select cuerpo into v_cuerpo_anterior
  from public.plantillas_sms
  where tenant_id = p_tenant_id and event_type = p_event_type;

  insert into public.plantillas_sms (tenant_id, event_type, cuerpo, updated_by)
  values (p_tenant_id, p_event_type, p_cuerpo, (select auth.uid()))
  on conflict (tenant_id, event_type) do update
    set cuerpo = excluded.cuerpo,
        updated_by = excluded.updated_by
  returning * into v_row;

  insert into public.audit_log (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant_id,
    (select auth.uid()),
    'plantilla_sms.guardada',
    'plantilla_sms',
    v_row.id,
    jsonb_build_object(
      'event_type', p_event_type,
      'cuerpo_anterior', v_cuerpo_anterior,
      'cuerpo_nuevo', p_cuerpo
    )
  );

  return v_row;
end;
$function$;

create or replace function public.fn_toggle_plantilla_sms(
  p_tenant_id uuid, p_event_type text, p_activo boolean
)
returns plantillas_sms
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_row public.plantillas_sms;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED: se requiere sesión para cambiar el interruptor de una plantilla SMS';
  end if;

  if not public.has_role(p_tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol auxiliar en esta copropiedad';
  end if;

  update public.plantillas_sms
  set activo = p_activo
  where tenant_id = p_tenant_id and event_type = p_event_type
  returning * into v_row;

  if v_row.id is null then
    raise exception 'SMS_TEMPLATE_NOT_FOUND: no existe una plantilla guardada para este evento';
  end if;

  insert into public.audit_log (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant_id,
    (select auth.uid()),
    'plantilla_sms.interruptor_cambiado',
    'plantilla_sms',
    v_row.id,
    jsonb_build_object('event_type', p_event_type, 'activo', p_activo)
  );

  return v_row;
end;
$function$;

create or replace function public.fn_guardar_plantilla_email(
  p_tenant_id uuid, p_event_type text, p_subject text, p_html_content text
)
returns email_templates
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_subject_anterior text;
  v_row public.email_templates;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED: se requiere sesión para guardar una plantilla de correo';
  end if;

  if not public.has_role(p_tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol auxiliar en esta copropiedad';
  end if;

  if char_length(p_html_content) < 10 then
    raise exception 'EMAIL_BODY_TOO_SHORT: el contenido del correo es demasiado corto';
  end if;

  select subject into v_subject_anterior
  from public.email_templates
  where tenant_id = p_tenant_id and event_type = p_event_type;

  insert into public.email_templates (tenant_id, event_type, subject, html_content, is_synced, updated_by)
  values (p_tenant_id, p_event_type, p_subject, p_html_content, false, (select auth.uid()))
  on conflict (tenant_id, event_type) do update
    set subject = excluded.subject,
        html_content = excluded.html_content,
        is_synced = false,
        updated_by = excluded.updated_by
  returning * into v_row;

  insert into public.audit_log (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant_id,
    (select auth.uid()),
    'plantilla_email.guardada',
    'plantilla_email',
    v_row.id,
    jsonb_build_object(
      'event_type', p_event_type,
      'subject_anterior', v_subject_anterior,
      'subject_nuevo', p_subject
    )
  );

  return v_row;
end;
$function$;

create or replace function public.guard_cartera_etapa_transicion()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_congelada boolean;
begin
  if new.tenant_id is distinct from old.tenant_id or new.inmueble_id is distinct from old.inmueble_id then
    raise exception 'CARTERA_ETAPA_CONTEXTO_INMUTABLE: tenant_id/inmueble_id no se pueden '
      'modificar (fila %)', old.id;
  end if;

  if new.etapa = old.etapa and new.etapa_propuesta is not distinct from old.etapa_propuesta then
    new.etapa_anterior := old.etapa_anterior;
    new.propuesto_por := old.propuesto_por;
    new.propuesto_at := old.propuesto_at;
    new.aprobado_por := old.aprobado_por;
    new.aprobado_at := old.aprobado_at;
    return new;
  end if;

  select exists(
    select 1 from public.acuerdos_pago
    where inmueble_id = new.inmueble_id and estado = 'vigente'
  ) into v_congelada;
  if v_congelada then
    raise exception 'CARTERA_ETAPA_CONGELADA: hay un acuerdo de pago vigente para este inmueble '
      '(CAR §12.5) — ningún cambio de etapa es posible mientras esté vigente';
  end if;

  if new.etapa = old.etapa then
    new.etapa_anterior := old.etapa_anterior;
    new.aprobado_por := old.aprobado_por;
    new.aprobado_at := old.aprobado_at;

    if new.etapa_propuesta is not null then
      if not public.cartera_etapa_transicion_valida(old.etapa, new.etapa_propuesta) then
        raise exception 'CARTERA_ETAPA_TRANSICION_INVALIDA: % no puede pasar a % (CAR §11.3)',
          old.etapa, new.etapa_propuesta;
      end if;
      if not public.has_role(new.tenant_id, array['auxiliar']::public.tenant_role_t[]) then
        raise exception 'FORBIDDEN: se requiere rol auxiliar para proponer una transición de etapa';
      end if;
      new.propuesto_por := v_actor;
      new.propuesto_at := now();
    else
      -- se limpia la propuesta (retiro/rechazo) — no exige administrador, cualquier auxiliar puede retirarla.
      new.propuesto_por := null;
      new.propuesto_at := null;
      new.motivo_propuesta := null;
    end if;
    return new;
  end if;

  if not public.cartera_etapa_transicion_valida(old.etapa, new.etapa) then
    raise exception 'CARTERA_ETAPA_TRANSICION_INVALIDA: % no puede pasar a % (CAR §11.3)',
      old.etapa, new.etapa;
  end if;

  if public.cartera_etapa_requiere_aprobacion(old.etapa, new.etapa) then
    if old.etapa_propuesta is distinct from new.etapa then
      raise exception 'CARTERA_ETAPA_SIN_PROPUESTA: esta transición exige proponerla primero '
        '(etapa_propuesta) antes de confirmarla (REQ-CAR-011)';
    end if;
    if not public.has_role(new.tenant_id, array['administrador']::public.tenant_role_t[]) then
      raise exception 'CARTERA_ETAPA_REQUIERE_ADMINISTRADOR: confirmar % → % requiere rol '
        'administrador (CAR §11.3/REQ-CAR-011)', old.etapa, new.etapa;
    end if;
    if old.propuesto_por is not null and old.propuesto_por = v_actor then
      raise exception 'CARTERA_ETAPA_AUTOAPROBACION: no puedes confirmar una transición de etapa '
        'que tú mismo propusiste (CAR §11, mismo criterio que acciones_cobranza/acuerdos_pago)';
    end if;
    new.aprobado_por := v_actor;
    new.aprobado_at := now();
  else
    if not public.has_role(new.tenant_id, array['auxiliar']::public.tenant_role_t[]) then
      raise exception 'FORBIDDEN: se requiere rol auxiliar para confirmar una transición automática de etapa';
    end if;
    new.aprobado_por := null;
    new.aprobado_at := null;
  end if;

  new.etapa_anterior := old.etapa;
  new.etapa_propuesta := null;
  new.propuesto_por := null;
  new.propuesto_at := null;
  new.motivo_propuesta := null;

  return new;
end;
$function$;
