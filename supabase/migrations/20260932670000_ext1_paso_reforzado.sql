-- ═══════════════════════════════════════════════════════════════════════
--  EXT-01 · actor_externo_paso_reforzado (Hito 4)
--
--  Primitiva de segundo factor para acciones de alto riesgo (EXT_01 §3.5).
--  Este corte NO decide qué acciones lo requieren — eso lo declara cada
--  corte consumidor (p. ej. el futuro voto remoto de GOB-10) pasando su
--  propio `accion`/`contexto_id`. Sin tenant_id: el spec no lo pide (la
--  firma es (auth_user_id, accion, contexto_id)) y no hay ninguna consulta
--  de cliente sobre esta tabla que necesite acotar por tenant — es
--  puramente función-a-función.
--
--  Sin política de acceso para ningún rol de cliente, mismo criterio que
--  actor_externo_otp: solo las funciones de 20260932700000 la tocan.
-- ═══════════════════════════════════════════════════════════════════════

create table public.actor_externo_paso_reforzado (
  id             uuid primary key default gen_random_uuid(),
  auth_user_id   uuid not null references auth.users (id) on delete cascade,
  accion         text not null check (char_length(btrim(accion)) > 0),
  contexto_id    uuid not null,
  codigo_hash    text not null,
  intentos       integer not null default 0,
  confirmado_at  timestamptz,
  expira_at      timestamptz not null,
  creado_at      timestamptz not null default now()
);

alter table public.actor_externo_paso_reforzado enable row level security;
alter table public.actor_externo_paso_reforzado force row level security;

create index actor_externo_paso_reforzado_lookup_idx
  on public.actor_externo_paso_reforzado (auth_user_id, accion, contexto_id, creado_at desc);

comment on table public.actor_externo_paso_reforzado is
  'EXT-01 §3.5 — primitiva de paso reforzado (código de un solo uso atado a auth_user_id + '
  'accion + contexto_id). No decide qué acciones lo requieren; eso lo declara cada corte '
  'consumidor. Se agota tras 3 intentos fallidos (PASO_REFORZADO_AGOTADO).';
