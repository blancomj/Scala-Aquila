-- ═══════════════════════════════════════════════════════════════════════
--  EXS-3 · Anuncios (4/5) — audiencia, publicación programada y métricas
-- ═══════════════════════════════════════════════════════════════════════

-- ── Resolver la audiencia ──────────────────────────────────────────────
--
--  Reutiliza gobierno_segmento_destinatarios (GOB-9) entera: es la función
--  que el diagnóstico encontró ya construida cuando el prompt 02 §13 pedía
--  "diseñar un modelo de audiencia". Aquí solo se une el resultado de cada
--  regla y se deduplica — una persona con dos relaciones que encajan en dos
--  criterios es UN destinatario, no dos.
--
--  Cero reglas = toda la copropiedad. No existe un criterio 'todos' porque
--  duplicaría el significado del conjunto vacío, y dos formas de decir lo
--  mismo acaban divergiendo.

create function public.fn_anuncio_destinatarios(p_anuncio_id uuid)
returns table (
  tercero_id  uuid,
  nombre      text,
  email       text,
  telefono    text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_reglas integer;
begin
  select a.tenant_id into v_tenant from public.anuncios a where a.id = p_anuncio_id;
  -- Mismo mensaje para "no existe" y "no es tuyo": el UUID no debe servir
  -- para averiguar qué anuncios hay en otras copropiedades (prompt 02 §25).
  -- auth.uid() nulo = service_role/cron: es quien despacha los correos, y
  -- no tiene membresía por definición — mismo criterio de "fuera de banda"
  -- que guard_privileged_columns y los guards de transición.
  if v_tenant is null
     or ((select auth.uid()) is not null and not public.is_member(v_tenant)) then
    raise exception 'ANUNCIO_NO_ENCONTRADO: el anuncio % no existe', p_anuncio_id;
  end if;

  select count(*) into v_reglas from public.anuncio_audiencia aa where aa.anuncio_id = p_anuncio_id;

  if v_reglas = 0 then
    return query
    select distinct t.id, t.nombre_completo, t.email::text, t.telefono::text
    from public.inmuebles i
    join public.inmueble_persona_rol ipr on ipr.inmueble_id = i.id and ipr.vigente_hasta is null
    join public.terceros t on t.id = ipr.tercero_id
    where i.tenant_id = v_tenant;
    return;
  end if;

  return query
  select distinct on (d.tercero_id) d.tercero_id, d.nombre, d.email, d.telefono
  from public.anuncio_audiencia aa
  cross join lateral public.gobierno_segmento_destinatarios(v_tenant, aa.criterio, aa.valor) d
  where aa.anuncio_id = p_anuncio_id;
end;
$$;

comment on function public.fn_anuncio_destinatarios is
  'EXS-3 — resuelve la audiencia de un anuncio contra datos VIVOS, no contra una lista '
  'materializada al publicar: quien vendió su apartamento deja de ser destinatario, y quien lo '
  'compró pasa a serlo. Une las reglas de anuncio_audiencia sobre '
  'gobierno_segmento_destinatarios (GOB-9) y deduplica por tercero. Cero reglas = toda la '
  'copropiedad. Devuelve NOT FOUND para quien no es miembro del tenant: el UUID no autoriza.';

-- ── Aviso in-app al publicar ───────────────────────────────────────────
--
--  Anuncio y notificación son cosas distintas (prompt 02 §4): el anuncio es
--  el contenido oficial, la notificación es la señal de que existe. Por eso
--  esto es un trigger que llama a fn_notificar (EXS-2) y no una columna
--  dentro de anuncios.

create function public.tg_notificar_anuncio_publicado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prioridad text;
begin
  if new.estado <> 'publicado' or old.estado = 'publicado' then
    return new;
  end if;

  -- La prioridad del anuncio (4 valores) se proyecta a la de la campana
  -- (3): urgente y crítica comparten el nivel más alto.
  select case lt.codigo
           when 'critica' then 'critica'
           when 'urgente' then 'critica'
           when 'importante' then 'importante'
           else 'informativa'
         end
    into v_prioridad
    from public.lista_tipos lt where lt.id = new.prioridad_id;

  begin
    perform public.fn_notificar(
      p_tenant_id      => new.tenant_id,
      p_modulo         => 'anuncios',
      p_tipo_codigo    => 'anuncio_publicado',
      p_prioridad      => coalesce(v_prioridad, 'informativa'),
      p_titulo         => new.titulo,
      p_origen_modulo  => 'anuncios',
      p_origen_entidad => 'anuncios',
      p_origen_evento  => 'publicado',
      p_origen_id      => new.id,
      p_cuerpo         => new.resumen,
      p_enlace         => '/anuncios/' || new.id::text
    );
  exception when others then
    raise warning 'EXS3_NOTIFICACION_OMITIDA: anuncio % (%)', new.id, sqlerrm;
  end;

  return new;
end;
$$;

create trigger notificar_anuncio_publicado
  after update on public.anuncios
  for each row execute function public.tg_notificar_anuncio_publicado();

revoke execute on function public.tg_notificar_anuncio_publicado() from public, authenticated, anon;

-- ── Publicación programada ─────────────────────────────────────────────
--
--  Idempotente por construcción (prompt 02 §16/§30, GC-005): el WHERE exige
--  estado='programado', y el propio UPDATE lo saca de ese estado. Una
--  segunda corrida del job no encuentra nada que hacer. No hace falta una
--  tabla de idempotencia: el estado ES la marca.

create function public.fn_anuncio_publicar_programados()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_publicados integer;
begin
  with pendientes as (
    select a.id, a.tenant_id
    from public.anuncios a
    where a.estado = 'programado'
      and a.publicar_at <= now()
    for update skip locked
  ),
  publicados as (
    update public.anuncios a
       set estado = 'publicado'
      from pendientes p
     where a.id = p.id
    returning a.id
  )
  select count(*) into v_publicados from publicados;

  return v_publicados;
end;
$$;

comment on function public.fn_anuncio_publicar_programados is
  'EXS-3 — publica los anuncios cuya fecha programada ya llegó. Idempotente sin tabla auxiliar: '
  'el filtro estado=''programado'' más el UPDATE que lo cambia hacen que una segunda corrida no '
  'encuentre nada (prompt 02 §16, GC-005). FOR UPDATE SKIP LOCKED evita que dos corridas '
  'simultáneas peleen por la misma fila. Corre como definer y sin auth.uid(), así que el guard '
  'de transición la trata como cambio fuera de banda y no le exige rol — la autorización ya '
  'ocurrió cuando un administrador la programó.';

revoke execute on function public.fn_anuncio_publicar_programados() from public, authenticated, anon;
grant execute on function public.fn_anuncio_publicar_programados() to service_role;

-- ── Métricas de lectura ────────────────────────────────────────────────
--
--  Agregado, nunca nominal: quien publica necesita saber cuántos leyeron,
--  no quién no lo hizo. anuncio_lectura solo deja ver la fila propia, así
--  que esta función definer es el único camino a los totales.

create function public.fn_anuncio_metricas(p_anuncio_id uuid)
returns table (
  destinatarios integer,
  leidos        integer,
  confirmados   integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
begin
  select a.tenant_id into v_tenant from public.anuncios a where a.id = p_anuncio_id;
  if v_tenant is null
     or ((select auth.uid()) is not null and not public.is_member(v_tenant)) then
    raise exception 'ANUNCIO_NO_ENCONTRADO: el anuncio % no existe', p_anuncio_id;
  end if;

  return query
  select
    (select count(*)::integer from public.fn_anuncio_destinatarios(p_anuncio_id)),
    (select count(*)::integer from public.anuncio_lectura l where l.anuncio_id = p_anuncio_id),
    (select count(*)::integer from public.anuncio_lectura l
      where l.anuncio_id = p_anuncio_id and l.confirmado_at is not null);
end;
$$;

comment on function public.fn_anuncio_metricas is
  'EXS-3 — totales de lectura y confirmación de un anuncio. Agregado y nunca nominal: '
  'anuncio_lectura solo expone la fila propia por RLS, y estas cifras no permiten reconstruir '
  'quién leyó. Las métricas se derivan de los datos reales, sin contadores redundantes que '
  'mantener (prompt 02 §53).';
