-- ═══════════════════════════════════════════════════════════════════════
--  Storage: bucket auditoria-evidencias — soporte de archivo real para
--  auditoria_evidencias.archivo_path (PROMPT AUDITORÍA §34, §70).
--
--  Privado (public=false). Igual que documentos-inmueble
--  (20260821090000): la escritura real pasa por la Edge Function
--  subir-evidencia-auditoria con service_role, porque el hash SHA-256 que
--  garantiza la integridad de la evidencia debe calcularse en servidor —
--  nunca puede confiarse en un hash enviado por el cliente, o cualquiera
--  podría registrar una evidencia con un hash que no corresponde al
--  contenido real. Por eso storage.objects tampoco recibe política de
--  INSERT para `authenticated` aquí.
--
--  SELECT sí tiene política — auditor/administrador del tenant (mismo
--  criterio de lectura que auditoria_evidencias, no is_member() genérico:
--  la evidencia de auditoría no es de lectura general del tenant).
--
--  Convención de ruta: {tenant_id}/{hallazgo_id}/{hash}_{nombre} — el hash
--  en la ruta evita colisiones de nombre y hace que
--  storage.foldername(name)[1] siga siendo el tenant_id (AD-03).
-- ═══════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'auditoria-evidencias',
  'auditoria-evidencias',
  false,
  15728640, -- 15 MB, mismo límite que documentos-inmueble
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do nothing;

create policy auditoria_evidencias_storage_select
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'auditoria-evidencias'
    and public.has_role((storage.foldername(name))[1]::uuid, array['auditor', 'administrador']::public.tenant_role_t[])
  );
