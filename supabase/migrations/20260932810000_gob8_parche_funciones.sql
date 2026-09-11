-- ═══════════════════════════════════════════════════════════════════════
--  GOB-8 (parche) · recepción externa de solicitudes con triage — funciones
--  Ver GOB_08_PARCHE_RECEPCION_EXTERNA.md §3.3-3.5.
--
--  Las tres primeras son 100% SQL — check_rate_limit ya es una función
--  Postgres (no un módulo Deno como el HMAC de MANT-11), así que
--  fn_solicitud_recibir_externa puede llamarla directo. Cero Edge Function
--  nueva en este parche (Plan del corte, aprobado): el actor externo llama
--  a fn_solicitud_recibir_externa/fn_solicitud_estado_externo con su sesión
--  real de auth.users (AD-37) vía RPC directo, igual que cualquier usuario
--  autenticado — la mediación que pide el spec (§3.3, §3.5) es la propia
--  función SECURITY DEFINER, no necesariamente una Edge Function.
--
--  Hallazgo durante la implementación (no en el Plan): el spec no le pasa
--  p_origen_id/p_prioridad_id a fn_solicitud_recibir_externa (ORIGEN_
--  SOLICITUD/PRIORIDAD_SOLICITUD son catálogo del tenant — no algo que un
--  tercero sin sesión de staff deba elegir), pero solicitudes los exigía
--  NOT NULL. Resuelto en la migración anterior (nullable + CHECK) y aquí:
--  fn_solicitud_triage_aceptar gana los dos parámetros — es, de hecho, el
--  staff en el momento del triage quien clasifica canal y prioridad, un
--  criterio más coherente que pedírselo al remitente externo. Adición
--  documentada (mismo espíritu que las columnas no previstas de MANT-10/
--  GOB-1), no un cambio de alcance.
--
--  fn_solicitud_triage_aceptar/_rechazar duplican (no reutilizan) el
--  pequeño bloque de emparejamiento de solicitud_sla que ya tiene
--  gobierno_crear_solicitud — diff mínimo, sin tocar una función existente
--  que ya tiene su propia suite verde (lección de MANT-5/D-57: preferir un
--  diff chico sobre reescribir código grande compartido).
-- ═══════════════════════════════════════════════════════════════════════

-- ── fn_solicitud_recibir_externa ─────────────────────────────────────────
create function public.fn_solicitud_recibir_externa(
  p_actor_externo_vinculo_id uuid,
  p_inmueble_id uuid,
  p_tipo_id bigint,
  p_categoria_id bigint,
  p_asunto text,
  p_descripcion text default null
)
returns public.solicitudes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vinculo   public.actor_externo_vinculo;
  v_ipr       public.inmueble_persona_rol;
  v_calidad   public.gobierno_expediente_calidad_t;
  v_numero    integer;
  v_anio      smallint;
  v_solicitud public.solicitudes;
begin
  select * into v_vinculo from public.actor_externo_vinculo where id = p_actor_externo_vinculo_id;
  if not found or v_vinculo.auth_user_id is distinct from (select auth.uid()) then
    raise exception 'SOLICITUD_EXTERNA_INMUEBLE_NO_VINCULADO: vínculo % inválido para este usuario',
      p_actor_externo_vinculo_id;
  end if;
  if v_vinculo.vigente_hasta is not null and v_vinculo.vigente_hasta < current_date then
    raise exception 'SOLICITUD_EXTERNA_INMUEBLE_NO_VINCULADO: el vínculo % ya no está vigente',
      p_actor_externo_vinculo_id;
  end if;

  select * into v_ipr from public.inmueble_persona_rol where id = v_vinculo.persona_rol_id;
  if not found or v_ipr.inmueble_id is distinct from p_inmueble_id then
    raise exception
      'SOLICITUD_EXTERNA_INMUEBLE_NO_VINCULADO: el vínculo % no corresponde al inmueble %',
      p_actor_externo_vinculo_id, p_inmueble_id;
  end if;

  if not public.check_rate_limit(
    'solicitud_recibir_externa:' || p_actor_externo_vinculo_id::text, 5, interval '1 hour'
  ) then
    raise exception 'RATE_LIMITED: demasiadas solicitudes externas para este vínculo en poco tiempo';
  end if;

  v_calidad := v_vinculo.persona_tipo::text::public.gobierno_expediente_calidad_t;
  v_anio := extract(year from current_date)::smallint;
  v_numero := public.fn_siguiente_numero_solicitud(v_vinculo.tenant_id, v_anio);

  insert into public.solicitudes (
    tenant_id, numero, anio, tipo_id, categoria_id, solicitante_ref, inmueble_id, calidad,
    asunto, descripcion, estado, origen_actor_externo_id
  ) values (
    v_vinculo.tenant_id, v_numero, v_anio, p_tipo_id, p_categoria_id, v_ipr.tercero_id,
    p_inmueble_id, v_calidad, p_asunto, p_descripcion, 'recibida_externa', p_actor_externo_vinculo_id
  )
  returning * into v_solicitud;

  return v_solicitud;
end;
$$;

comment on function public.fn_solicitud_recibir_externa(uuid, uuid, bigint, bigint, text, text) is
  'GOB-8 (parche) §3.3: un actor externo (AD-37) radica una PQRS para su propio inmueble. Nace '
  'en recibida_externa, sin sla_vence_at, sin origen_id/prioridad_id (los asigna el triage). '
  'Rate-limited por vínculo (check_rate_limit, 5/hora). Cero política RLS de insert sobre '
  'solicitudes — esta función SECURITY DEFINER es la única vía.';

-- ── fn_solicitud_triage_aceptar ──────────────────────────────────────────
create function public.fn_solicitud_triage_aceptar(
  p_solicitud_id uuid,
  p_origen_id bigint,
  p_prioridad_id bigint
)
returns public.solicitudes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_solicitud    public.solicitudes;
  v_sla          public.solicitud_sla;
  v_sla_vence_at timestamptz;
  v_actor        uuid;
begin
  select * into v_solicitud from public.solicitudes where id = p_solicitud_id;
  if not found then
    raise exception 'ATENCION_SOLICITUD_INEXISTENTE: solicitud % no existe', p_solicitud_id;
  end if;

  if not public.has_role(v_solicitud.tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'ATENCION_TRANSICION_REQUIERE_AUXILIAR: aceptar en triage exige rol auxiliar';
  end if;

  if v_solicitud.estado is distinct from 'recibida_externa' then
    raise exception 'SOLICITUD_TRIAGE_ESTADO_INVALIDO: la solicitud % está en % (se esperaba '
      'recibida_externa)', p_solicitud_id, v_solicitud.estado;
  end if;

  v_actor := (select auth.uid());

  select * into v_sla
  from public.solicitud_sla
  where tenant_id = v_solicitud.tenant_id and tipo_id = v_solicitud.tipo_id
    and categoria_id = v_solicitud.categoria_id and prioridad_id = p_prioridad_id
    and vigente_desde <= current_date
    and (vigente_hasta is null or vigente_hasta >= current_date)
  order by vigente_desde desc
  limit 1;

  if found then
    if v_sla.horario_habil then
      v_sla_vence_at := public.gobierno_sumar_horas_habiles(now(), v_sla.horas_resolucion);
    else
      v_sla_vence_at := now() + (v_sla.horas_resolucion || ' hours')::interval;
    end if;
  end if;

  update public.solicitudes set
    estado = 'nueva',
    origen_id = p_origen_id,
    prioridad_id = p_prioridad_id,
    sla_id = case when found then v_sla.id end,
    sla_vence_at = v_sla_vence_at,
    triage_resuelto_por = v_actor,
    triage_resuelto_at = now(),
    updated_at = now()
  where id = p_solicitud_id
  returning * into v_solicitud;

  insert into public.solicitud_actuaciones (tenant_id, solicitud_id, estado, fecha, descripcion, registrado_por)
  values (
    v_solicitud.tenant_id, p_solicitud_id, 'nueva', current_date,
    'Aceptada en triage — pasa a solicitud activa, SLA calculado desde este momento.', v_actor
  );

  return v_solicitud;
end;
$$;

comment on function public.fn_solicitud_triage_aceptar(uuid, bigint, bigint) is
  'GOB-8 (parche) §3.4: acepta una solicitud recibida_externa → nueva. El SLA se calcula DESDE '
  'ESTE MOMENTO (nunca desde la recepción original) — la copropiedad no se penaliza por el '
  'tiempo de espera del triage. p_origen_id/p_prioridad_id los asigna el staff aquí (el '
  'remitente externo no los elige). Exige rol auxiliar.';

-- ── fn_solicitud_triage_rechazar ─────────────────────────────────────────
create function public.fn_solicitud_triage_rechazar(p_solicitud_id uuid, p_motivo text)
returns public.solicitudes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_solicitud public.solicitudes;
  v_actor     uuid;
begin
  select * into v_solicitud from public.solicitudes where id = p_solicitud_id;
  if not found then
    raise exception 'ATENCION_SOLICITUD_INEXISTENTE: solicitud % no existe', p_solicitud_id;
  end if;

  if not public.has_role(v_solicitud.tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'ATENCION_TRANSICION_REQUIERE_AUXILIAR: rechazar en triage exige rol auxiliar';
  end if;

  if v_solicitud.estado is distinct from 'recibida_externa' then
    raise exception 'SOLICITUD_TRIAGE_ESTADO_INVALIDO: la solicitud % está en % (se esperaba '
      'recibida_externa)', p_solicitud_id, v_solicitud.estado;
  end if;

  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'SOLICITUD_TRIAGE_RECHAZO_SIN_MOTIVO: rechazar en triage exige un motivo';
  end if;

  v_actor := (select auth.uid());

  update public.solicitudes set
    estado = 'rechazada_triage',
    triage_motivo_rechazo = p_motivo,
    triage_resuelto_por = v_actor,
    triage_resuelto_at = now(),
    updated_at = now()
  where id = p_solicitud_id
  returning * into v_solicitud;

  insert into public.solicitud_actuaciones (tenant_id, solicitud_id, estado, fecha, descripcion, registrado_por)
  values (v_solicitud.tenant_id, p_solicitud_id, 'rechazada_triage', current_date, p_motivo, v_actor);

  return v_solicitud;
end;
$$;

comment on function public.fn_solicitud_triage_rechazar(uuid, text) is
  'GOB-8 (parche) §3.4: rechaza una solicitud recibida_externa → rechazada_triage (terminal). '
  'Exige motivo (SOLICITUD_TRIAGE_RECHAZO_SIN_MOTIVO) y rol auxiliar. Nunca llegó a ser una '
  'solicitud real — queda trazada en solicitud_actuaciones.';

-- ── fn_solicitud_estado_externo ──────────────────────────────────────────
create function public.fn_solicitud_estado_externo(
  p_actor_externo_vinculo_id uuid,
  p_solicitud_id uuid
)
returns table (
  numero integer,
  anio smallint,
  estado public.solicitud_estado_t,
  asunto text,
  descripcion text,
  triage_motivo_rechazo text,
  created_at timestamptz,
  resuelta_at timestamptz,
  cerrada_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vinculo_auth uuid;
begin
  select auth_user_id into v_vinculo_auth
  from public.actor_externo_vinculo
  where id = p_actor_externo_vinculo_id;

  if v_vinculo_auth is null or v_vinculo_auth is distinct from (select auth.uid()) then
    raise exception 'SOLICITUD_EXTERNA_INMUEBLE_NO_VINCULADO: vínculo % inválido para este usuario',
      p_actor_externo_vinculo_id;
  end if;

  return query
    select s.numero, s.anio, s.estado, s.asunto, s.descripcion, s.triage_motivo_rechazo,
      s.created_at, s.resuelta_at, s.cerrada_at
    from public.solicitudes s
    where s.id = p_solicitud_id and s.origen_actor_externo_id = p_actor_externo_vinculo_id;
end;
$$;

comment on function public.fn_solicitud_estado_externo(uuid, uuid) is
  'GOB-8 (parche) §3.5: el actor externo consulta el estado de UNA de sus propias solicitudes '
  '(incluye recibida_externa/rechazada_triage, con el motivo si lo hay) — nunca las de otro '
  'vínculo/inmueble. Cero fila devuelta si p_solicitud_id no le pertenece.';
