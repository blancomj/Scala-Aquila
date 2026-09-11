-- ═══════════════════════════════════════════════════════════════════════
--  EXT-02 · solicitudes desde External — cancelación y listado
--  Ver EXT_02_solicitudes.md §3.2, §3.3.
--
--  fn_solicitud_estado_externo (parche GOB-8) queda intacta: cambiar su
--  tipo de retorno para que sirva de "listar" exigiría un DROP FUNCTION
--  sobre una función ya en producción desde el parche (mismo riesgo de
--  feedback_extender_funcion_pg_cambia_aridad, aplicado aquí a tipo de
--  retorno en vez de aridad) — se agrega una función nueva y pequeña para
--  listar en vez de reescribir la existente (diff mínimo, MANT-5/D-57).
--
--  Gotcha de plpgsql encontrado al probar: una columna de RETURNS TABLE
--  llamada `id` se vuelve un parámetro OUT en el espacio de nombres de
--  TODA la función — una referencia sin calificar a `id` en cualquier otra
--  consulta del cuerpo (aquí, el chequeo de dueño contra
--  `actor_externo_vinculo`) queda ambigua entre esa columna y el
--  parámetro OUT ("column reference \"id\" is ambiguous"), aunque el
--  SELECT final sí calificaba `s.id` correctamente. Se calificó también
--  la consulta de chequeo (`actor_externo_vinculo.id`).
-- ═══════════════════════════════════════════════════════════════════════

alter table public.solicitudes
  drop constraint solicitudes_clasificacion_completa,
  add constraint solicitudes_clasificacion_completa check (
    estado in ('recibida_externa', 'rechazada_triage', 'cancelada_por_solicitante')
    or (origen_id is not null and prioridad_id is not null)
  );

-- ── fn_solicitud_cancelar_externa ────────────────────────────────────────
create function public.fn_solicitud_cancelar_externa(p_vinculo_id uuid, p_solicitud_id uuid)
returns public.solicitudes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vinculo_auth uuid;
  v_solicitud    public.solicitudes;
begin
  select auth_user_id into v_vinculo_auth
  from public.actor_externo_vinculo
  where actor_externo_vinculo.id = p_vinculo_id;

  if v_vinculo_auth is null or v_vinculo_auth is distinct from (select auth.uid()) then
    raise exception 'SOLICITUD_EXTERNA_INMUEBLE_NO_VINCULADO: vínculo % inválido para este usuario',
      p_vinculo_id;
  end if;

  select * into v_solicitud from public.solicitudes where id = p_solicitud_id;
  if not found or v_solicitud.origen_actor_externo_id is distinct from p_vinculo_id then
    raise exception 'ATENCION_SOLICITUD_INEXISTENTE: solicitud % no existe para este vínculo',
      p_solicitud_id;
  end if;

  if v_solicitud.estado is distinct from 'recibida_externa' then
    raise exception 'SOLICITUD_CANCELACION_FUERA_DE_PLAZO: la solicitud % ya está en %, no se '
      'puede cancelar (solo antes de triage)', p_solicitud_id, v_solicitud.estado;
  end if;

  update public.solicitudes set estado = 'cancelada_por_solicitante', updated_at = now()
  where id = p_solicitud_id
  returning * into v_solicitud;

  insert into public.solicitud_actuaciones (tenant_id, solicitud_id, estado, fecha, descripcion)
  values (
    v_solicitud.tenant_id, p_solicitud_id, 'cancelada_por_solicitante', current_date,
    'Cancelada por el propio solicitante antes de triage.'
  );

  return v_solicitud;
end;
$$;

comment on function public.fn_solicitud_cancelar_externa(uuid, uuid) is
  'EXT-02 §3.2: el actor externo cancela SU solicitud mientras siga en recibida_externa (antes de '
  'que el staff la haya mirado) → SOLICITUD_CANCELACION_FUERA_DE_PLAZO si ya pasó a triage. Queda '
  'en solicitud_actuaciones igual que aceptar/rechazar.';

-- ── fn_solicitud_mis_solicitudes_externas ────────────────────────────────
create function public.fn_solicitud_mis_solicitudes_externas(p_vinculo_id uuid)
returns table (
  id uuid,
  numero integer,
  anio smallint,
  estado public.solicitud_estado_t,
  tipo_id bigint,
  categoria_id bigint,
  asunto text,
  triage_motivo_rechazo text,
  created_at timestamptz
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
  where actor_externo_vinculo.id = p_vinculo_id;

  if v_vinculo_auth is null or v_vinculo_auth is distinct from (select auth.uid()) then
    raise exception 'SOLICITUD_EXTERNA_INMUEBLE_NO_VINCULADO: vínculo % inválido para este usuario',
      p_vinculo_id;
  end if;

  return query
    select s.id, s.numero, s.anio, s.estado, s.tipo_id, s.categoria_id, s.asunto,
      s.triage_motivo_rechazo, s.created_at
    from public.solicitudes s
    where s.origen_actor_externo_id = p_vinculo_id
    order by s.created_at desc;
end;
$$;

comment on function public.fn_solicitud_mis_solicitudes_externas(uuid) is
  'EXT-02 §3.3 ("Mis solicitudes"): lista TODAS las solicitudes de un vínculo del actor externo '
  'que llama — nunca las de otro vínculo/inmueble. El detalle de una en particular sigue '
  'sirviéndolo fn_solicitud_estado_externo (parche GOB-8), sin cambios.';
