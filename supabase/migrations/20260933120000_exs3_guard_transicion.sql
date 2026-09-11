-- ═══════════════════════════════════════════════════════════════════════
--  EXS-3 · Anuncios (3/5) — máquina de estados y segregación
--
--  Aquí vive la regla de aprobación, no en un permiso. Es el contrato de
--  EXS-1 §3.3 aplicado por primera vez a un dominio nuevo: crear vs.
--  aprobar vs. publicar no se modela como capacidad, se modela como
--  transición custodiada. El patrón es guard_accion_cobranza_transicion
--  (CAR §9.4/§21.3), que ya resolvió las tres piezas: lista cerrada de
--  transiciones, rol explícito para las sensibles, y maker-checker.
--
--  auth.uid() nulo = service_role/fixtures: cambio fuera de banda, se deja
--  pasar. Mismo criterio que guard_privileged_columns y guard_self_modify.
-- ═══════════════════════════════════════════════════════════════════════

create function public.guard_anuncio_transicion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  -- ── Inmutabilidad de lo ya publicado ─────────────────────────────────
  -- Un anuncio publicado no se edita en silencio (prompt 02 §10). Lo único
  -- que puede cambiar es su estado (archivar) y su vigencia.
  if old.estado in ('publicado', 'archivado') and v_actor is not null then
    if new.titulo is distinct from old.titulo
      or new.contenido is distinct from old.contenido
      or new.resumen is distinct from old.resumen
      or new.categoria_id is distinct from old.categoria_id
      or new.prioridad_id is distinct from old.prioridad_id
      or new.numero is distinct from old.numero
      or new.publicado_at is distinct from old.publicado_at
    then
      raise exception 'ANUNCIO_PUBLICADO_INMUTABLE: el anuncio % ya está publicado; su contenido '
        'y su consecutivo no pueden modificarse (archívalo y publica uno nuevo)', old.id;
    end if;
  end if;

  if new.estado = old.estado then
    return new;
  end if;

  -- ── Transiciones legales ─────────────────────────────────────────────
  if not (
    (old.estado = 'borrador'           and new.estado in ('pendiente_revision', 'publicado', 'cancelado'))
    or (old.estado = 'pendiente_revision' and new.estado in ('aprobado', 'rechazado', 'cancelado'))
    or (old.estado = 'rechazado'       and new.estado in ('borrador', 'cancelado'))
    or (old.estado = 'aprobado'        and new.estado in ('programado', 'publicado', 'cancelado'))
    or (old.estado = 'programado'      and new.estado in ('publicado', 'aprobado', 'cancelado'))
    or (old.estado = 'publicado'       and new.estado = 'archivado')
  ) then
    raise exception 'ANUNCIO_TRANSICION_INVALIDA: el anuncio % no puede pasar de % a %',
      old.id, old.estado, new.estado;
  end if;

  -- ── Comprobaciones de ROL ────────────────────────────────────────────
  --
  --  Solo aplican a un actor real. Con auth.uid() nulo (service_role, el
  --  cron de publicación programada, fixtures) se omiten: es cambio fuera
  --  de banda, mismo criterio que guard_privileged_columns.
  --
  --  Lo que NO puede saltarse en ese caso es el sellado de columnas de más
  --  abajo — el consecutivo sobre todo. Un `return new` temprano aquí hacía
  --  que el job programado publicara sin número y chocara contra
  --  anuncios_publicado_con_numero; lo cazó la prueba del GC-005.
  if v_actor is not null then
    -- borrador → publicado: el atajo que el prompt 02 §7 pide para
    -- emergencias, explícito y auditable, no un bypass genérico. Exige
    -- administrador: un auxiliar siempre pasa por revisión.
    if old.estado = 'borrador' and new.estado = 'publicado' then
      if not public.has_role(new.tenant_id, array['administrador']::public.tenant_role_t[]) then
        raise exception 'ANUNCIO_PUBLICACION_DIRECTA_REQUIERE_ADMINISTRADOR: publicar sin revisión '
          'previa requiere rol administrador; envía el anuncio % a revisión', old.id;
      end if;
    end if;

    -- Aprobar o rechazar: administrador, y nunca lo propio.
    if old.estado = 'pendiente_revision' and new.estado in ('aprobado', 'rechazado') then
      if not public.has_role(new.tenant_id, array['administrador']::public.tenant_role_t[]) then
        raise exception 'ANUNCIO_REVISION_REQUIERE_ADMINISTRADOR: aprobar o rechazar el anuncio % '
          'requiere rol administrador', old.id;
      end if;
      -- Segregación de funciones (prompt 02 §27/§28): quien redactó no
      -- aprueba lo suyo. Misma regla que cobranza aplica a las acciones de
      -- alto impacto.
      if old.creado_por is not null and old.creado_por = v_actor then
        raise exception 'ANUNCIO_AUTOAPROBACION: quien redactó el anuncio % no puede aprobarlo ni '
          'rechazarlo; debe revisarlo otra persona', old.id;
      end if;
      new.revisado_por := v_actor;
      new.revisado_at := now();
    end if;

    -- Publicar a mano exige administrador. El cron no pasa por aquí: su
    -- autorización ocurrió cuando un administrador programó el anuncio.
    if new.estado = 'publicado' then
      if not public.has_role(new.tenant_id, array['administrador']::public.tenant_role_t[]) then
        raise exception 'ANUNCIO_PUBLICACION_REQUIERE_ADMINISTRADOR: publicar el anuncio % requiere '
          'rol administrador', old.id;
      end if;
    end if;
  end if;

  -- ── Sellado al publicar: siempre, haya actor o no ────────────────────
  if new.estado = 'publicado' then
    -- El número se asigna aquí y en ningún otro sitio: así no hay forma de
    -- publicar sin numerar ni de numerar sin publicar.
    if new.numero is null then
      new.anio := extract(year from now())::smallint;
      new.numero := public.fn_anuncio_siguiente_numero(new.tenant_id, new.anio);
    end if;
    new.publicado_at := coalesce(new.publicado_at, now());
    new.publicado_por := coalesce(new.publicado_por, v_actor);
    -- Sin vigencia explícita, vige desde que se publica.
    new.vigente_desde := coalesce(new.vigente_desde, new.publicado_at);
  end if;

  -- ── Programar: exige fecha futura ────────────────────────────────────
  if new.estado = 'programado' then
    if new.publicar_at is null then
      raise exception 'ANUNCIO_PROGRAMADO_SIN_FECHA: programar el anuncio % exige publicar_at', old.id;
    end if;
    if new.publicar_at <= now() then
      raise exception 'ANUNCIO_PROGRAMADO_EN_PASADO: publicar_at del anuncio % debe ser futura', old.id;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger guard_anuncio_transicion
  before update on public.anuncios
  for each row execute function public.guard_anuncio_transicion();

revoke execute on function public.guard_anuncio_transicion() from public, authenticated, anon;

comment on function public.guard_anuncio_transicion is
  'EXS-3 — máquina de estados del anuncio. Contrato EXS-1 §3.3 en acción: crear/aprobar/publicar '
  'no son permisos, son transiciones custodiadas. Valida la transición contra una lista cerrada, '
  'exige administrador para revisar y publicar, impide que quien redactó apruebe lo suyo, asigna '
  'el consecutivo al publicar, y congela contenido y número una vez publicado. BEFORE UPDATE '
  'porque sella columnas de la propia fila (revisado_por, numero, publicado_at).';

-- ── Consecutivo ────────────────────────────────────────────────────────

create table public.anuncio_consecutivo (
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  anio          smallint not null,
  ultimo_numero integer not null default 0,
  updated_at    timestamptz,

  primary key (tenant_id, anio)
);

alter table public.anuncio_consecutivo enable row level security;
alter table public.anuncio_consecutivo force row level security;

create policy anuncio_consecutivo_select_miembro on public.anuncio_consecutivo
  for select using (public.is_member(tenant_id));

-- Sin policy de escritura: solo fn_anuncio_siguiente_numero (definer) lo toca.

create function public.fn_anuncio_siguiente_numero(p_tenant_id uuid, p_anio smallint)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_numero integer;
begin
  insert into public.anuncio_consecutivo (tenant_id, anio, ultimo_numero, updated_at)
  values (p_tenant_id, p_anio, 1, now())
  on conflict (tenant_id, anio)
  do update set ultimo_numero = public.anuncio_consecutivo.ultimo_numero + 1, updated_at = now()
  returning ultimo_numero into v_numero;

  return v_numero;
end;
$$;

comment on function public.fn_anuncio_siguiente_numero is
  'EXS-3 — consecutivo atómico por (tenant, año). Mismo mecanismo INSERT...ON CONFLICT...RETURNING '
  'que fn_gobierno_siguiente_numero_decision/fn_contable_siguiente_numero: dos publicaciones '
  'simultáneas no pueden obtener el mismo número. Se invoca únicamente desde '
  'guard_anuncio_transicion.';

revoke execute on function public.fn_anuncio_siguiente_numero(uuid, smallint) from public, authenticated, anon;
