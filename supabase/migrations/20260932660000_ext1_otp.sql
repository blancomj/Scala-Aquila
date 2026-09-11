-- ═══════════════════════════════════════════════════════════════════════
--  EXT-01 · actor_externo_otp (Hito 4)
--
--  Código de un solo uso para verificar que quien solicita el alta
--  controla el contacto YA REGISTRADO por staff — nunca uno que la persona
--  escriba en el momento (EXT_01 §3.2).
--
--  Escaneado por CONTACTO (canal + valor normalizado), no por
--  persona_rol_id: un mismo contacto puede resolver a varios roles/
--  inmuebles/tenants a la vez (§3.3 "multi-relación" del spec) — resolver
--  por persona_rol_id desde el principio obligaría a elegir uno solo antes
--  de verificar nada, perdiendo esa multiplicidad. persona_rol_id vive en
--  la tabla solo como el rol que quedó verificado (columna nullable hasta
--  confirmar), no como filtro de búsqueda.
--
--  Sin política de acceso para ningún rol de cliente — se lee y escribe
--  EXCLUSIVAMENTE desde las funciones de 20260932690000 (SECURITY DEFINER,
--  EXECUTE revocado de anon/authenticated), llamadas por las Edge
--  Functions con service_role. Mismo criterio que finanzas_flujo_snapshot
--  (FIN-4): la tabla no tiene ninguna vía de escritura directa desde el
--  cliente, ni siquiera de lectura — un cliente jamás debe poder leer un
--  codigo_hash ajeno.
-- ═══════════════════════════════════════════════════════════════════════

create table public.actor_externo_otp (
  id            uuid primary key default gen_random_uuid(),
  canal         text not null check (canal in ('email', 'sms')),
  contacto      text not null,
  codigo_hash   text not null,
  intentos      integer not null default 0,
  usado_at      timestamptz,
  expira_at     timestamptz not null,
  creado_at     timestamptz not null default now()
);

alter table public.actor_externo_otp enable row level security;
alter table public.actor_externo_otp force row level security;

create index actor_externo_otp_contacto_idx on public.actor_externo_otp (canal, contacto, creado_at desc);

comment on table public.actor_externo_otp is
  'EXT-01 §3.2 — código de un solo uso, escaneado por (canal, contacto), nunca por '
  'persona_rol_id (un contacto puede resolver a varios roles a la vez, §3.3). Sin RLS de '
  'cliente: solo fn_actor_externo_solicitar_otp/confirmar_otp (20260932690000) la tocan.';

comment on column public.actor_externo_otp.contacto is
  'Valor normalizado (email en minúscula, o teléfono) — el mismo que terceros_contacto_'
  'procedencia/terceros.email/telefono, nunca uno provisto por el solicitante sin verificar. '
  'La resolución de qué persona_rol_id(s) corresponden a este contacto ocurre en '
  'fn_actor_externo_confirmar_otp al momento de confirmar, no se guarda aquí — un mismo '
  'contacto puede resolver a varios roles a la vez (§3.3 del spec).';
