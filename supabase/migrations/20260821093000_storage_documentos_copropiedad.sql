-- ═══════════════════════════════════════════════════════════════════════
--  Storage: bucket documentos-copropiedad — documentos a nivel de tenant
--  (copropiedad), no atados a un inmueble específico. Mismo patrón que
--  documentos-inmueble (20260821090000): bucket privado, aislamiento por
--  convención de ruta {tenant_id}/... + RLS delegado a is_member(), sin
--  bucket-por-tenant.
--
--  Sin tabla de metadata ni Edge Function todavía — a diferencia de
--  documentos-inmueble, no hay contrato (§4.2 de un PROMPT_*) que
--  especifique columnas, categorías o el flujo de subida para este bucket.
--  Crear esa tabla/función ahora sería inventar el esquema sin spec. Esta
--  migración es solo la infraestructura de Storage: el bucket existe y
--  tiene su política de lectura, pero todavía no hay ningún camino de
--  escritura habilitado (ni INSERT en storage.objects para `authenticated`,
--  igual que documentos-inmueble hasta que existió subir-documento).
-- ═══════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documentos-copropiedad',
  'documentos-copropiedad',
  false,
  15728640, -- 15 MB, mismo límite que documentos-inmueble
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do nothing;

create policy documentos_copropiedad_storage_select_miembro
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'documentos-copropiedad'
    and public.is_member((storage.foldername(name))[1]::uuid)
  );
