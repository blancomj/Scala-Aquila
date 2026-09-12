-- ═══════════════════════════════════════════════════════════════════════
--  EXS-6 · Marketplace (3/4) — ciclo de vida y escalera de aprobación
--
--  LA ESCALERA, cerrada por Johnny el 2026-09-12:
--
--    quien crea      →  quien aprueba
--    ─────────────────────────────────────────────
--    residente       →  auxiliar o administrador
--    auxiliar        →  administrador
--    administrador   →  él mismo (publica directo)
--
--  El principio que la resume: nadie aprueba lo suyo, salvo el
--  administrador. La escalera NO se lee de la membresía viva sino de la
--  columna `origen`, sellada al crear — si a un auxiliar lo ascienden entre
--  que publica y que alguien revisa, su publicación sigue necesitando
--  administrador. El rol que manda es el que regía al crear.
--
--  'residente' queda PREPARADO Y NO EJERCIDO: en esta serie los residentes
--  no tienen login (§0.1 A de la hoja de ruta), así que hoy solo se ejercen
--  los otros dos escalones. Se construye y se prueba igual, porque el
--  encargo explícito es que la capa externa no obligue a rehacer el modelo.
--
--  Mismo patrón que guard_anuncio_transicion (D-74) y
--  guard_accion_cobranza_transicion: lista cerrada de transiciones, rol
--  explícito, y sellado de columnas SIEMPRE —también fuera de banda—, que
--  es la trampa que costó tiempo en EXS-3.
-- ═══════════════════════════════════════════════════════════════════════

create function public.guard_publicacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid := (select auth.uid());
  v_tipo     text;
  v_familia  text;
  v_es_admin boolean;
  v_es_aux   boolean;
begin
  -- ── Coherencia del vocabulario ───────────────────────────────────────
  select lt.tipo, lt.codigo into v_familia, v_tipo
    from public.lista_tipos lt where lt.id = new.tipo_id;
  if v_familia is distinct from 'TIPO_PUBLICACION_MARKETPLACE' then
    raise exception 'PUBLICACION_TIPO_INVALIDO: % no pertenece a TIPO_PUBLICACION_MARKETPLACE',
      new.tipo_id;
  end if;

  select lt.tipo into v_familia from public.lista_tipos lt where lt.id = new.categoria_id;
  if v_familia is distinct from 'CATEGORIA_MARKETPLACE' then
    raise exception 'PUBLICACION_CATEGORIA_INVALIDA: % no pertenece a CATEGORIA_MARKETPLACE',
      new.categoria_id;
  end if;

  if new.condicion_id is not null then
    select lt.tipo into v_familia from public.lista_tipos lt where lt.id = new.condicion_id;
    if v_familia is distinct from 'CONDICION_ARTICULO' then
      raise exception 'PUBLICACION_CONDICION_INVALIDA: % no pertenece a CONDICION_ARTICULO',
        new.condicion_id;
    end if;
  end if;

  -- Un regalo con precio es una contradicción, no un descuido.
  if v_tipo = 'regalo' and new.precio is not null then
    raise exception 'PUBLICACION_REGALO_CON_PRECIO: un regalo no lleva precio';
  end if;

  if new.publicador_tercero_id is not null then
    if not exists (
      select 1 from public.terceros t
      where t.id = new.publicador_tercero_id and t.tenant_id = new.tenant_id
    ) then
      raise exception 'PUBLICACION_TERCERO_INCONSISTENTE: el tercero % no pertenece al tenant',
        new.publicador_tercero_id;
    end if;
  end if;

  -- ── Quién es el actor, cuando hay uno ────────────────────────────────
  --
  --  Con auth.uid() nulo estamos fuera de banda (service_role, cron,
  --  fixtures) y no hay rol que comprobar. El SELLADO de columnas, en
  --  cambio, ocurre siempre: separarlo de las comprobaciones de rol es
  --  exactamente lo que EXS-3 aprendió a golpes.
  v_es_admin := v_actor is not null
    and public.has_role(new.tenant_id, array['administrador']::public.tenant_role_t[]);
  v_es_aux := v_actor is not null
    and public.has_role(new.tenant_id, array['auxiliar']::public.tenant_role_t[]);

  -- ── INSERT: sellar el origen ─────────────────────────────────────────
  if tg_op = 'INSERT' then
    if v_actor is not null then
      -- El origen no se acepta del cliente: se deriva del rol real de quien
      -- inserta. Si se aceptara, un auxiliar podría declararse
      -- 'administrador' y saltarse su propio escalón.
      new.origen := case when v_es_admin then 'administrador'::public.publicacion_origen_t
                        else 'auxiliar'::public.publicacion_origen_t end;
      new.creado_por := coalesce(new.creado_por, v_actor);
    end if;

    if new.estado = 'publicada' then
      if v_actor is not null and not v_es_admin then
        raise exception 'PUBLICACION_DIRECTA_REQUIERE_ADMINISTRADOR: publicar sin aprobación '
          'exige rol administrador';
      end if;
      new.publicada_at := coalesce(new.publicada_at, now());
      new.aprobada_por := coalesce(new.aprobada_por, v_actor);
      new.aprobada_at  := coalesce(new.aprobada_at, now());
    end if;

    return new;
  end if;

  -- ── UPDATE ───────────────────────────────────────────────────────────

  -- El origen es historia, no un dato editable.
  if new.origen is distinct from old.origen then
    raise exception 'PUBLICACION_ORIGEN_INMUTABLE: el origen de una publicación no se cambia';
  end if;

  -- Lo aprobado no se edita por la puerta de atrás: cambiar el contenido de
  -- una publicación viva obliga a pasar otra vez por aprobación (§12).
  if old.estado in ('publicada', 'pausada') and v_actor is not null then
    if new.titulo is distinct from old.titulo
      or new.descripcion is distinct from old.descripcion
      or new.precio is distinct from old.precio
      or new.tipo_id is distinct from old.tipo_id
      or new.categoria_id is distinct from old.categoria_id
    then
      raise exception 'PUBLICACION_EDICION_EVADE_MODERACION: para cambiar el contenido de una '
        'publicación viva, devuélvela a borrador; se aprueba de nuevo';
    end if;
  end if;

  if new.estado = old.estado then
    return new;
  end if;

  -- ── Transiciones legales ─────────────────────────────────────────────
  if not (
    (old.estado = 'borrador'             and new.estado in ('pendiente_aprobacion', 'publicada', 'cerrada'))
    or (old.estado = 'pendiente_aprobacion' and new.estado in ('publicada', 'rechazada', 'borrador', 'cerrada'))
    or (old.estado = 'rechazada'         and new.estado in ('borrador', 'cerrada'))
    or (old.estado = 'publicada'         and new.estado in ('pausada', 'cerrada', 'expirada', 'borrador'))
    or (old.estado = 'pausada'           and new.estado in ('publicada', 'cerrada', 'borrador'))
    or (old.estado = 'expirada'          and new.estado in ('publicada', 'cerrada'))
  ) then
    raise exception 'PUBLICACION_TRANSICION_INVALIDA: la publicación % no puede pasar de % a %',
      old.id, old.estado, new.estado;
  end if;

  -- ── La escalera ──────────────────────────────────────────────────────
  if new.estado = 'publicada' and v_actor is not null then
    if old.estado = 'borrador' then
      -- Publicar saltándose la revisión es prerrogativa del administrador.
      if not v_es_admin then
        raise exception 'PUBLICACION_DIRECTA_REQUIERE_ADMINISTRADOR: publicar sin aprobación '
          'exige rol administrador';
      end if;

    elsif old.estado = 'pendiente_aprobacion' then
      if old.origen = 'residente' then
        -- El escalón más bajo: basta con ser del equipo.
        if not (v_es_admin or v_es_aux) then
          raise exception 'PUBLICACION_APROBACION_REQUIERE_EQUIPO: aprobar una publicación de un '
            'residente exige rol auxiliar o administrador';
        end if;
      else
        -- origen 'auxiliar' o 'administrador': solo administrador aprueba.
        if not v_es_admin then
          raise exception 'PUBLICACION_APROBACION_REQUIERE_ADMINISTRADOR: lo que publica un '
            'auxiliar lo aprueba un administrador';
        end if;
      end if;
    end if;
  end if;

  if new.estado = 'rechazada' and v_actor is not null and not (v_es_admin or v_es_aux) then
    raise exception 'PUBLICACION_APROBACION_REQUIERE_EQUIPO: rechazar exige rol auxiliar o '
      'administrador';
  end if;

  -- ── Sellado: SIEMPRE, con actor o sin él ─────────────────────────────
  if new.estado = 'publicada' then
    new.publicada_at := coalesce(new.publicada_at, now());
    if old.estado = 'pendiente_aprobacion' then
      new.aprobada_por := coalesce(new.aprobada_por, v_actor);
      new.aprobada_at  := coalesce(new.aprobada_at, now());
    end if;
    new.motivo_rechazo := null;
  end if;

  if new.estado = 'cerrada' then
    new.cerrada_at := coalesce(new.cerrada_at, now());
  end if;

  -- Volver a borrador limpia los sellos de la aprobación anterior: la
  -- siguiente publicación es una aprobación nueva, no la vieja heredada.
  if new.estado = 'borrador' then
    new.aprobada_por := null;
    new.aprobada_at  := null;
    new.publicada_at := null;
  end if;

  return new;
end;
$$;

create trigger publicaciones_guard
  before insert or update on public.publicaciones
  for each row execute function public.guard_publicacion();

revoke execute on function public.guard_publicacion() from public, authenticated, anon;

comment on function public.guard_publicacion is
  'EXS-6 — ciclo de vida del marketplace y escalera de aprobación (nadie aprueba lo suyo salvo el '
  'administrador). Sella `origen` al crear a partir del rol REAL de quien inserta: aceptarlo del '
  'cliente permitiría a un auxiliar declararse administrador y saltarse su escalón.';

-- ── Vencimiento: un barrido, no la visita de un usuario ───────────────

create function public.fn_publicaciones_expirar()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer;
begin
  update public.publicaciones
     set estado = 'expirada'
   where estado = 'publicada'
     and vigente_hasta is not null
     and vigente_hasta < current_date;
  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

comment on function public.fn_publicaciones_expirar is
  'EXS-6 §17 — saca del tablón lo vencido. Barre por fecha y no por tenant, así que es idempotente '
  'y multi-tenant de una sola pasada. El estado NO se deriva al consultar, a diferencia de '
  '`autorizado` en EXS-5: aquí expirar es una transición real del ciclo de vida, con su fila de '
  'historia, y una publicación expirada puede renovarse volviendo a ''publicada''.';

revoke execute on function public.fn_publicaciones_expirar() from public, authenticated, anon;
grant execute on function public.fn_publicaciones_expirar() to service_role;

create function public.cron_marketplace_expirar()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.fn_publicaciones_expirar();
end;
$$;

comment on function public.cron_marketplace_expirar is
  'EXS-6 — envoltorio para el scheduler, mismo patrón que cron_anuncios_publicar_programados. '
  'PENDIENTE: no está agendada en pg_cron todavía (misma deuda que arrastra EXS-3).';

revoke execute on function public.cron_marketplace_expirar() from public, authenticated, anon;
grant execute on function public.cron_marketplace_expirar() to service_role;
