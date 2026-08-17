-- ═══════════════════════════════════════════════════════════════════════
--  Logo de la copropiedad — cierra el gap reseñado en Datos básicos
--  ("El logo se sube desde Storage — pendiente", PROMPT_FICHA_COPROPIEDAD.md
--  §1.2). Propietario: conversación de diseño de esta sesión.
--
--  A diferencia de documentos-inmueble/documentos-copropiedad, el logo:
--  1. No es información sensible — un bucket público con URL fija evita
--     tener que regenerar signed URLs cada vez que se pinta el <img>.
--  2. No necesita tabla de metadata ni versionado — es "el logo actual",
--     se sobreescribe (upsert) en una ruta fija por tenant.
--  Por eso NO sigue el patrón de subir-documento (Edge Function): la
--  escritura va directo por RLS de storage.objects, mismo criterio que el
--  resto de este store (copropiedad.ts) — sin Edge Function.
--
--  Ruta fija `{tenant_id}/logo` (sin extensión en el nombre del objeto —
--  el content-type ya lo declara Storage) para que un re-upload sea un
--  upsert real y nunca acumule logos viejos huérfanos.
-- ═══════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'logo-copropiedad',
  'logo-copropiedad',
  true,
  2097152, -- 2 MB — un logo no necesita más, y evita subidas pesadas por error.
  array['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']
)
on conflict (id) do nothing;

-- Público: sin política de SELECT — un bucket public=true sirve los
-- objetos por URL pública sin pasar por RLS (mismo comportamiento que
-- cualquier bucket público de Supabase Storage).
create policy logo_copropiedad_storage_insert_agent
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'logo-copropiedad'
    and public.has_role((storage.foldername(name))[1]::uuid, array['agent']::public.tenant_role_t[])
  );

create policy logo_copropiedad_storage_update_agent
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'logo-copropiedad'
    and public.has_role((storage.foldername(name))[1]::uuid, array['agent']::public.tenant_role_t[])
  )
  with check (
    bucket_id = 'logo-copropiedad'
    and public.has_role((storage.foldername(name))[1]::uuid, array['agent']::public.tenant_role_t[])
  );

create policy logo_copropiedad_storage_delete_agent
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'logo-copropiedad'
    and public.has_role((storage.foldername(name))[1]::uuid, array['agent']::public.tenant_role_t[])
  );

-- ── tenants.logo_path ───────────────────────────────────────────────────
alter table public.tenants add column logo_path text;

comment on column public.tenants.logo_path is
  'Ruta del objeto en el bucket público logo-copropiedad (p. ej. "{tenant_id}/logo"). '
  'NULL = sin logo. La URL pública se arma en el cliente con getPublicUrl, no se guarda '
  'la URL completa aquí (evita que un cambio de dominio de Storage la invalide).';
