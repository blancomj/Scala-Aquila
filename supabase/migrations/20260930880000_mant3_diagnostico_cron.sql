-- ═══════════════════════════════════════════════════════════════════════
--  MANT-3 · Planes de mantenimiento y motor de programación (7/7)
--
--  Ayuda de diagnóstico SOLO para la prueba estructural del corte ("la
--  corrida usa el scheduler existente; no hay uno nuevo", MANT_03 §5.11):
--  el esquema `cron` de pg_cron no está expuesto a PostgREST, así que el
--  test no puede hacer `select * from cron.job` directo. Sin grant a
--  authenticated/anon — solo la llama el cliente de pruebas con
--  service_role, igual que cualquier otra verificación de fixture.
-- ═══════════════════════════════════════════════════════════════════════

create function public.mant_diagnostico_cron_job_existe(p_jobname text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from cron.job where jobname = p_jobname)
$$;

revoke execute on function public.mant_diagnostico_cron_job_existe(text) from public, anon, authenticated;
grant execute on function public.mant_diagnostico_cron_job_existe(text) to service_role;

comment on function public.mant_diagnostico_cron_job_existe(text) is
  'Solo para tests/mantenimiento/planes-programacion.test.ts (prueba 11, MANT-3 §5) — confirma '
  'que la corrida usa un job de pg_cron real (jobname dado) en vez de un scheduler nuevo. Sin '
  'grant a authenticated/anon.';
