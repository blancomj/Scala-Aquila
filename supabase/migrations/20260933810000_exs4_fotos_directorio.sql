-- ═══════════════════════════════════════════════════════════════════════
--  EXS-4 · Fotos del directorio — la cuarta vez que se añade una FK a
--  `documentos`, y la primera en que la vista se recrea sin que duela
--
--  El informe de EXS-4 dejó «sin fotos ni logos» diciendo que `documentos`
--  «podría alojarlas con una columna FK más, como se hizo con los
--  anuncios». Se hace exactamente eso — pero con lo aprendido desde
--  entonces, que es lo que esta cabecera documenta.
--
--  TRES COSAS EN LA MISMA MIGRACIÓN, y ninguna es opcional:
--
--  1 · La columna y su índice parcial.
--
--  2 · **La vista.** `v_documento_vigente` es un `select *`, y una vista NO
--      hereda las columnas añadidas después de crearla. Este repositorio ha
--      tropezado con eso CUATRO veces ya (pago_id/caso_juridico_id, envio_id,
--      y anuncio_id+publicacion_id, que estuvieron invisibles desde EXS-3
--      hasta que EXS-6 los descubrió). Si esta migración no la recreara, la
--      foto se guardaría bien y la pantalla no vería ninguna.
--
--  3 · **El guard.** `guard_documento_tipo_familia` valida que el alcance
--      citado sea del mismo tenant. Es la comprobación que a `anuncio_id` le
--      faltó durante todo EXS-3 y que hubo que añadir después: aquí nace
--      con ella.
--
--  POR QUÉ CUELGA DEL PERFIL Y NO DEL TERCERO. `tercero_perfil` es la ficha
--  *publicable* — tiene `publicado`, `publicado_at`, `nombre_comercial`—,
--  mientras que `terceros` es el dato administrativo de la persona o
--  empresa, que incluye a quien nunca aparecerá en el directorio. Colgar la
--  foto del perfil ata su ciclo de vida al de lo que se publica: si algún
--  día se despublica la ficha, la imagen deja de tener dónde mostrarse por
--  construcción, sin reglas añadidas.
--
--  SIN VERSIONADO entre fotos, igual que marketplace y anuncios: un negocio
--  tiene logo y fotos del local, que son documentos distintos y no
--  correcciones sucesivas del mismo. La Edge Function lo trata así.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.documentos
  add column tercero_perfil_id uuid references public.tercero_perfil (id) on delete cascade;

create index documentos_tercero_perfil_idx
  on public.documentos (tercero_perfil_id)
  where tercero_perfil_id is not null;

comment on column public.documentos.tercero_perfil_id is
  'EXS-4 — foto o logo de una ficha del directorio. Sigue el patrón de columna FK por dominio de '
  'esta tabla; no se creó una tabla de media propia. Cuelga del PERFIL y no del tercero porque el '
  'perfil es lo publicable: atar ahí la imagen hace que despublicar la ficha la deje sin sitio por '
  'construcción. Como el marketplace y los anuncios, una ficha tiene VARIAS imágenes y '
  'subir-documento NO las versiona entre sí. El `on delete cascade` solo llega a ejercerse al '
  'borrar el tenant dueño: documentos es append-only (SEC-14) y su trigger rechaza cualquier otro '
  'DELETE.';

-- ── La vista, recreada para exponer la columna nueva ───────────────────
create or replace view public.v_documento_vigente
with (security_invoker = true) as
select distinct on (grupo_id) *
from public.documentos
order by grupo_id, version desc;

comment on view public.v_documento_vigente is
  'Última versión de cada grupo_id — derivado, no persistido (§4.2). security_invoker=true: '
  'respeta el RLS de documentos del usuario que consulta, no del dueño de la vista. '
  'RECREARLA ES OBLIGATORIO EN LA MISMA MIGRACIÓN QUE AÑADA UNA FK DE DOMINIO A `documentos`: un '
  '`select *` no hereda columnas agregadas después de crear la vista, y este repositorio ya ha '
  'tropezado con eso cuatro veces (pago_id/caso_juridico_id en 20260903180000, envio_id en '
  '20260908180000, anuncio_id+publicacion_id en 20260933450000 —invisibles desde EXS-3—, y '
  'tercero_perfil_id aquí).';

-- ── El guard, con el tenant del perfil validado desde el primer día ────
create or replace function public.guard_documento_tipo_familia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo text;
  v_tenant_inmueble uuid;
  v_tenant_caso uuid;
  v_tenant_envio uuid;
  v_tenant_publicacion uuid;
  v_tenant_anuncio uuid;
  v_estado_anuncio public.anuncio_estado_t;
  v_tenant_perfil uuid;
begin
  select tipo into v_tipo from public.lista_tipos where id = new.tipo_documento_id;

  if v_tipo is distinct from 'TIPO_DOCUMENTO' then
    raise exception 'TIPO_DOCUMENTO_INVALIDO: tipo_documento_id % no pertenece a TIPO_DOCUMENTO (es %)',
      new.tipo_documento_id, coalesce(v_tipo, 'inexistente');
  end if;

  if new.inmueble_id is not null then
    select tenant_id into v_tenant_inmueble from public.inmuebles where id = new.inmueble_id;
    if v_tenant_inmueble is distinct from new.tenant_id then
      raise exception 'INMUEBLE_INVALIDO: % no pertenece al tenant %', new.inmueble_id, new.tenant_id;
    end if;
  end if;

  if new.caso_juridico_id is not null then
    select tenant_id into v_tenant_caso from public.casos_juridicos where id = new.caso_juridico_id;
    if v_tenant_caso is distinct from new.tenant_id then
      raise exception 'CASO_JURIDICO_INVALIDO: % no pertenece al tenant %', new.caso_juridico_id, new.tenant_id;
    end if;
  end if;

  if new.envio_id is not null then
    select tenant_id into v_tenant_envio from public.acciones_cobranza_envios where id = new.envio_id;
    if v_tenant_envio is distinct from new.tenant_id then
      raise exception 'ENVIO_INVALIDO: % no pertenece al tenant %', new.envio_id, new.tenant_id;
    end if;
  end if;

  if new.publicacion_id is not null then
    select tenant_id into v_tenant_publicacion
      from public.publicaciones where id = new.publicacion_id;
    if v_tenant_publicacion is distinct from new.tenant_id then
      raise exception 'PUBLICACION_INVALIDA: % no pertenece al tenant %',
        new.publicacion_id, new.tenant_id;
    end if;
  end if;

  if new.anuncio_id is not null then
    select tenant_id, estado into v_tenant_anuncio, v_estado_anuncio
      from public.anuncios where id = new.anuncio_id;

    if v_tenant_anuncio is distinct from new.tenant_id then
      raise exception 'ANUNCIO_INVALIDO: % no pertenece al tenant %',
        new.anuncio_id, new.tenant_id;
    end if;

    -- Lo publicado no se reescribe (20260933720000).
    if v_estado_anuncio in ('publicado', 'archivado', 'cancelado') then
      raise exception
        'ANUNCIO_NO_EDITABLE: el anuncio % está en estado % y ya no admite adjuntos; lo publicado no se reescribe',
        new.anuncio_id, v_estado_anuncio;
    end if;
  end if;

  if new.tercero_perfil_id is not null then
    select tenant_id into v_tenant_perfil
      from public.tercero_perfil where id = new.tercero_perfil_id;
    if v_tenant_perfil is distinct from new.tenant_id then
      raise exception 'TERCERO_PERFIL_INVALIDO: % no pertenece al tenant %',
        new.tercero_perfil_id, new.tenant_id;
    end if;
  end if;

  return new;
end;
$$;

-- ── La consulta del directorio, con portada y conteo ───────────────────
--
--  Mismo patrón que `fn_marketplace_listar`: devuelve la RUTA de la
--  portada, no una URL firmada. Firmar en SQL exigiría meter aquí la clave
--  del bucket, y el cliente ya sabe pedir su firma cuando va a mostrarla.
--
--  Se añade también `perfil_id`, que antes no salía: sin él la pantalla no
--  puede subir una foto ni pedir el resto de la galería, porque la función
--  solo devolvía `tercero_id` y la FK cuelga del perfil.
--
--  DROP + CREATE: cambia el tipo de retorno. Se cita la firma exacta para
--  no dejar un overload huérfano.

drop function if exists public.fn_directorio_listar(uuid, bigint, text);

create function public.fn_directorio_listar(
  p_tenant_id  uuid,
  p_categoria  bigint default null,
  p_texto      text default null
)
returns table (
  tercero_id        uuid,
  perfil_id         uuid,
  nombre_comercial  text,
  categoria_codigo  text,
  categoria_nombre  text,
  descripcion       text,
  horario           text,
  contacto_publico  text,
  tipo_persona      public.tercero_tipo_t,
  ubicaciones       text[],
  portada_path      text,
  fotos             bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_member(p_tenant_id) then
    raise exception 'DIRECTORIO_NO_DISPONIBLE: no hay directorio para esta copropiedad';
  end if;

  return query
  select
    p.tercero_id,
    p.id,
    p.nombre_comercial,
    lt.codigo,
    lt.nombre,
    p.descripcion,
    p.horario,
    p.contacto_publico,
    t.tipo_persona,
    -- Ubicación derivada, nunca copiada: si el negocio se muda de local,
    -- su ficha lo refleja sin que nadie edite el perfil.
    coalesce(
      array(
        select distinct i.codigo
        from public.inmueble_persona_rol ipr
        join public.inmuebles i on i.id = ipr.inmueble_id
        where ipr.tercero_id = p.tercero_id
          and ipr.vigente_hasta is null
          and i.tenant_id = p_tenant_id
        order by i.codigo
      ),
      '{}'::text[]
    ),
    -- La más antigua es la portada: la primera que subieron es la que
    -- eligieron para presentarse, y no cambia sola al añadir otra.
    (
      select d.storage_path
      from public.v_documento_vigente d
      where d.tercero_perfil_id = p.id
      order by d.created_at
      limit 1
    ),
    (
      select count(*)
      from public.v_documento_vigente d
      where d.tercero_perfil_id = p.id
    )
  from public.tercero_perfil p
  join public.terceros t on t.id = p.tercero_id
  left join public.lista_tipos lt on lt.id = p.categoria_comercio_id
  where p.tenant_id = p_tenant_id
    and p.publicado
    and (p_categoria is null or p.categoria_comercio_id = p_categoria)
    and (
      p_texto is null
      or btrim(p_texto) = ''
      -- unaccent + lower, igual que fn_buscar_global: buscar "panaderia"
      -- debe encontrar "Panadería".
      or public.fn_unaccent_immutable(lower(coalesce(p.nombre_comercial, '')))
         like '%' || public.fn_unaccent_immutable(lower(p_texto)) || '%'
      or public.fn_unaccent_immutable(lower(coalesce(p.descripcion, '')))
         like '%' || public.fn_unaccent_immutable(lower(p_texto)) || '%'
    )
  order by p.nombre_comercial;
end;
$$;

comment on function public.fn_directorio_listar is
  'EXS-4 — fichas publicadas del directorio. Tres cosas que la distinguen de consultar terceros: '
  'solo devuelve perfiles con publicado=true, no expone NINGÚN dato de identidad ni de contacto '
  'administrativo (solo contacto_publico, que el negocio aceptó publicar), y deriva la ubicación '
  'de inmueble_persona_rol en vez de copiarla. Es función y no vista precisamente para que las '
  'columnas sensibles de terceros no estén al alcance de un select. Desde 20260933810000 devuelve '
  'también perfil_id (la FK de las fotos cuelga del perfil, no del tercero) y la portada como '
  'RUTA, no como URL firmada: el bucket es privado y firmar en SQL exigiría su clave aquí.';

revoke execute on function public.fn_directorio_listar(uuid, bigint, text) from public, anon;
grant execute on function public.fn_directorio_listar(uuid, bigint, text) to authenticated, service_role;
