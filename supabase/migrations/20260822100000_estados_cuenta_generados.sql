-- ═══════════════════════════════════════════════════════════════════════
--  Estado de cuenta en PDF — PLAN_DATOS_REALES.md §3.3
--  Decisión: opción B (servidor) — se genera vía Edge Function
--  (generar-estado-cuenta) que renderiza HTML y lo convierte a PDF con un
--  servicio externo (PDFShift), y se archiva en Storage para poder
--  reenviarse por email más adelante (§3.4), sin tener que regenerarlo.
--
--  Bucket privado, mismo patrón exacto que documentos-inmueble
--  (20260821090000): sin política INSERT para `authenticated` — la única
--  escritura pasa por la Edge Function con service_role. Sí hay SELECT
--  para miembros del tenant, para poder generar signed URLs directo desde
--  el cliente sin otra Edge Function.
--
--  estados_cuenta_generados es una tabla de rastreo mínima (no un
--  documento del inmueble — no se mezcla con documentos_inmueble, que
--  modela archivos subidos por un usuario, no generados por el sistema).
--  Sin versión ni tipo_documento_id: cada generación es una fila nueva,
--  el histórico completo vive en la tabla misma.
-- ═══════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('estados-cuenta', 'estados-cuenta', false, 15728640, array['application/pdf'])
on conflict (id) do nothing;

create policy estados_cuenta_storage_select_miembro
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'estados-cuenta'
    and public.is_member((storage.foldername(name))[1]::uuid)
  );

create table public.estados_cuenta_generados (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  inmueble_id   uuid not null references public.inmuebles (id) on delete cascade,
  storage_path  text not null,
  generado_por  uuid references public.profiles (id),
  created_at    timestamptz not null default now()
);

alter table public.estados_cuenta_generados enable row level security;
alter table public.estados_cuenta_generados force row level security;

create index estados_cuenta_generados_tenant_idx on public.estados_cuenta_generados (tenant_id);
create index estados_cuenta_generados_inmueble_idx on public.estados_cuenta_generados (inmueble_id);

comment on table public.estados_cuenta_generados is
  'Rastro de PDFs generados (PLAN_DATOS_REALES.md §3.3) — no es un documento subido por '
  'un usuario (eso es documentos_inmueble), es la bitácora de generar-estado-cuenta. '
  'Sin política INSERT para authenticated: solo la Edge Function escribe (service_role).';

create policy estados_cuenta_generados_select_miembro
  on public.estados_cuenta_generados for select
  to authenticated
  using (public.is_member(tenant_id));
