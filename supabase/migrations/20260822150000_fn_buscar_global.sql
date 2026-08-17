-- ═══════════════════════════════════════════════════════════════════════
--  fn_buscar_global — búsqueda unificada por categoría o "todas"
--  Propietario: conversación de diseño de esta sesión.
--
--  SECURITY INVOKER (default): las cuatro tablas ya tienen RLS de SELECT
--  por membresía/rol — no hace falta escalar privilegios. p_tenant_id se
--  pasa explícito además de que RLS ya lo filtra (mismo criterio que el
--  resto del proyecto: cada store pasa tenant_id igual bajo RLS, defensa
--  en profundidad + mejor uso del índice).
--
--  websearch_to_tsquery en vez de plainto_tsquery: tolera lo que alguien
--  escribe en una barra de búsqueda real (comillas, "o", texto suelto)
--  sin que un operador mal formado tumbe la consulta completa.
--
--  Cada rama gateada por (p_categoria is null or p_categoria = 'x') —
--  igual criterio que v_inmueble_historico: una sola función, sin
--  duplicar la forma de "buscar" en el cliente para cada categoría.
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_buscar_global(
  p_tenant_id uuid,
  p_query text,
  p_categoria text default null,
  p_limite int default 20
)
returns table (
  categoria text,
  entidad_id uuid,
  titulo text,
  subtitulo text,
  inmueble_id uuid,
  rank real
)
language sql
stable
set search_path = ''
as $$
  with consulta as (
    select websearch_to_tsquery('spanish', public.fn_unaccent_immutable(p_query)) as tsq
  )
  select resultados.*
  from (
    select
      'tercero'::text as categoria,
      t.id as entidad_id,
      t.nombre_completo as titulo,
      (case t.tipo_persona when 'natural' then 'Natural' when 'juridica' then 'Jurídica' end
        || ' · ' || t.numero_documento) as subtitulo,
      null::uuid as inmueble_id,
      ts_rank(t.busqueda_tsv, consulta.tsq) as rank
    from public.terceros t, consulta
    where (p_categoria is null or p_categoria = 'tercero')
      and t.tenant_id = p_tenant_id
      and t.busqueda_tsv @@ consulta.tsq

    union all

    select
      'inmueble',
      i.id,
      i.codigo,
      coalesce(lt_tipo.nombre, '')
        || case when i.matricula_inmobiliaria is not null then ' · ' || i.matricula_inmobiliaria else '' end,
      i.id,
      ts_rank(i.busqueda_tsv, consulta.tsq)
    from public.inmuebles i
    left join public.lista_tipos lt_tipo on lt_tipo.id = i.tipo_id
    cross join consulta
    where (p_categoria is null or p_categoria = 'inmueble')
      and i.tenant_id = p_tenant_id
      and i.busqueda_tsv @@ consulta.tsq

    union all

    select
      'documento',
      d.id,
      d.nombre_archivo,
      coalesce(lt_doc.nombre, '')
        || case when d.inmueble_id is null then ' · Copropiedad' else '' end,
      d.inmueble_id,
      ts_rank(d.busqueda_tsv, consulta.tsq)
    from public.v_documento_vigente d
    left join public.lista_tipos lt_doc on lt_doc.id = d.tipo_documento_id
    cross join consulta
    where (p_categoria is null or p_categoria = 'documento')
      and d.tenant_id = p_tenant_id
      and d.busqueda_tsv @@ consulta.tsq

    union all

    select
      'novedad',
      n.id,
      n.descripcion,
      initcap(n.estado::text),
      n.inmueble_id,
      ts_rank(n.busqueda_tsv, consulta.tsq)
    from public.novedades n, consulta
    where (p_categoria is null or p_categoria = 'novedad')
      and n.tenant_id = p_tenant_id
      and n.busqueda_tsv @@ consulta.tsq
  ) resultados
  order by resultados.rank desc
  limit p_limite;
$$;

comment on function public.fn_buscar_global is
  'Búsqueda unificada — UNION ALL con ranking sobre terceros/inmuebles/documentos/'
  'novedades. p_categoria filtra una rama; null busca en las cuatro. subtitulo trae texto '
  'ya resuelto (join a lista_tipos) para que el cliente no tenga que hacer una consulta '
  'aparte por resultado.';

revoke execute on function public.fn_buscar_global(uuid, text, text, int) from public, anon;
grant execute on function public.fn_buscar_global(uuid, text, text, int) to authenticated;
