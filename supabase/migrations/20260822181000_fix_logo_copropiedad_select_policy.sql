-- ═══════════════════════════════════════════════════════════════════════
--  Fix: la subida de logo (upsert:true) fallaba con "new row violates
--  row-level security policy" — reproducido en vivo en esta sesión.
--
--  Causa real: bucket_id `logo-copropiedad` es `public = true`, así que
--  asumí (20260822180000) que no hacía falta política de SELECT — cierto
--  para la URL pública de lectura (esa sirve el objeto sin pasar por RLS),
--  pero FALSO para la escritura autenticada: Storage sube con upsert vía
--  `INSERT ... ON CONFLICT DO UPDATE`, y Postgres necesita poder resolver
--  si ya existe una fila en conflicto — eso requiere que el rol
--  `authenticated` pueda "ver" el objeto existente bajo RLS. Sin política
--  de SELECT, esa resolución falla y Postgres rechaza la escritura aunque
--  las políticas de INSERT/UPDATE por sí solas sean correctas (confirmado
--  probando en vivo: sin `x-upsert`, la subida SÍ funcionaba).
-- ═══════════════════════════════════════════════════════════════════════

create policy logo_copropiedad_storage_select_agent
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'logo-copropiedad'
    and public.has_role((storage.foldername(name))[1]::uuid, array['agent']::public.tenant_role_t[])
  );
