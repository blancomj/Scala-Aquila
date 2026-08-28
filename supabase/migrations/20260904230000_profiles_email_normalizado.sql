-- ─────────────────────────────────────────────────────────────────────
--  profiles.email sin normalizar rompía accept_invitation() con falsos
--  negativos.
--
--  invite_user() (20260814140000) guarda invitations.email siempre como
--  lower(btrim(p_email)); handle_new_user() (20260813190400) copiaba
--  profiles.email tal cual llegaba de auth.users.email, sin btrim(). Ambas
--  columnas son citext (mayúsculas no importan), pero citext NO recorta
--  espacios: un correo pegado con un espacio invisible al registrarse
--  producía un profiles.email distinto del invitations.email aunque a
--  simple vista fueran "el mismo correo" — accept_invitation() lo rechaza
--  con INV_EMAIL_MISMATCH. Verificado en vivo contra la base de
--  desarrollo: 'test@x.com '::citext = 'test@x.com'::citext → false.
--
--  guard_privileged_columns (20260813190400) bloquea que el propio usuario
--  modifique profiles.email después de creado ("espejo de auth.users") —
--  handle_new_user() es el ÚNICO lugar donde se escribe, así que basta con
--  normalizarlo ahí para toda cuenta nueva en adelante.
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    lower(btrim(new.email)),
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
  );

  insert into public.audit_log (actor_id, action, entity_type, entity_id)
  values (new.id, 'auth.signup', 'profile', new.id);

  return new;
end;
$$;
