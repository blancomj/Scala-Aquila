-- ═══════════════════════════════════════════════════════════════════════
--  EXS-6 · Marketplace — la foto de portada en el tablón
--
--  Un tablón de avisos sin fotos visibles no cumple su función: la foto es
--  lo que hace que alguien se detenga en una tarjeta. `fn_marketplace_listar`
--  devuelve ahora el `storage_path` de la PRIMERA foto del aviso.
--
--  Devuelve la ruta y no una URL: el bucket es privado y la URL firmada la
--  pide el cliente con su propia sesión (`createSignedUrl`, 60 s). Firmar
--  en SQL exigiría meter aquí la clave del bucket — exactamente lo que el
--  diseño de Storage evita.
--
--  Se recrea con DROP porque cambia el tipo de retorno: `create or replace`
--  no admite añadir una columna a un `returns table`.
-- ═══════════════════════════════════════════════════════════════════════

drop function if exists public.fn_marketplace_listar(uuid, bigint, bigint, text);

create function public.fn_marketplace_listar(
  p_tenant_id  uuid,
  p_categoria  bigint default null,
  p_tipo       bigint default null,
  p_texto      text default null
)
returns table (
  id                uuid,
  titulo            text,
  descripcion       text,
  identidad_publica text,
  tipo_codigo       text,
  tipo_nombre       text,
  categoria_codigo  text,
  categoria_nombre  text,
  condicion_nombre  text,
  precio            numeric,
  moneda            char(3),
  negociable        boolean,
  publicada_at      timestamptz,
  vigente_hasta     date,
  intereses         bigint,
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
    raise exception 'MARKETPLACE_NO_DISPONIBLE: no hay marketplace para esta copropiedad';
  end if;

  return query
  select
    p.id,
    p.titulo,
    p.descripcion,
    p.identidad_publica,
    lt.codigo,
    lt.nombre,
    lc.codigo,
    lc.nombre,
    lcond.nombre,
    p.precio,
    p.moneda,
    p.negociable,
    p.publicada_at,
    p.vigente_hasta,
    (select count(*) from public.publicacion_interes i where i.publicacion_id = p.id),
    (
      select d.storage_path
      from public.documentos d
      where d.publicacion_id = p.id
      order by d.created_at
      limit 1
    ),
    (select count(*) from public.documentos d where d.publicacion_id = p.id)
  from public.publicaciones p
  join public.lista_tipos lt on lt.id = p.tipo_id
  join public.lista_tipos lc on lc.id = p.categoria_id
  left join public.lista_tipos lcond on lcond.id = p.condicion_id
  where p.tenant_id = p_tenant_id
    and p.estado = 'publicada'
    and (p_categoria is null or p.categoria_id = p_categoria)
    and (p_tipo is null or p.tipo_id = p_tipo)
    and (
      p_texto is null
      or btrim(p_texto) = ''
      or public.fn_unaccent_immutable(lower(p.titulo)) like
         '%' || public.fn_unaccent_immutable(lower(p_texto)) || '%'
      or public.fn_unaccent_immutable(lower(coalesce(p.descripcion, ''))) like
         '%' || public.fn_unaccent_immutable(lower(p_texto)) || '%'
    )
  order by p.publicada_at desc;
end;
$$;

comment on function public.fn_marketplace_listar is
  'EXS-6 — el tablón visible. Función y no vista para que `publicador_tercero_id` no quede al '
  'alcance de un select: lo público es `identidad_publica` (§7, §22). Solo devuelve lo que está '
  'en estado ''publicada''. `portada_path` es la RUTA de la primera foto, no una URL: el bucket '
  'es privado y el cliente firma con su propia sesión, en vez de meter la clave del bucket en SQL.';

revoke execute on function public.fn_marketplace_listar(uuid, bigint, bigint, text)
  from public, anon;
grant execute on function public.fn_marketplace_listar(uuid, bigint, bigint, text)
  to authenticated, service_role;
