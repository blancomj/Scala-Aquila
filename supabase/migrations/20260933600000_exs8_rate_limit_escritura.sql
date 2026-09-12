-- ═══════════════════════════════════════════════════════════════════════
--  EXS-8 · Hardening (1/2) — rate limiting donde faltaba
--  Casos de uso/Experiencia y servicios/EXS_08_INFORME.md
--
--  HALLAZGO DE LA AUDITORÍA. El prompt 05 §20 exige límites a la creación
--  de publicaciones, reportes, intereses y uploads, y dice «reutilizar el
--  mecanismo existente». El mecanismo existe —`check_rate_limit`, GAP-12—
--  pero solo lo llamaban las Edge Functions, desde `_shared/rate_limit.ts`.
--
--  Las escrituras de EXS-6 no pasan por ninguna Edge Function: van por
--  PostgREST directo contra la tabla, con su RLS. Así que estaban sin
--  límite: un miembro con sesión válida podía crear diez mil publicaciones
--  en un bucle. La RLS impide escribir donde no debes, no escribir
--  demasiado — son cosas distintas y hacen falta las dos.
--
--  Los uploads SÍ estaban cubiertos: `subir-documento` ya llamaba a
--  enforceRateLimit (20/hora), así que las fotos de EXS-6 heredaron el
--  límite sin saberlo.
-- ═══════════════════════════════════════════════════════════════════════

create function public.guard_rate_limit_escritura()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_bucket text := tg_argv[0];
  v_max    int  := tg_argv[1]::int;
begin
  -- Fuera de banda no se limita: sin auth.uid() estamos en service_role,
  -- un cron o una carga de fixtures, y ponerle un techo a eso rompería
  -- importaciones legítimas sin frenar a ningún abusador real. Mismo
  -- criterio que el resto de la serie.
  if v_actor is null then
    return new;
  end if;

  -- El bucket lleva el uid: el límite es POR PERSONA, no global. Uno global
  -- dejaría que un solo usuario ruidoso bloqueara a toda la copropiedad.
  if not public.check_rate_limit(v_bucket || ':' || v_actor::text, v_max, interval '1 hour') then
    raise exception 'RATE_LIMIT_EXCEDIDO: demasiadas escrituras seguidas en %; espera un momento',
      tg_table_name;
  end if;

  return new;
end;
$$;

comment on function public.guard_rate_limit_escritura is
  'EXS-8 — techo de escrituras por hora y por persona sobre tablas que se escriben por PostgREST '
  'directo, sin Edge Function que pudiera llamar a enforceRateLimit. Reutiliza check_rate_limit '
  '(GAP-12) en vez de inventar un segundo mecanismo. Bucket y máximo vienen en tg_argv, para que '
  'una sola función sirva a todas las tablas (mismo patrón que '
  'forbid_mutation_salvo_tenant_borrado). No limita fuera de banda: sin auth.uid() no hay persona '
  'a quien limitar, y frenar ahí rompería cargas legítimas.';

revoke execute on function public.guard_rate_limit_escritura() from public, authenticated, anon;

-- Los techos son holgados a propósito: no buscan moldear el uso normal
-- —nadie publica 20 avisos en una hora a mano— sino cortar el bucle.
create trigger publicaciones_rate_limit
  before insert on public.publicaciones
  for each row execute function public.guard_rate_limit_escritura('mkt_publicacion', '20');

create trigger publicacion_interes_rate_limit
  before insert on public.publicacion_interes
  for each row execute function public.guard_rate_limit_escritura('mkt_interes', '40');

-- El reporte es el más bajo de los tres: reportar es barato y es justo la
-- palanca de quien quiere hostigar una publicación ajena a base de avisos.
create trigger publicacion_reporte_rate_limit
  before insert on public.publicacion_reporte
  for each row execute function public.guard_rate_limit_escritura('mkt_reporte', '10');

create trigger vehiculos_rate_limit
  before insert on public.vehiculos
  for each row execute function public.guard_rate_limit_escritura('movilidad_vehiculo', '40');

-- ── Orden de disparo ──────────────────────────────────────────────────
--
--  Postgres dispara los triggers BEFORE del mismo evento por orden
--  alfabético de nombre. Conviene saber cuál manda en cada tabla:
--
--   · publicaciones: 'publicaciones_guard' < 'publicaciones_rate_limit',
--     así que primero se valida el dominio y luego el techo. Es el orden
--     deseable: un payload inválido debe fallar por inválido, no gastar
--     una unidad del cupo horario de quien se equivocó de categoría.
--   · publicacion_interes / publicacion_reporte: sus guards se llaman
--     'publicacion_interes_guard' y 'publicacion_reporte_guard', que
--     también preceden alfabéticamente a '..._rate_limit'. Mismo orden.
--   · vehiculos no tiene guard propio, así que no hay nada que ordenar.
--
--  Se deja escrito porque es una dependencia frágil —renombrar un trigger
--  cambiaría el orden en silencio— y porque el efecto es sutil: no cambia
--  qué se rechaza, sino con qué mensaje y a costa de quién.
