-- ═══════════════════════════════════════════════════════════════════════
--  RPT-05 (6/n) · El reloj: qué toca ahora y quién lo dispara
--
--  REPARTO DE TAREAS
--  ─────────────────
--  · `fn_reporte_programaciones_debidas()` — SQL: qué programaciones
--    vencieron. Una comparación por índice, sin resolver calendarios.
--  · `fn_reporte_programacion_registrar_corrida()` — SQL: deja constancia
--    de que corrió y deja que el disparador recalcule la siguiente.
--  · `cron_reportes_programados()` — SQL: una sola petición HTTP al
--    despachador. El fan-out por copropiedad lo hace la Edge Function, que
--    es quien puede armar el archivo y hablar con el proveedor de correo.
--
--  Es el mismo reparto que `cron_cartera_recalcular_diario` (20260906170000):
--  la base decide QUÉ, y Deno hace lo que la base no puede hacer.
--
--  CADA 15 MINUTOS, NO UNA VEZ AL DÍA
--  ──────────────────────────────────
--  Una programación tiene HORA. Con un cron diario, un informe pedido para
--  las 15:00 saldría a la mañana siguiente — quince horas tarde, que es
--  tanto como no estar programado. Mismo razonamiento y misma cadencia que
--  `exs-anuncios-publicar-programados` (20260933700000). El coste es una
--  consulta por índice parcial 96 veces al día sobre una tabla que en una
--  copropiedad tiene unidades de filas.
--
--  SIN SECRETOS EN VAULT NO SE DISPARA NADA, y se dice por qué. Un cron que
--  falla en silencio es peor que uno que no existe.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Solo los formatos que el servidor sabe producir ────────────────────
-- El renderer de servidor (RPT-05) arma XLSX y CSV a partir de
-- `@aquila/reporting`, que es TypeScript puro. El PDF NO entra: en este
-- repo los PDF de servidor se hacen con PDFShift a partir de HTML
-- (estados de cuenta, 20260822100000), que es otro camino entero y otra
-- decisión de coste. Dejar 'pdf' aquí permitiría agendar algo que fallaría
-- cada vez, y una programación que siempre falla es peor que una que no se
-- puede crear.
alter table public.reporte_programaciones
  drop constraint reporte_programaciones_formato_valido;

alter table public.reporte_programaciones
  add constraint reporte_programaciones_formato_valido
  check (formato in ('xlsx', 'csv'));

comment on constraint reporte_programaciones_formato_valido on public.reporte_programaciones is
  'Solo lo que el renderer de servidor sabe producir hoy. El PDF programado exigiría el camino de '
  'PDFShift que usan los estados de cuenta; se deja fuera a propósito en vez de admitir una '
  'programación que fallaría siempre.';

-- ── Qué toca ahora ─────────────────────────────────────────────────────
create function public.fn_reporte_programaciones_debidas(p_limite int default 50)
returns table (
  id              uuid,
  tenant_id       uuid,
  reporte_id      uuid,
  nombre          text,
  formato         text,
  parametros      jsonb,
  zona_horaria    text,
  proxima_at      timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select p.id, p.tenant_id, p.reporte_id, p.nombre, p.formato, p.parametros,
         p.zona_horaria, p.proxima_at
    from public.reporte_programaciones p
   where p.activa
     and p.proxima_at is not null
     and p.proxima_at <= now()
   order by p.proxima_at
   limit least(greatest(p_limite, 1), 200);
$$;

comment on function public.fn_reporte_programaciones_debidas(int) is
  'RPT-05 — programaciones activas cuya hora ya pasó. SECURITY DEFINER y sin grant para '
  'authenticated: la llama el despachador con service_role. El tope acotado evita que un backlog '
  'convierta una corrida en un maratón.';

revoke execute on function public.fn_reporte_programaciones_debidas(int) from public, anon, authenticated;

-- ── Dejar constancia de que corrió ─────────────────────────────────────
create function public.fn_reporte_programacion_registrar_corrida(
  p_programacion_id uuid,
  p_corrida_at      timestamptz default now()
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proxima timestamptz;
begin
  -- Solo se escribe `ultima_at`: `proxima_at` lo recalcula el disparador
  -- de 20260941030000 a partir de ella. Calcularlo aquí también sería la
  -- misma regla en dos sitios, lista para divergir.
  update public.reporte_programaciones
     set ultima_at = p_corrida_at
   where id = p_programacion_id
  returning proxima_at into v_proxima;

  if not found then
    raise exception 'RPT_PROGRAMACION_NO_ENCONTRADA: no existe la programación %', p_programacion_id;
  end if;

  return v_proxima;
end;
$$;

comment on function public.fn_reporte_programacion_registrar_corrida(uuid, timestamptz) is
  'RPT-05 — marca una programación como corrida y devuelve su siguiente instante, que recalcula '
  'el disparador. Se llama SIEMPRE, con éxito o con fallo: si no, una programación que falla se '
  'reintentaría cada 15 minutos para siempre.';

revoke execute on function public.fn_reporte_programacion_registrar_corrida(uuid, timestamptz)
  from public, anon, authenticated;

-- ── El disparo ─────────────────────────────────────────────────────────
create function public.cron_reportes_programados()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url        text;
  v_secreto    text;
  v_pendientes int;
  v_request_id bigint;
begin
  -- Si no hay nada que hacer, ni se abre una conexión. A las 96 pasadas
  -- diarias, la inmensa mayoría no tienen trabajo.
  select count(*) into v_pendientes
    from public.reporte_programaciones
   where activa and proxima_at is not null and proxima_at <= now();

  if v_pendientes = 0 then
    return;
  end if;

  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'reportes_cron_supabase_url';
  select decrypted_secret into v_secreto
    from vault.decrypted_secrets where name = 'reportes_cron_secret';

  if v_url is null or v_secreto is null then
    raise warning 'RPT5_CRON_SIN_CONFIGURAR: faltan reportes_cron_supabase_url / '
      'reportes_cron_secret en Vault. Hay % programación(es) vencida(s) sin despachar.', v_pendientes;
    return;
  end if;

  select net.http_post(
    url := v_url || '/functions/v1/enviar-reportes-programados',
    body := '{}'::jsonb,
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- Mismo mecanismo que enviar-estados-cuenta-pendientes: secreto
      -- compartido en cabecera, no JWT — no hay persona detrás.
      'x-cron-secret', v_secreto
    ),
    -- Armar y enviar varios reportes puede tardar; el despachador acota
    -- cuántos atiende por corrida.
    timeout_milliseconds := 600000
  ) into v_request_id;

  raise notice 'RPT5_CRON: % pendiente(s), despachador invocado (request_id %)',
    v_pendientes, v_request_id;
end;
$$;

revoke execute on function public.cron_reportes_programados() from public, anon, authenticated;

comment on function public.cron_reportes_programados() is
  'RPT-05 — invoca enviar-reportes-programados si hay programaciones vencidas. Una sola petición: '
  'el fan-out por copropiedad lo hace la Edge Function, que es quien puede armar el archivo y '
  'hablar con el proveedor de correo. Agendada como "reportes-programados" cada 15 minutos, '
  'porque una programación tiene hora y un cron diario llegaría con horas de retraso.';

-- `cron.schedule` con un jobname existente reemplaza su definición: esta
-- migración es segura de re-aplicar y no duplica jobs.
select cron.schedule(
  'reportes-programados',
  '*/15 * * * *',
  $$select public.cron_reportes_programados()$$
);
