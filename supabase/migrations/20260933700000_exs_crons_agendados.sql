-- ═══════════════════════════════════════════════════════════════════════
--  EXS · Agendar los dos crons que la serie dejó escritos y sin llamar
--
--  EXS-3 y EXS-6 crearon sus funciones envoltorio siguiendo el patrón del
--  repositorio, pero ninguna quedó en `cron.job`. El efecto: la publicación
--  programada de un anuncio y la expiración de un aviso del marketplace
--  **no ocurrían nunca solas** — las dos funciones existían, eran correctas
--  e idempotentes, y nadie las invocaba. Era la deuda más visible de la
--  serie, y se cierra aquí.
--
--  LAS DOS FRECUENCIAS SON DISTINTAS, y no por capricho:
--
--  · anuncios — `fn_anuncio_publicar_programados` compara
--    `publicar_at <= now()`, un TIMESTAMP. Con un cron diario, un anuncio
--    programado para las 15:00 se publicaría a la mañana siguiente: quince
--    horas tarde, lo que vacía de sentido la palabra "programado". Va cada
--    15 minutos. El coste es un UPDATE sobre un índice parcial, 96 veces al
--    día, sobre una tabla que en una copropiedad tiene decenas de filas.
--
--  · marketplace — `fn_publicaciones_expirar` compara
--    `vigente_hasta < current_date`, una FECHA. Nada cambia dentro del día,
--    así que correrlo más de una vez sería trabajo inútil. Va diario.
--
--  Horario del diario: 05:00 UTC = medianoche en Colombia. Se elige así
--  para que el tablón ya esté limpio cuando alguien lo mire por la mañana,
--  y porque a esa hora no compite con los ocho jobs que el repositorio
--  concentra entre las 03:00 y las 12:00 UTC.
--
--  Ambas funciones son idempotentes y barren por fecha, no por tenant: una
--  sola pasada cubre todas las copropiedades y repetirla no duplica nada.
--  Por eso no hace falta iterar tenants como sí hace el cron de cartera.
-- ═══════════════════════════════════════════════════════════════════════

-- `cron.schedule` con un jobname que ya existe REEMPLAZA su definición, así
-- que esta migración es segura de re-aplicar y no duplica jobs.
select cron.schedule(
  'exs-anuncios-publicar-programados',
  '*/15 * * * *',
  $$select public.cron_anuncios_publicar_programados()$$
);

select cron.schedule(
  'exs-marketplace-expirar',
  '0 5 * * *',
  $$select public.cron_marketplace_expirar()$$
);

comment on function public.cron_anuncios_publicar_programados is
  'EXS-3 — publica los anuncios cuyo publicar_at ya pasó. Agendada en pg_cron como '
  '"exs-anuncios-publicar-programados", cada 15 minutos: publicar_at es un timestamp y un cron '
  'diario llegaría con horas de retraso a algo que el usuario pidió a una hora concreta.';

comment on function public.cron_marketplace_expirar is
  'EXS-6 — saca del tablón las publicaciones vencidas. Agendada en pg_cron como '
  '"exs-marketplace-expirar", diaria a las 05:00 UTC (medianoche en Colombia): vigente_hasta es '
  'una fecha, así que nada cambia dentro del día y correrlo más veces sería trabajo inútil.';
