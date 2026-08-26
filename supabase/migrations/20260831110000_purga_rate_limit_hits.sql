-- ═══════════════════════════════════════════════════════════════════════
--  M5 (auditoría externa 2026-08-26, Docs/evaluacion/01) — purga de
--  rate_limit_hits
--
--  20260814170000 sembró rate_limit_hits como ventana deslizante sin job de
--  purga — a diferencia de audit_log (20260814190000), que sí tiene una. La
--  ventana más larga en uso hoy entre las Edge Functions es '1 hour'
--  (verificado: todas usan RATE_LIMIT_VENTANA = '1 hour'); 24 horas de
--  retención da margen de sobra sin acumular filas indefinidamente y
--  degradar el count(*) por bucket con el tiempo.
--
--  A diferencia de purge_audit_log_antiguo(), no hace falta la danza del
--  flag de sesión (aquila.purge_context): rate_limit_hits no tiene trigger
--  forbid_mutation ni política RLS de escritura para ningún rol de cliente
--  (ver comentario de la tabla) — un SECURITY DEFINER simple ya bypassa
--  RLS, y no hay ningún guard bloqueando el DELETE aquí.
-- ═══════════════════════════════════════════════════════════════════════

create function public.purge_rate_limit_hits_antiguo()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.rate_limit_hits where created_at < now() - interval '24 hours';
end;
$$;

revoke execute on function public.purge_rate_limit_hits_antiguo() from public, anon, authenticated;

select cron.schedule(
  'purge-rate-limit-hits-24h',
  '15 3 * * *',
  $$select public.purge_rate_limit_hits_antiguo()$$
);

comment on function public.purge_rate_limit_hits_antiguo() is
  'Purga rate_limit_hits más viejo que 24h (M5, auditoría 2026-08-26) — ninguna ventana de '
  'rate limit en uso hoy supera 1 hora. Corre diario vía pg_cron, 03:15 UTC (justo después de '
  'purge-audit-log-24-meses, a las 03:00).';
