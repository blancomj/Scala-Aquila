-- ═══════════════════════════════════════════════════════════════════════
--  GOB-8 · solicitud_actuaciones + gobierno_crear_solicitud() +
--  gobierno_registrar_actuacion_solicitud() + gobierno_escalar_solicitud()
--  Ver GOB_08_atencion_consulta.md §4.1, §4.3, pruebas 1, 2, 3, 5, 6, 11, 12.
--
--  Mismo patrón append-only que GOB-6/GOB-7: el log de actuaciones ES el
--  mecanismo de avance de estado — a diferencia de esos dos cortes, aquí
--  una actuación puede registrarse SIN cambiar de estado (p_estado_nuevo
--  igual al actual): es la forma de dejar una respuesta o nota sin mover
--  la FSM, algo que GOB-6/7 no necesitaban porque cada uno de sus hitos
--  era, por definición, un avance.
--
--  Códigos de error con prefijo ATENCION_, no SOLICITUD_: el módulo Fondos
--  (fondo_solicitudes_uso, GAP-22/D-36) ya registró 9 códigos
--  SOLICITUD_* (SOLICITUD_ESTADO_TERMINAL entre ellos) para un concepto
--  de dominio completamente distinto — reutilizar el mismo prefijo
--  habría chocado literalmente con SOLICITUD_ESTADO_TERMINAL y habría
--  quedado ambiguo para el resto. Se prefieren códigos nuevos aunque el
--  spec §4.1 sugiera SOLICITUD_CIERRE_SIN_RESPUESTA textualmente —
--  documentado como desviación deliberada en GOB_08_INFORME.md.
--
--  Segregación de funciones (Plan del corte, confirmado con el usuario):
--  crear/registrar actuaciones/escalar exige rol auxiliar — la
--  configuración de SLA también (ver migración anterior), porque este
--  corte entero es operación diaria, no una decisión de alto nivel (nada
--  de esto es obligación legal, spec §2).
-- ═══════════════════════════════════════════════════════════════════════

create table public.solicitud_actuaciones (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  solicitud_id   uuid not null references public.solicitudes (id) on delete cascade,
  estado         public.solicitud_estado_t not null,
  fecha          date not null,
  descripcion    text not null,
  es_respuesta   boolean not null default false,
  documento_id   uuid references public.documentos (id),
  registrado_por uuid references public.profiles (id),
  created_at     timestamptz not null default now()
);

alter table public.solicitud_actuaciones enable row level security;
alter table public.solicitud_actuaciones force row level security;

create index solicitud_actuaciones_tenant_idx on public.solicitud_actuaciones (tenant_id);
create index solicitud_actuaciones_solicitud_idx on public.solicitud_actuaciones (solicitud_id);

comment on table public.solicitud_actuaciones is
  'GOB-8: bitácora append-only de la solicitud — cada fila es una nota, una respuesta '
  '(es_respuesta=true) o un cambio de estado (estado puede repetir el valor actual: registrar '
  'una respuesta no siempre mueve la FSM). gobierno_registrar_actuacion_solicitud() exige al '
  'menos una fila es_respuesta=true antes de permitir estado=resuelta '
  '(ATENCION_CIERRE_SIN_RESPUESTA, spec §6 prueba 1).';

create policy solicitud_actuaciones_select_miembro
  on public.solicitud_actuaciones for select
  to authenticated
  using (public.is_member(tenant_id));

create trigger solicitud_actuaciones_append_only
  before update or delete on public.solicitud_actuaciones
  for each row execute function public.forbid_mutation();

-- ── gobierno_crear_solicitud ─────────────────────────────────────────────
create function public.gobierno_crear_solicitud(
  p_tipo_id bigint,
  p_categoria_id bigint,
  p_origen_id bigint,
  p_prioridad_id bigint,
  p_solicitante_ref uuid,
  p_inmueble_id uuid,
  p_calidad public.gobierno_expediente_calidad_t,
  p_asunto text,
  p_descripcion text default null,
  p_actor_id uuid default null
)
returns public.solicitudes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id     uuid;
  v_sla           public.solicitud_sla;
  v_sla_vence_at  timestamptz;
  v_numero        integer;
  v_anio          smallint;
  v_actor         uuid;
  v_solicitud     public.solicitudes;
begin
  v_actor := coalesce((select auth.uid()), p_actor_id);

  select tenant_id into v_tenant_id from public.inmuebles where id = p_inmueble_id;
  if v_tenant_id is null then
    raise exception 'ATENCION_SOLICITUD_INMUEBLE_INEXISTENTE: inmueble % no existe', p_inmueble_id;
  end if;

  if (select auth.uid()) is not null
     and not public.has_role(v_tenant_id, array['auxiliar']::public.tenant_role_t[])
  then
    raise exception 'ATENCION_TRANSICION_REQUIERE_AUXILIAR: registrar una solicitud exige rol '
      'auxiliar';
  end if;

  select * into v_sla
  from public.solicitud_sla
  where tenant_id = v_tenant_id and tipo_id = p_tipo_id and categoria_id = p_categoria_id
    and prioridad_id = p_prioridad_id
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

  v_anio := extract(year from current_date)::smallint;
  v_numero := public.fn_siguiente_numero_solicitud(v_tenant_id, v_anio);

  insert into public.solicitudes (
    tenant_id, numero, anio, tipo_id, categoria_id, origen_id, prioridad_id, solicitante_ref,
    inmueble_id, calidad, asunto, descripcion, creada_por, sla_id, sla_vence_at
  ) values (
    v_tenant_id, v_numero, v_anio, p_tipo_id, p_categoria_id, p_origen_id, p_prioridad_id,
    p_solicitante_ref, p_inmueble_id, p_calidad, p_asunto, p_descripcion, v_actor,
    case when found then v_sla.id end, v_sla_vence_at
  )
  returning * into v_solicitud;

  return v_solicitud;
end;
$$;

comment on function public.gobierno_crear_solicitud(
  bigint, bigint, bigint, bigint, uuid, uuid, public.gobierno_expediente_calidad_t, text, text, uuid
) is
  'GOB-8: crea la solicitud ya numerada (nunca borrador). Empareja solicitud_sla por '
  '(tipo,categoria,prioridad) vigente a hoy — si no hay ninguna configurada, sla_id/'
  'sla_vence_at quedan null (el SLA nunca bloquea, spec §4.2). Exige rol auxiliar.';

-- ── gobierno_registrar_actuacion_solicitud ───────────────────────────────
create function public.gobierno_registrar_actuacion_solicitud(
  p_solicitud_id uuid,
  p_estado_nuevo public.solicitud_estado_t,
  p_fecha date,
  p_descripcion text,
  p_es_respuesta boolean default false,
  p_motivo text default null,
  p_documento_id uuid default null,
  p_actor_id uuid default null
)
returns public.solicitud_actuaciones
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_solicitud   public.solicitudes;
  v_sla_vence   timestamptz;
  v_en_espera   timestamptz;
  v_actor       uuid;
  v_actuacion   public.solicitud_actuaciones;
begin
  select * into v_solicitud from public.solicitudes where id = p_solicitud_id;
  if not found then
    raise exception 'ATENCION_SOLICITUD_INEXISTENTE: solicitud % no existe', p_solicitud_id;
  end if;

  if (select auth.uid()) is not null
     and not public.has_role(v_solicitud.tenant_id, array['auxiliar']::public.tenant_role_t[])
  then
    raise exception 'ATENCION_TRANSICION_REQUIERE_AUXILIAR: registrar una actuación exige rol '
      'auxiliar';
  end if;

  v_actor := coalesce((select auth.uid()), p_actor_id);

  if v_solicitud.estado in ('resuelta', 'cerrada', 'anulada') then
    raise exception 'ATENCION_SOLICITUD_ESTADO_TERMINAL: la solicitud % ya está en % (terminal)',
      p_solicitud_id, v_solicitud.estado;
  end if;

  if p_estado_nuevo = 'en_espera' and (p_motivo is null or btrim(p_motivo) = '') then
    raise exception 'ATENCION_EN_ESPERA_SIN_MOTIVO: pasar a en_espera exige un motivo — pausa '
      'el reloj del SLA (spec §4.1)';
  end if;

  if p_estado_nuevo = 'anulada' and (p_motivo is null or btrim(p_motivo) = '') then
    raise exception 'ATENCION_ANULACION_SIN_MOTIVO: anular una solicitud exige un motivo';
  end if;

  -- Pausa/reanuda el reloj del SLA (spec §6 prueba 2) — se calcula ANTES de insertar la
  -- actuación para poder usar los valores nuevos en el mismo UPDATE de abajo.
  v_sla_vence := v_solicitud.sla_vence_at;
  v_en_espera := v_solicitud.en_espera_desde;

  if p_estado_nuevo = 'en_espera' and v_solicitud.estado is distinct from 'en_espera' then
    v_en_espera := now();
  elsif v_solicitud.estado = 'en_espera' and p_estado_nuevo is distinct from 'en_espera' then
    if v_solicitud.sla_vence_at is not null and v_solicitud.en_espera_desde is not null then
      v_sla_vence := v_solicitud.sla_vence_at + (now() - v_solicitud.en_espera_desde);
    end if;
    v_en_espera := null;
  end if;

  insert into public.solicitud_actuaciones (
    tenant_id, solicitud_id, estado, fecha, descripcion, es_respuesta, documento_id, registrado_por
  ) values (
    v_solicitud.tenant_id, p_solicitud_id, p_estado_nuevo, p_fecha, p_descripcion, p_es_respuesta,
    p_documento_id, v_actor
  )
  returning * into v_actuacion;

  if p_estado_nuevo = 'resuelta'
     and not exists (
       select 1 from public.solicitud_actuaciones
       where solicitud_id = p_solicitud_id and es_respuesta
     )
  then
    raise exception 'ATENCION_CIERRE_SIN_RESPUESTA: la solicitud % no tiene ninguna actuación '
      'marcada como respuesta — no se puede resolver', p_solicitud_id;
  end if;

  update public.solicitudes set
    estado = p_estado_nuevo,
    sla_vence_at = v_sla_vence,
    en_espera_desde = v_en_espera,
    asignado_at = case when p_estado_nuevo = 'asignada' and asignado_at is null then now() else asignado_at end,
    resuelta_at = case when p_estado_nuevo = 'resuelta' then now() else resuelta_at end,
    cerrada_at = case when p_estado_nuevo = 'cerrada' then now() else cerrada_at end,
    anulada_motivo = case when p_estado_nuevo = 'anulada' then p_motivo else anulada_motivo end,
    updated_at = now()
  where id = p_solicitud_id;

  return v_actuacion;
end;
$$;

comment on function public.gobierno_registrar_actuacion_solicitud(
  uuid, public.solicitud_estado_t, date, text, boolean, text, uuid, uuid
) is
  'GOB-8: registra una actuación (respuesta, nota, o cambio de estado — p_estado_nuevo puede '
  'repetir el estado actual) y aplica la pausa/reanudación del SLA al entrar/salir de '
  'en_espera (spec §6 prueba 2). Exige al menos una actuación es_respuesta=true antes de '
  'permitir resuelta (ATENCION_CIERRE_SIN_RESPUESTA). Exige rol auxiliar.';

-- ── gobierno_escalar_solicitud ────────────────────────────────────────────
-- Enlaza la solicitud a un destino ya existente (spec §4.3) — no cambia su FSM, solo deja la
-- trazabilidad bidireccional (la consulta inversa, desde el destino, es una simple query por
-- columna, mismo criterio que gobierno_decisiones.acta_id de GOB-5).
create function public.gobierno_escalar_solicitud(
  p_solicitud_id uuid,
  p_destino_tipo text,
  p_destino_id uuid,
  p_actor_id uuid default null
)
returns public.solicitudes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_solicitud    public.solicitudes;
  v_tenant_dest  uuid;
  v_actor        uuid;
  v_solicitud_actualizada public.solicitudes;
begin
  select * into v_solicitud from public.solicitudes where id = p_solicitud_id;
  if not found then
    raise exception 'ATENCION_SOLICITUD_INEXISTENTE: solicitud % no existe', p_solicitud_id;
  end if;

  if (select auth.uid()) is not null
     and not public.has_role(v_solicitud.tenant_id, array['auxiliar']::public.tenant_role_t[])
  then
    raise exception 'ATENCION_TRANSICION_REQUIERE_AUXILIAR: escalar una solicitud exige rol '
      'auxiliar';
  end if;

  v_actor := coalesce((select auth.uid()), p_actor_id);

  if p_destino_tipo = 'decision' then
    select tenant_id into v_tenant_dest from public.gobierno_decisiones where id = p_destino_id;
  elsif p_destino_tipo = 'expediente_convivencia' then
    select tenant_id into v_tenant_dest from public.gobierno_expedientes_convivencia where id = p_destino_id;
  elsif p_destino_tipo = 'agenda_punto' then
    select tenant_id into v_tenant_dest from public.gobierno_agenda_puntos where id = p_destino_id;
  else
    raise exception 'ATENCION_ESCALAMIENTO_DESTINO_INVALIDO: % no es un destino de escalamiento '
      'válido (decision|expediente_convivencia|agenda_punto)', p_destino_tipo;
  end if;

  if v_tenant_dest is null or v_tenant_dest is distinct from v_solicitud.tenant_id then
    raise exception 'ATENCION_ESCALAMIENTO_DESTINO_INVALIDO: % % no existe o no pertenece al '
      'tenant de la solicitud', p_destino_tipo, p_destino_id;
  end if;

  update public.solicitudes set
    decision_id = case when p_destino_tipo = 'decision' then p_destino_id else decision_id end,
    expediente_convivencia_id = case when p_destino_tipo = 'expediente_convivencia' then p_destino_id else expediente_convivencia_id end,
    agenda_punto_id = case when p_destino_tipo = 'agenda_punto' then p_destino_id else agenda_punto_id end,
    updated_at = now()
  where id = p_solicitud_id
  returning * into v_solicitud_actualizada;

  insert into public.solicitud_actuaciones (tenant_id, solicitud_id, estado, fecha, descripcion, registrado_por)
  values (
    v_solicitud.tenant_id, p_solicitud_id, v_solicitud.estado, current_date,
    format('Escalada a %s %s', p_destino_tipo, p_destino_id), v_actor
  );

  return v_solicitud_actualizada;
end;
$$;

comment on function public.gobierno_escalar_solicitud(uuid, text, uuid, uuid) is
  'GOB-8 §4.3: enlaza la solicitud a una decisión (GOB-5), un expediente de convivencia (GOB-6) '
  'o un punto de agenda (GOB-2) ya existentes, validando que pertenezcan al mismo tenant. No '
  'cambia el estado de la solicitud — deja constancia en la bitácora. La orden de trabajo de '
  'mantenimiento (spec §4.3) queda fuera: ese módulo no existe (solicitudes.'
  'orden_trabajo_referencia es texto libre sin FK).';
