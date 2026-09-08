-- ═══════════════════════════════════════════════════════════════════════
--  GOB-8 · solicitud_encuesta — encuesta de satisfacción mínima viable
--  Ver GOB_08_atencion_consulta.md §4.5.
--
--  "Una pregunta de valoración y un comentario opcional al cerrar la
--  solicitud, servida por el mismo enlace de token" — BUENA PRÁCTICA (misma
--  fila de fundamento_normativo que el resto de GOB-8,
--  referencia='gob8_buena_practica_sin_base_legal'), sin motor de encuestas
--  configurable (§4.5, §5 vinculante): una sola calificación 1-5 + comentario
--  libre, nada más.
--
--  §4.4 dice "sin capacidad de escritura por parte del consultante ...
--  consultar no es interactuar" — pero §4.5 la excluye explícitamente de esa
--  regla ("servida por el mismo enlace de token"). La excepción es angosta a
--  propósito: ni RPC ni política RLS de insert para el consultante anónimo
--  (la prueba 10 ya exige que un insert directo a `solicitudes` falle; ese
--  criterio no cambia). La única puerta de escritura es la Edge Function
--  `responder-encuesta-solicitud`, que corre como service_role y valida token
--  + estado igual que `ver-inmueble`.
-- ═══════════════════════════════════════════════════════════════════════

create table public.solicitud_encuesta (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  solicitud_id   uuid not null references public.solicitudes (id) on delete cascade,
  calificacion   smallint not null,
  comentario     text,
  respondida_at  timestamptz not null default now(),
  created_at     timestamptz not null default now(),

  constraint solicitud_encuesta_solicitud_unica unique (solicitud_id),
  constraint solicitud_encuesta_calificacion_valida check (calificacion between 1 and 5)
);

alter table public.solicitud_encuesta enable row level security;
alter table public.solicitud_encuesta force row level security;

create index solicitud_encuesta_tenant_idx on public.solicitud_encuesta (tenant_id);

comment on table public.solicitud_encuesta is
  'GOB-8 §4.5: encuesta de satisfacción mínima viable (calificación 1-5 + comentario opcional), '
  'servida por el mismo enlace de token del inmueble tras cerrar/resolver una solicitud — BUENA '
  'PRÁCTICA (fundamento_normativo.referencia=''gob8_buena_practica_sin_base_legal''), no '
  'obligación legal. Una fila por solicitud (unique solicitud_id), append-only. Sin política '
  'insert/update para `authenticated` ni para el rol anónimo: la única escritura posible es la '
  'Edge Function responder-encuesta-solicitud (service_role), que valida el token de consulta '
  'antes de insertar — el consultante nunca obtiene una vía directa a la tabla.';

create policy solicitud_encuesta_select_miembro
  on public.solicitud_encuesta for select
  to authenticated
  using (public.is_member(tenant_id));

-- Sin política insert/update: ni siquiera `authenticated` escribe aquí — el único camino es la
-- Edge Function (service_role) tras validar el token de consulta del inmueble.

create trigger solicitud_encuesta_forbid_mutation
  before update or delete on public.solicitud_encuesta
  for each row execute function public.forbid_mutation();
