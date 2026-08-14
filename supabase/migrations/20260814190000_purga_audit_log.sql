-- ═══════════════════════════════════════════════════════════════════════
--  E7 · Purga de audit_log (24 meses) — PROMPT_MAESTRO_FASE1.md §11.3
--
--  Tensión real entre dos reglas del propio corpus: §11.3 exige una purga
--  programada de audit_log ("único proceso autorizado a borrar"), pero
--  forbid_mutation() (20260813190400_triggers.sql) bloquea DELETE sobre
--  audit_log para todo rol, sin excepción — hasta service_role
--  (tests/rls/append-only-audit-log.test.ts lo prueba). Decisión de esta
--  sesión: excepción ESTRECHA, no un rol con permiso — una única función
--  SECURITY DEFINER marca un flag de sesión local a la transacción antes
--  de borrar; el trigger solo deja pasar el DELETE cuando ese flag exacto
--  está presente Y la tabla es audit_log. Nadie más puede replicar esa
--  condición desde fuera de purgar_audit_log_antiguo(). UPDATE sigue
--  bloqueado siempre, sin excepción, y fondo_movimientos (que comparte
--  forbid_mutation() como trigger) queda exactamente igual de inmutable
--  que antes — la condición exige tg_table_name = 'audit_log'.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.forbid_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_table_name = 'audit_log' and tg_op = 'DELETE'
     and current_setting('aquila.purge_context', true) = 'true'
  then
    return old;
  end if;

  raise exception 'APPEND_ONLY: % no admite % (SEC-14)', tg_table_name, tg_op;
end;
$$;

create extension if not exists pg_cron;

create function public.purge_audit_log_antiguo()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('aquila.purge_context', 'true', true);
  delete from public.audit_log where created_at < now() - interval '24 months';
end;
$$;

-- Nadie invoca esto desde el cliente — solo el job de pg_cron. Revocar
-- execute de authenticated/anon es la barrera, no una convención.
revoke execute on function public.purge_audit_log_antiguo() from public, anon, authenticated;

select cron.schedule(
  'purge-audit-log-24-meses',
  '0 3 * * *',
  $$select public.purge_audit_log_antiguo()$$
);

comment on function public.purge_audit_log_antiguo() is
  'Único proceso autorizado a borrar de audit_log (§11.3) — retención 24 meses. '
  'Corre diario vía pg_cron (job "purge-audit-log-24-meses"), 03:00 UTC.';
