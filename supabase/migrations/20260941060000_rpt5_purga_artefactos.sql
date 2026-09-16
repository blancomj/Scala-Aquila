-- ═══════════════════════════════════════════════════════════════════════
--  RPT-05 (7/n) · Barrido de retención: el archivo caduca, el rastro no
--  (PLAN_MOTOR_REPORTES.md §6 — "retención (expira_at); el historial
--   sobrevive al archivo expirado")
--
--  POR QUÉ ESTO NO SE PUEDE HACER SOLO EN SQL
--  ──────────────────────────────────────────
--  Borrar la fila de `storage.objects` con un DELETE no borra el archivo:
--  Storage guarda el binario fuera de la base y solo su API sabe dónde. Un
--  barrido «en SQL» dejaría la copropiedad creyendo que purgó, con los
--  archivos intactos en disco — que es peor que no purgar, porque además
--  mentiría. Por eso la base decide QUÉ purgar y una Edge Function con
--  service_role lo ejecuta, igual que el reparto del despachador.
--
--  LA FILA SOBREVIVE AL ARCHIVO
--  ────────────────────────────
--  No se borra `reporte_artefactos`: se marca `purgado_at`. Así el historial
--  de RPT-04 puede decir «esta corrida produjo un XLSX de 33 KB que expiró el
--  16 de octubre» en vez de fingir que nunca hubo archivo. Y `reporte_ejecuciones`,
--  que es la bitácora de verdad, no se toca nunca.
--
--  Diario a las 06:00 UTC (1:00 a. m. en Colombia): la retención se mide en
--  días, así que barrer más de una vez al día sería trabajo inútil, y a esa
--  hora no compite con los ocho trabajos que el repositorio concentra entre
--  las 03:00 y las 12:00 UTC.
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_reporte_artefactos_vencidos(p_limite int default 100)
returns table (
  id           uuid,
  tenant_id    uuid,
  storage_path text,
  expira_at    timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select a.id, a.tenant_id, a.storage_path, a.expira_at
    from public.reporte_artefactos a
   where a.purgado_at is null
     and a.expira_at <= now()
   order by a.expira_at
   limit least(greatest(p_limite, 1), 500);
$$;

comment on function public.fn_reporte_artefactos_vencidos(int) is
  'RPT-05 — artefactos cuya retención venció y todavía tienen archivo. Usa el índice parcial '
  'reporte_artefactos_purga_idx. Sin grant para authenticated: la llama el barrido con service_role.';

revoke execute on function public.fn_reporte_artefactos_vencidos(int) from public, anon, authenticated;

create function public.fn_reporte_artefacto_marcar_purgado(p_artefacto_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Idempotente: si ya estaba marcado no se mueve la fecha. Un barrido que
  -- se repite —porque la petición se reintentó— no debe reescribir cuándo
  -- desapareció el archivo.
  update public.reporte_artefactos
     set purgado_at = now()
   where id = p_artefacto_id
     and purgado_at is null;
end;
$$;

comment on function public.fn_reporte_artefacto_marcar_purgado(uuid) is
  'RPT-05 — deja constancia de que el archivo se borró por retención vencida. La fila NO se borra: '
  'el historial tiene que poder decir que hubo un archivo y expiró. Idempotente.';

revoke execute on function public.fn_reporte_artefacto_marcar_purgado(uuid) from public, anon, authenticated;

-- ── El disparo diario ──────────────────────────────────────────────────
create function public.cron_reportes_purgar_artefactos()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url        text;
  v_secreto    text;
  v_vencidos   int;
  v_request_id bigint;
begin
  select count(*) into v_vencidos
    from public.reporte_artefactos
   where purgado_at is null and expira_at <= now();

  if v_vencidos = 0 then
    return;
  end if;

  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'reportes_cron_supabase_url';
  select decrypted_secret into v_secreto
    from vault.decrypted_secrets where name = 'reportes_cron_secret';

  if v_url is null or v_secreto is null then
    raise warning 'RPT5_PURGA_SIN_CONFIGURAR: faltan reportes_cron_supabase_url / '
      'reportes_cron_secret en Vault. Hay % artefacto(s) vencido(s) sin purgar.', v_vencidos;
    return;
  end if;

  select net.http_post(
    url := v_url || '/functions/v1/purgar-artefactos-reportes',
    body := '{}'::jsonb,
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', v_secreto
    ),
    timeout_milliseconds := 300000
  ) into v_request_id;

  raise notice 'RPT5_PURGA: % vencido(s), barrido invocado (request_id %)', v_vencidos, v_request_id;
end;
$$;

revoke execute on function public.cron_reportes_purgar_artefactos() from public, anon, authenticated;

comment on function public.cron_reportes_purgar_artefactos() is
  'RPT-05 — invoca purgar-artefactos-reportes si hay retenciones vencidas. Comparte los secretos '
  'de Vault con el despachador: son el mismo proyecto y el mismo secreto de cron. Agendado como '
  '"reportes-purgar-artefactos", diario a las 06:00 UTC — la retención se mide en días.';

select cron.schedule(
  'reportes-purgar-artefactos',
  '0 6 * * *',
  $$select public.cron_reportes_purgar_artefactos()$$
);
