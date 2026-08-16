-- ═══════════════════════════════════════════════════════════════════════
--  Storage: bucket documentos-inmueble — cierra el gap §8.1 de
--  PROMPT_FICHA_INMUEBLE.md (subida de documentos, antes deliberadamente
--  bloqueada por falta de esta infraestructura).
--
--  Bucket privado (public=false). La escritura real (objeto + fila en
--  documentos_inmueble) pasa por la Edge Function subir-documento con
--  service_role — mismo patrón que pagos/liquidaciones (Anti-Redundancia):
--  documentos_inmueble ya no tiene política INSERT para `authenticated`
--  por la misma razón (calcular version bajo concurrencia). Por eso
--  storage.objects tampoco recibe política de INSERT aquí.
--
--  Sí recibe una política de SELECT: los miembros del tenant pueden leer
--  (y por lo tanto generar signed URLs) sus propios objetos directamente
--  desde el cliente, sin necesitar otra Edge Function solo para eso.
--
--  Convención de ruta: {tenant_id}/{inmueble_id}/{grupo_id}/{version}_{nombre}
--  — storage.foldername(name)[1] es el tenant_id, lo que permite delegar el
--  aislamiento a is_member() igual que el resto del esquema (AD-03).
-- ═══════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documentos-inmueble',
  'documentos-inmueble',
  false,
  15728640, -- 15 MB, mismo límite que ya anunciaba el dropzone deshabilitado
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do nothing;

create policy documentos_inmueble_storage_select_miembro
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'documentos-inmueble'
    and public.is_member((storage.foldername(name))[1]::uuid)
  );
