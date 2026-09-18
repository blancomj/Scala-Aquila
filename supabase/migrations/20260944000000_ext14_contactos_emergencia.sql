-- ═══════════════════════════════════════════════════════════════════════
--  EXT-14 (Ola 2, M19) · Mi Copropiedad — contactos de emergencia
--  Ver PROMPT_MI_COPROPIEDAD_FASE2.md §4.1/§7.9.
--
--  Ligada a `inmueble_id`, NO a `persona_id`/vínculo puntual: cualquier
--  residente del mismo inmueble ve y gestiona los mismos contactos —
--  decisión explícita de este corte, empezar simple (si dos personas del
--  mismo inmueble necesitaran contactos distintos sería un problema real
--  no confirmado hoy). `creado_por_vinculo_id` es solo trazabilidad de
--  quién lo creó, nunca la base de la autorización — la autorización
--  siempre es "el contacto pertenece a mi inmueble" (verificado en la
--  Edge Function, nunca aquí en RLS: AD-37, el actor externo no tiene
--  política propia).
-- ═══════════════════════════════════════════════════════════════════════

create table public.contactos_emergencia (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references public.tenants (id) on delete cascade,
  inmueble_id            uuid not null references public.inmuebles (id) on delete cascade,
  nombre                 text not null,
  telefono               text not null,
  parentesco             text,
  creado_por_vinculo_id  uuid references public.actor_externo_vinculo (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

alter table public.contactos_emergencia enable row level security;
alter table public.contactos_emergencia force row level security;

create index contactos_emergencia_tenant_idx on public.contactos_emergencia (tenant_id);
create index contactos_emergencia_inmueble_idx on public.contactos_emergencia (inmueble_id);

create trigger set_updated_at before update on public.contactos_emergencia
  for each row execute function public.set_updated_at();

comment on table public.contactos_emergencia is
  'EXT-14 (Ola 2, M19): contactos de emergencia de un inmueble, gestionados por cualquier '
  'residente vinculado a ese inmueble (no por persona individual). Sin política RLS de '
  'escritura para `authenticated` — el alta/baja SIEMPRE pasa por external-contactos-emergencia '
  '(service_role), que valida el inmueble_id del contexto del actor externo antes de tocar la fila.';

comment on column public.contactos_emergencia.creado_por_vinculo_id is
  'Trazabilidad de qué vínculo lo creó — NUNCA la base de la autorización de lectura/borrado, '
  'que siempre es "pertenece a mi inmueble" (cualquier residente del mismo inmueble gestiona '
  'los contactos de todos, no solo los propios).';

create policy contactos_emergencia_select_miembro
  on public.contactos_emergencia for select
  to authenticated
  using (public.is_member(tenant_id));

-- Sin política de INSERT/UPDATE/DELETE para `authenticated`: tanto el residente (nunca
-- tenant_member, AD-37) como un eventual staff que quisiera editar pasan siempre por
-- external-contactos-emergencia con service_role — mismo criterio que
-- mant_autorizaciones_visita (20260932760000): cero políticas de escritura, todo vía función.
