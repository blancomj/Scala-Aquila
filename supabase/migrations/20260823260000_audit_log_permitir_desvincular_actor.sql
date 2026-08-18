-- ═══════════════════════════════════════════════════════════════════════
--  E8 (limpieza de tenants de prueba) · Fix real: borrar un auth.users
--  con actividad en audit_log.actor_id era imposible — mismo bug que
--  20260823240000 (tenant_id), columna que se me pasó en ese momento.
--
--  audit_log.actor_id references profiles(id) on delete set null — al
--  borrar un auth.users, profiles.id (on delete cascade) se borra en
--  cascada, y esa cascada dispara el mismo tipo de UPDATE (poner
--  actor_id a NULL) que forbid_mutation_audit_log() solo contemplaba
--  para tenant_id. Confirmado en vivo al reintentar
--  admin.auth.admin.deleteUser() sobre un usuario de prueba huérfano:
--  la API devolvía únicamente "Database error deleting user" (500,
--  AuthRetryableFetchError) sin detalle; un DELETE FROM auth.users
--  directo en una transacción de prueba (con rollback) sí expuso el
--  error real de Postgres:
--    ERROR: P0001: APPEND_ONLY: audit_log no admite UPDATE (SEC-14)
--
--  Fix: generalizar forbid_mutation_audit_log() para dejar pasar
--  CUALQUIERA de las dos nulificaciones que las FKs de audit_log pueden
--  disparar (tenant_id o actor_id, nunca ambas a la vez porque cada FK
--  solo toca su propia columna), sin tocar ninguna otra columna. Sigue
--  sin admitir ningún otro UPDATE ni ningún DELETE.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.forbid_mutation_audit_log()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and new.id = old.id
     and new.action = old.action
     and new.entity_type is not distinct from old.entity_type
     and new.entity_id is not distinct from old.entity_id
     and new.metadata = old.metadata
     and new.ip is not distinct from old.ip
     and new.user_agent is not distinct from old.user_agent
     and new.created_at = old.created_at
     and (
       (new.tenant_id is null and old.tenant_id is not null
          and new.actor_id is not distinct from old.actor_id)
       or
       (new.actor_id is null and old.actor_id is not null
          and new.tenant_id is not distinct from old.tenant_id)
     )
  then
    return new;
  end if;

  raise exception 'APPEND_ONLY: % no admite % (SEC-14)', tg_table_name, tg_op;
end;
$$;

comment on function public.forbid_mutation_audit_log() is
  'SEC-14 append-only para audit_log, con DOS excepciones: deja pasar el UPDATE que dispara '
  'audit_log_tenant_id_fkey (on delete set null, al borrar un tenant) o audit_log_actor_id_fkey '
  '(on delete set null, al borrar un profiles/auth.users) — cada una nulifica EXCLUSIVAMENTE su '
  'propia columna, sin tocar nada más. Sin la segunda excepción (añadida en 20260823260000), '
  'ningún auth.users con actividad en audit_log podía borrarse. Cualquier otro UPDATE, o '
  'cualquier DELETE, sigue rechazado igual que con forbid_mutation().';
