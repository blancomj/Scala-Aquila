-- ═══════════════════════════════════════════════════════════════════════
--  GOB-8 (parche) · recepción externa de solicitudes con triage — columnas
--  Ver GOB_08_PARCHE_RECEPCION_EXTERNA.md §3.2.
--
--  `origen_id`/`prioridad_id` pasan a nullable: una solicitud que llega por
--  AQUILA External (recibida_externa) todavía no tiene canal ni prioridad
--  clasificados — el propio spec §3.3 no le pide esos dos parámetros al
--  actor externo (ORIGEN_SOLICITUD/PRIORIDAD_SOLICITUD son catálogo del
--  tenant, no algo que un tercero sin sesión de staff deba elegir). El
--  triage (siguiente migración) es exactamente el punto en el que un
--  humano los asigna al aceptar — el CHECK de abajo garantiza que ninguna
--  solicitud puede tener ambos en null fuera de las dos etapas de espera.
--  El camino normal (gobierno_crear_solicitud, staff) sigue proveyendo los
--  4 clasificadores siempre — esto no relaja nada para ese camino.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.solicitudes
  alter column origen_id drop not null,
  alter column prioridad_id drop not null,
  add column origen_actor_externo_id uuid references public.actor_externo_vinculo (id),
  add column triage_resuelto_por uuid references public.profiles (id),
  add column triage_resuelto_at timestamptz,
  add column triage_motivo_rechazo text;

alter table public.solicitudes
  add constraint solicitudes_triage_rechazo_con_motivo check (
    estado is distinct from 'rechazada_triage'
    or (triage_motivo_rechazo is not null and btrim(triage_motivo_rechazo) <> '')
  ),
  add constraint solicitudes_clasificacion_completa check (
    estado in ('recibida_externa', 'rechazada_triage')
    or (origen_id is not null and prioridad_id is not null)
  );

create index solicitudes_origen_actor_externo_idx on public.solicitudes (origen_actor_externo_id)
  where origen_actor_externo_id is not null;

comment on column public.solicitudes.origen_actor_externo_id is
  'GOB-8 (parche) §3.2: vínculo del actor externo que envió la solicitud (null si nació por el '
  'camino normal de staff, gobierno_crear_solicitud). No sustituye a solicitante_ref — este último '
  'siempre queda resuelto al tercero real (inmueble_persona_rol.tercero_id del vínculo), igual que '
  'cualquier otra solicitud.';
comment on column public.solicitudes.triage_resuelto_por is
  'Quién aceptó o rechazó la recepción externa (fn_solicitud_triage_aceptar/_rechazar) — null '
  'mientras esté en recibida_externa.';
comment on column public.solicitudes.triage_motivo_rechazo is
  'Obligatorio cuando estado=rechazada_triage (constraint solicitudes_triage_rechazo_con_motivo) '
  '— todo rechazo se motiva, nunca solo se descarta (spec §3.2).';
