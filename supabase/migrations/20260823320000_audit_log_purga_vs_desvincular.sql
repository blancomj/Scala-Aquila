-- ═══════════════════════════════════════════════════════════════════════
--  Fix real: forbid_mutation_audit_log() rompió la purga programada de 24
--  meses (regresión, encontrada al correr la suite completa por primera
--  vez en esta sesión — tests/rls/audit-log-purge.test.ts).
--
--  20260814190000_purga_audit_log.sql le dio al forbid_mutation() ORIGINAL
--  una excepción estrecha para DELETE: purge_audit_log_antiguo() marca un
--  flag de sesión (aquila.purge_context) antes de borrar, y el trigger
--  solo dejaba pasar el DELETE con ese flag exacto presente. Cuando
--  20260823240000/20260823260000 reemplazaron el trigger de audit_log por
--  forbid_mutation_audit_log() (para permitir la nulificación de
--  tenant_id/actor_id que las FKs de cascada disparan), esa función nueva
--  NUNCA reprodujo la excepción de DELETE — se perdió sin que ningún test
--  la hubiera cubierto hasta ahora. Resultado real: pg_cron seguía
--  llamando purge_audit_log_antiguo() cada noche, pero cada DELETE fallaba
--  silenciosamente (el job de pg_cron no alerta por sí solo) — audit_log
--  dejó de purgarse por completo desde 20260823240000.
--
--  Fix: forbid_mutation_audit_log() recupera la excepción de DELETE
--  (idéntica condición: tg_op='DELETE' y el flag de sesión), además de
--  las dos nulificaciones de UPDATE que ya tenía. UPDATE fuera de esas dos
--  formas exactas, y cualquier DELETE sin el flag, siguen rechazados.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.forbid_mutation_audit_log()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and current_setting('aquila.purge_context', true) = 'true' then
    return old;
  end if;

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
  'SEC-14 append-only para audit_log, con TRES excepciones: (1) el DELETE que dispara '
  'purge_audit_log_antiguo() (§11.3, flag de sesión aquila.purge_context — recuperada aquí tras '
  'perderse en 20260823240000); (2)/(3) los UPDATE que disparan audit_log_tenant_id_fkey y '
  'audit_log_actor_id_fkey (ambos on delete set null) — nulifican EXCLUSIVAMENTE su propia '
  'columna. Cualquier otro UPDATE, o cualquier DELETE sin el flag de purga, sigue rechazado.';
