-- ═══════════════════════════════════════════════════════════════════════
--  MANT-3 · Planes de mantenimiento y motor de programación (6/6)
--  Casos de uso/Tres Modulos/Mantenimiento/MANT_03_planes_programacion.md §3.3
--
--  Corre sobre pg_cron (ya habilitado desde 20260814190000) — no crea un
--  scheduler nuevo. A diferencia de cartera_recalcular_diario (que despacha
--  a un Edge Function vía net.http_post porque su lógica de negocio vive en
--  Deno), generar programaciones es una operación 100% de base de datos:
--  el cron dispara directo una función plpgsql, sin salto de red de por
--  medio. Por eso no hay tabla de bitácora nueva — el historial de
--  corridas ya lo da cron.job_run_details, y la corrección de cada corrida
--  la garantiza el índice único de mant_programaciones, no una bitácora
--  aparte (evita inventar seguimiento que el corte no pide).
-- ═══════════════════════════════════════════════════════════════════════

create function public.cron_mant_generar_programaciones_diario()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan record;
  v_procesados int := 0;
begin
  for v_plan in
    select p.id
    from public.mant_planes p
    join public.tenants t on t.id = p.tenant_id
    where p.activo and t.status = 'active'
      and (p.vigente_hasta is null or p.vigente_hasta >= current_date)
    order by p.tenant_id, p.id
  loop
    -- Un plan a la vez: si uno falla (datos a medias), los demás siguen —
    -- mismo criterio que cron_cartera_recalcular_diario.
    begin
      perform public.fn_mant_generar_programaciones(v_plan.id);
      v_procesados := v_procesados + 1;
    exception when others then
      raise warning 'MANT_CRON_PLAN_FALLIDO: plan % — %', v_plan.id, sqlerrm;
    end;
  end loop;

  raise notice 'MANT_CRON: % planes procesados', v_procesados;
end;
$$;

revoke execute on function public.cron_mant_generar_programaciones_diario() from public, anon, authenticated;

comment on function public.cron_mant_generar_programaciones_diario() is
  'MANT-3 §3.3 — dispara fn_mant_generar_programaciones para cada plan activo de cada tenant '
  'activo. Corre vía pg_cron (job "mant-generar-programaciones-diario"). Un plan fallido no '
  'detiene a los demás (raise warning, no exception).';

select cron.schedule(
  'mant-generar-programaciones-diario',
  '0 7 * * *',
  $$select public.cron_mant_generar_programaciones_diario()$$
);
