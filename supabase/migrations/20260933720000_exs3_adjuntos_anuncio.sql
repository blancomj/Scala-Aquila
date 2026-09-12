-- ═══════════════════════════════════════════════════════════════════════
--  EXS-3 · Adjuntos de anuncios — la columna existía, la puerta no
--
--  `documentos.anuncio_id` está desde 20260933110000 y hasta hoy **nadie
--  podía escribirla**: `documentos` no tiene policy INSERT para
--  `authenticated` (mismo criterio que pagos, SEC-14), toda subida pasa
--  por la Edge Function `subir-documento`, y esa función no conocía el
--  parámetro. Solo `service_role` podía adjuntar. La columna era una
--  promesa sin cumplir, y desde EXS-6 además visible en
--  `v_documento_vigente`, lo que la hacía parecer terminada.
--
--  Aquí se cierra la mitad que vive en la base; la otra mitad es la Edge
--  Function y la pantalla.
--
--  DOS REGLAS, y la segunda es una decisión de producto, no una
--  consecuencia técnica:
--
--  1 · El anuncio citado tiene que ser de la misma copropiedad. Es el
--      hueco que `guard_documento_tipo_familia` ya cerraba para inmueble,
--      caso jurídico, envío y publicación, y que a `anuncio_id` le faltaba
--      desde EXS-3: un documento podía colgar de un anuncio ajeno.
--
--  2 · **No se adjunta a un anuncio ya publicado.** Al publicar, el
--      anuncio recibe consecutivo y `guard_anuncio_transicion` congela sus
--      columnas: lo publicado es historia y no se reescribe. Un adjunto
--      que apareciera después cambiaría lo que los residentes vieron bajo
--      esa misma referencia, y como `documentos` es append-only tampoco
--      podría retirarse — el error quedaría a la vista para siempre.
--      Quien necesite añadir algo redacta otro anuncio, que es justamente
--      lo que deja rastro.
--
--      Estados que admiten adjunto: borrador, pendiente_revision,
--      aprobado, programado y rechazado —todos anteriores a la
--      publicación, incluido el devuelto por el revisor, que vuelve a
--      edición—. Los rechazan publicado, archivado y cancelado.
--
--  El guard corre en BEFORE INSERT OR UPDATE sobre `documentos`, así que
--  también impide mover un adjunto hacia un anuncio ya publicado.
-- ═══════════════════════════════════════════════════════════════════════

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

    -- Lo publicado no se reescribe: ver la cabecera de esta migración.
    if v_estado_anuncio in ('publicado', 'archivado', 'cancelado') then
      raise exception
        'ANUNCIO_NO_EDITABLE: el anuncio % está en estado % y ya no admite adjuntos; lo publicado no se reescribe',
        new.anuncio_id, v_estado_anuncio;
    end if;
  end if;

  return new;
end;
$$;

comment on column public.documentos.anuncio_id is
  'EXS-3 — adjunto de un anuncio. Sigue el patrón de columna FK por dominio de esta tabla; no se '
  'creó una tabla de media propia. El `on delete cascade` solo llega a ejercerse al borrar el '
  'tenant dueño: documentos es append-only (SEC-14) y su trigger rechaza cualquier otro DELETE, y '
  'un anuncio no se borra nunca —se archiva o se cancela—. Como una publicación del marketplace y '
  'a diferencia del resto de alcances, un anuncio tiene VARIOS adjuntos, así que subir-documento '
  'NO los versiona entre sí: cada adjunto es un documento propio, no la corrección del anterior. '
  'Solo se adjunta antes de publicar (guard_documento_tipo_familia, 20260933720000): al publicar '
  'el anuncio recibe consecutivo y se congela.';
