-- ═══════════════════════════════════════════════════════════════════════
--  EXS-4 · Directorio (3/3) — la consulta
--
--  El directorio NO es "select * from terceros". Es una proyección con tres
--  reglas que la separan de la pantalla de Terceros:
--
--   1. solo lo PUBLICADO (prompt 03 §66: existir ≠ aparecer);
--   2. mínima exposición de PII (§15): ni documento, ni email o teléfono
--      administrativos, ni dirección de notificación. Solo el
--      contacto_publico que el negocio aceptó publicar;
--   3. la ubicación es CONTEXTUAL (§25): el código del inmueble donde el
--      tercero tiene relación vigente, derivado de inmueble_persona_rol —
--      no una columna copiada que envejecería sola.
--
--  Por eso es una función y no una vista: una vista expondría las columnas
--  de terceros y confiaría en que quien la consulte no pida las de más.
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_directorio_listar(
  p_tenant_id  uuid,
  p_categoria  bigint default null,
  p_texto      text default null
)
returns table (
  tercero_id        uuid,
  nombre_comercial  text,
  categoria_codigo  text,
  categoria_nombre  text,
  descripcion       text,
  horario           text,
  contacto_publico  text,
  tipo_persona      public.tercero_tipo_t,
  ubicaciones       text[]
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
  'columnas sensibles de terceros no estén al alcance de un select.';

revoke execute on function public.fn_directorio_listar(uuid, bigint, text) from public, anon;
grant execute on function public.fn_directorio_listar(uuid, bigint, text) to authenticated, service_role;
