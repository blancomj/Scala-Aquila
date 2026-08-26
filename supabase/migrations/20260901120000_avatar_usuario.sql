-- ═══════════════════════════════════════════════════════════════════════
--  Avatar de usuario — "Mi perfil" (menú de usuario, 2026-08-26)
--
--  Mismo criterio exacto que logo-copropiedad (20260822180000): bucket
--  público (no es información sensible), sin tabla de metadata ni
--  versionado, ruta fija por dueño para que un re-upload sea upsert real.
--  Aquí la carpeta es `{user_id}` en vez de `{tenant_id}` — un avatar es
--  de la cuenta, no de una copropiedad — y la política compara contra
--  auth.uid() en vez de has_role(): cualquier usuario autenticado sube
--  SOLO a su propia carpeta, no hay rol de tenant que verificar.
--
--  profiles.avatar_url ya existía (20260813190100) — este archivo no la
--  toca, solo agrega el bucket que la alimenta.
-- ═══════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatares',
  'avatares',
  true,
  2097152, -- 2 MB, mismo tope que logo-copropiedad.
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

-- Público: sin política de SELECT — mismo comportamiento que logo-copropiedad.
create policy avatares_storage_insert_propio
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy avatares_storage_update_propio
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy avatares_storage_delete_propio
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
