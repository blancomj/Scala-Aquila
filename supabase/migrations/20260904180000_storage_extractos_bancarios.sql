-- ═══════════════════════════════════════════════════════════════════════
--  Storage: bucket extractos-bancarios — mismo patrón exacto que
--  20260821090000_storage_documentos_inmueble.sql.
--
--  Bucket privado. La escritura real (objeto + fila en extracto_bancario)
--  pasa por importar-extracto-bancario con service_role — extracto_bancario
--  no tiene política de INSERT para authenticated (20260904170000), así
--  que storage.objects tampoco recibe una aquí.
--
--  Sí recibe SELECT: los miembros del tenant pueden leer sus propios
--  archivos ya importados directamente, sin otra Edge Function solo para
--  eso — mismo criterio que documentos-inmueble.
--
--  Convención de ruta: {tenant_id}/{extracto_id}_{nombre} — el primer
--  segmento es el tenant_id, delega el aislamiento a is_member() (AD-03).
-- ═══════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'extractos-bancarios',
  'extractos-bancarios',
  false,
  15728640, -- 15 MB, mismo límite que documentos-inmueble
  array['text/csv', 'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
on conflict (id) do nothing;

create policy extractos_bancarios_storage_select_miembro
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'extractos-bancarios'
    and public.is_member((storage.foldername(name))[1]::uuid)
  );
