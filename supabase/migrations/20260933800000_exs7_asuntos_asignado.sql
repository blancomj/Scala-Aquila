-- ═══════════════════════════════════════════════════════════════════════
--  EXS-7 · «Asignado a mí» — la bandeja distingue lo que es de alguien
--
--  `fn_mis_asuntos` filtra por quien PUEDE actuar, que es lo correcto para
--  saber qué te compete. Pero dentro de eso hay una diferencia que la
--  bandeja no mostraba: de las siete ramas, una —las solicitudes de
--  Atención— tiene dueño explícito (`solicitudes.asignado_a`, GOB-8), y en
--  una copropiedad con dos administradores eso es la diferencia entre "esto
--  lo lleva alguien" y "esto no lo lleva nadie".
--
--  Se añade UNA columna al resultado, `asignado_a`, nula en las seis ramas
--  que no tienen asignación. La nulidad no es una carencia que haya que
--  rellenar después: significa "esta clase de trabajo no se asigna a una
--  persona, le toca a quien pueda". Un anuncio pendiente lo aprueba
--  cualquier administrador, y repartirlo nominalmente sería inventar un
--  proceso que el dominio no tiene.
--
--  El filtrado por «mío / sin dueño / todo» se hace en la pantalla y no con
--  un parámetro más: el conjunto ya viene acotado a lo que puedes atender y
--  cabe entero en memoria (AD-24 — un tenant es UN edificio), así que
--  bajarlo a SQL solo añadiría una dimensión al plan sin ahorrar trabajo.
--
--  DROP + CREATE y no `create or replace`: cambia el tipo de retorno, y
--  Postgres no permite reemplazar una función cambiándolo. Ojo con lo de
--  siempre en este repositorio: hay que citar la firma exacta al borrar, o
--  queda un segundo overload y las llamadas se vuelven ambiguas.
-- ═══════════════════════════════════════════════════════════════════════

drop function if exists public.fn_mis_asuntos(uuid, integer);

create function public.fn_mis_asuntos(
  p_tenant_id         uuid,
  p_dias_anticipacion integer default 15
)
returns table (
  origen_modulo  text,
  origen_entidad text,
  origen_id      uuid,
  titulo         text,
  resumen        text,
  estado         text,
  accion         text,
  enlace         text,
  created_at     timestamptz,
  vence_at       timestamptz,
  asignado_a     uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_es_admin boolean;
  v_es_aux   boolean;
  v_limite   date := current_date + make_interval(days => greatest(p_dias_anticipacion, 0));
begin
  if not public.is_member(p_tenant_id) then
    raise exception 'ASUNTOS_NO_DISPONIBLES: no hay bandeja para esta copropiedad';
  end if;

  v_es_admin := public.has_role(p_tenant_id, array['administrador']::public.tenant_role_t[]);
  v_es_aux   := public.has_role(p_tenant_id, array['auxiliar']::public.tenant_role_t[]);

  return query

  -- ── Anuncios esperando aprobación ────────────────────────────────────
  -- Solo administrador: guard_anuncio_transicion no deja aprobar a nadie más.
  select
    'anuncios', 'anuncio', a.id,
    a.titulo,
    'Redactado y esperando aprobación',
    a.estado::text,
    'Revisar',
    '/anuncios/' || a.id::text,
    a.created_at,
    null::timestamptz,
    null::uuid
  from public.anuncios a
  where a.tenant_id = p_tenant_id
    and a.estado = 'pendiente_revision'
    and v_es_admin
    and public.puede_ver_modulo(p_tenant_id, 'anuncios')

  union all

  -- ── Publicaciones esperando aprobación ───────────────────────────────
  -- La escalera de EXS-6, tal cual: lo que originó un residente lo aprueba
  -- cualquiera del equipo; lo de un auxiliar, solo un administrador. Así la
  -- bandeja de un auxiliar no se llena de cosas que no puede aprobar.
  select
    'marketplace', 'publicacion', p.id,
    p.titulo,
    'Aviso esperando aprobación · ' || p.identidad_publica,
    p.estado::text,
    'Aprobar',
    '/marketplace?publicacion=' || p.id::text,
    p.created_at,
    null::timestamptz,
    null::uuid
  from public.publicaciones p
  where p.tenant_id = p_tenant_id
    and p.estado = 'pendiente_aprobacion'
    and (
      case when p.origen = 'residente' then (v_es_admin or v_es_aux)
           else v_es_admin
      end
    )
    and public.puede_ver_modulo(p_tenant_id, 'marketplace')

  union all

  -- ── Interesados sin atender ──────────────────────────────────────────
  -- El interés es el único canal de contacto del marketplace (EXS-6 §15):
  -- si nadie lo atiende, las dos partes se quedan esperando.
  select
    'marketplace', 'publicacion_interes', i.id,
    coalesce(i.interesado_nombre, 'Alguien') || ' preguntó por «' || p.titulo || '»',
    coalesce(i.mensaje, 'Sin mensaje'),
    'sin_atender',
    'Poner en contacto',
    '/marketplace?publicacion=' || p.id::text,
    i.created_at,
    null::timestamptz,
    null::uuid
  from public.publicacion_interes i
  join public.publicaciones p on p.id = i.publicacion_id
  where i.tenant_id = p_tenant_id
    and not i.atendido
    and (v_es_admin or v_es_aux)
    and public.puede_ver_modulo(p_tenant_id, 'marketplace')

  union all

  -- ── Reportes sin resolver ────────────────────────────────────────────
  -- Solo administrador: resolver un reporte es un acto de moderación.
  select
    'marketplace', 'publicacion_reporte', r.id,
    'Reporte sobre «' || p.titulo || '»',
    lt.nombre || coalesce(' · ' || r.descripcion, ''),
    'sin_resolver',
    'Moderar',
    '/marketplace?publicacion=' || p.id::text,
    r.created_at,
    null::timestamptz,
    null::uuid
  from public.publicacion_reporte r
  join public.publicaciones p on p.id = r.publicacion_id
  join public.lista_tipos lt on lt.id = r.motivo_id
  where r.tenant_id = p_tenant_id
    and not r.resuelto
    and v_es_admin
    and public.puede_ver_modulo(p_tenant_id, 'marketplace')

  union all

  -- ── Permisos vehiculares por vencer ──────────────────────────────────
  -- Renovarlos exige administrador. Se incluyen los ya vencidos: un permiso
  -- caducado hace tres días sigue siendo trabajo por hacer, y ordenado por
  -- fecha aparece el primero.
  select
    'movilidad', 'vehiculo_permiso', vp.id,
    'Permiso de ' || v.placa || ' vence el ' || to_char(vp.vigente_hasta, 'DD/MM/YYYY'),
    lt.nombre || ' · ' || coalesce(v.marca || ' ' || v.modelo, v.placa),
    vp.estado::text,
    'Renovar',
    '/movilidad?vehiculo=' || v.id::text,
    vp.created_at,
    vp.vigente_hasta::timestamptz,
    null::uuid
  from public.vehiculo_permiso vp
  join public.vehiculos v on v.id = vp.vehiculo_id
  join public.lista_tipos lt on lt.id = vp.tipo_id
  where vp.tenant_id = p_tenant_id
    and vp.estado = 'vigente'
    and vp.vigente_hasta is not null
    and vp.vigente_hasta <= v_limite
    and v.estado <> 'retirado'
    and v_es_admin
    and public.puede_ver_modulo(p_tenant_id, 'movilidad')

  union all

  -- ── Publicaciones por expirar ────────────────────────────────────────
  -- Aviso ANTES de que el barrido las saque del tablón, para que a quien
  -- publicó le dé tiempo de renovar o cerrar.
  select
    'marketplace', 'publicacion', p.id,
    '«' || p.titulo || '» sale del tablón el ' || to_char(p.vigente_hasta, 'DD/MM/YYYY'),
    'Renovar la vigencia o cerrar el aviso',
    p.estado::text,
    'Renovar o cerrar',
    '/marketplace?publicacion=' || p.id::text,
    p.created_at,
    p.vigente_hasta::timestamptz,
    null::uuid
  from public.publicaciones p
  where p.tenant_id = p_tenant_id
    and p.estado = 'publicada'
    and p.vigente_hasta is not null
    and p.vigente_hasta <= v_limite
    and (v_es_admin or v_es_aux)
    and public.puede_ver_modulo(p_tenant_id, 'marketplace')

  union all

  -- ── Solicitudes de Atención sin cerrar ───────────────────────────────
  -- `solicitudes` no se rige por puede_ver_modulo: su policy es is_member a
  -- secas (GOB-8), así que aquí tampoco se inventa un gate que la tabla no
  -- tiene. `sla_vence_at` entra como fecha límite: es la única fuente del
  -- corte que ya traía su propio reloj.
  --
  -- La ÚNICA rama con dueño: GOB-8 asigna la solicitud a una persona.
  select
    'atencion', 'solicitud', s.id,
    s.asunto,
    'Solicitud ' || s.anio::text || '-' || lpad(s.numero::text, 4, '0'),
    s.estado::text,
    'Atender',
    '/atencion/' || s.id::text,
    s.created_at,
    s.sla_vence_at,
    s.asignado_a
  from public.solicitudes s
  where s.tenant_id = p_tenant_id
    and s.estado in ('nueva', 'asignada', 'en_atencion', 'en_espera')

  -- Lo que tiene fecha va primero, y antes lo que vence antes: es el orden
  -- en que conviene atenderlo. Lo que no tiene plazo se ordena por
  -- antigüedad, para que lo que lleva más tiempo parado no quede sepultado.
  -- Las posiciones siguen siendo 10 y 9: `asignado_a` se añadió al final
  -- justamente para no tocar este orden.
  order by 10 asc nulls last, 9 asc;
end;
$$;

comment on function public.fn_mis_asuntos is
  'EXS-7 — bandeja de trabajo del miembro. AGREGACIÓN pura: no existe tabla `mis_asuntos` ni '
  'triggers que la sincronicen (prompt 06 §11). El asunto se deriva del estado vivo de cada '
  'dominio, así que resolver el trabajo lo saca de la bandeja por sí solo. NO lee `notificaciones`: '
  'asunto y notificación son cosas distintas (§13) — leer un aviso no es haber hecho el trabajo. '
  'Cada rama filtra por quien puede ACTUAR, no por quien puede mirar: un anuncio pendiente no es '
  'asunto de un auxiliar que no puede aprobarlo. `asignado_a` (20260933800000) solo lo trae la rama '
  'de Atención, la única cuyo dominio asigna dueño; en las demás es null y eso SIGNIFICA algo: ese '
  'trabajo le toca a quien pueda, no a una persona concreta.';

revoke execute on function public.fn_mis_asuntos(uuid, integer) from public, anon;
grant execute on function public.fn_mis_asuntos(uuid, integer) to authenticated, service_role;
