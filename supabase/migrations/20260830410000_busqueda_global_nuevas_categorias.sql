-- ═══════════════════════════════════════════════════════════════════════
--  Búsqueda global — 5 categorías nuevas (conceptos, presupuesto_cuenta,
--  casos_juridicos, agrupaciones, zonas_comunes).
--
--  fn_buscar_global (20260822150000) se construyó el 22 de agosto y nunca
--  se revisó desde entonces — el esquema siguió creciendo después (E-16
--  Motor Presupuestal, Motor de Cartera Jurídico, agrupaciones) y esas
--  tablas se quedaron fuera, más "conceptos"/"zonas_comunes" que ya
--  existían desde el 14 de agosto pero nunca se incluyeron. Las 5 tienen
--  codigo/nombre propio, mismo criterio que terceros/inmuebles ya
--  cubiertas — investigación de sesión, no una tabla nueva en el esquema.
--
--  Mismo patrón exacto que 20260822142000_busqueda_tsvector_columnas.sql:
--  tsvector GENERATED ALWAYS AS (stored) + índice GIN por tabla, coalesce+||
--  en vez de concat_ws (STABLE, no válido en columna generada),
--  to_tsvector('spanish'::regconfig, ...) (no el overload STABLE de 2
--  argumentos).
-- ═══════════════════════════════════════════════════════════════════════

-- ── conceptos ────────────────────────────────────────────────────────────
alter table public.conceptos add column busqueda_tsv tsvector generated always as (
  to_tsvector('spanish'::regconfig, public.fn_unaccent_immutable(
    coalesce(codigo, '') || ' ' || coalesce(nombre, '')
  ))
) stored;
create index conceptos_busqueda_idx on public.conceptos using gin (busqueda_tsv);

-- ── presupuesto_cuenta ───────────────────────────────────────────────────
alter table public.presupuesto_cuenta add column busqueda_tsv tsvector generated always as (
  to_tsvector('spanish'::regconfig, public.fn_unaccent_immutable(
    coalesce(codigo, '') || ' ' || coalesce(nombre, '')
  ))
) stored;
create index presupuesto_cuenta_busqueda_idx on public.presupuesto_cuenta using gin (busqueda_tsv);

-- ── casos_juridicos ──────────────────────────────────────────────────────
alter table public.casos_juridicos add column busqueda_tsv tsvector generated always as (
  to_tsvector('spanish'::regconfig, public.fn_unaccent_immutable(
    coalesce(consecutivo, '') || ' ' || coalesce(numero_radicado, '') || ' ' ||
    coalesce(juzgado, '') || ' ' || coalesce(ciudad, '')
  ))
) stored;
create index casos_juridicos_busqueda_idx on public.casos_juridicos using gin (busqueda_tsv);

-- ── agrupaciones ─────────────────────────────────────────────────────────
alter table public.agrupaciones add column busqueda_tsv tsvector generated always as (
  to_tsvector('spanish'::regconfig, public.fn_unaccent_immutable(
    coalesce(nombre, '') || ' ' || coalesce(descripcion, '')
  ))
) stored;
create index agrupaciones_busqueda_idx on public.agrupaciones using gin (busqueda_tsv);

-- ── zonas_comunes ────────────────────────────────────────────────────────
alter table public.zonas_comunes add column busqueda_tsv tsvector generated always as (
  to_tsvector('spanish'::regconfig, public.fn_unaccent_immutable(
    coalesce(codigo, '') || ' ' || coalesce(nombre, '') || ' ' ||
    coalesce(descripcion, '') || ' ' || coalesce(matricula_inmobiliaria, '')
  ))
) stored;
create index zonas_comunes_busqueda_idx on public.zonas_comunes using gin (busqueda_tsv);

-- ── fn_buscar_global: 5 ramas UNION ALL nuevas ──────────────────────────
create or replace function public.fn_buscar_global(
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

    union all

    select
      'concepto',
      c.id,
      c.nombre,
      coalesce(c.codigo, '') || ' · ' || initcap(c.estado::text),
      null::uuid,
      ts_rank(c.busqueda_tsv, consulta.tsq)
    from public.conceptos c, consulta
    where (p_categoria is null or p_categoria = 'concepto')
      and c.tenant_id = p_tenant_id
      and c.busqueda_tsv @@ consulta.tsq

    union all

    select
      'cuenta_presupuestal',
      pc.id,
      pc.nombre,
      coalesce(pc.codigo, '')
        || ' · ' || case pc.naturaleza when 'egreso' then 'Egreso' else 'Ingreso' end,
      null::uuid,
      ts_rank(pc.busqueda_tsv, consulta.tsq)
    from public.presupuesto_cuenta pc, consulta
    where (p_categoria is null or p_categoria = 'cuenta_presupuestal')
      and pc.tenant_id = p_tenant_id
      and pc.busqueda_tsv @@ consulta.tsq

    union all

    select
      'caso_juridico',
      cj.id,
      coalesce(cj.numero_radicado, cj.consecutivo),
      coalesce(cj.juzgado, '')
        || case when cj.ciudad is not null then ' · ' || cj.ciudad else '' end,
      cj.inmueble_id,
      ts_rank(cj.busqueda_tsv, consulta.tsq)
    from public.casos_juridicos cj, consulta
    where (p_categoria is null or p_categoria = 'caso_juridico')
      and cj.tenant_id = p_tenant_id
      and cj.busqueda_tsv @@ consulta.tsq

    union all

    select
      'agrupacion',
      a.id,
      a.nombre,
      coalesce(a.descripcion, ''),
      null::uuid,
      ts_rank(a.busqueda_tsv, consulta.tsq)
    from public.agrupaciones a, consulta
    where (p_categoria is null or p_categoria = 'agrupacion')
      and a.tenant_id = p_tenant_id
      and a.busqueda_tsv @@ consulta.tsq

    union all

    select
      'zona_comun',
      z.id,
      z.nombre,
      coalesce(z.codigo, '')
        || case when z.matricula_inmobiliaria is not null then ' · ' || z.matricula_inmobiliaria else '' end,
      null::uuid,
      ts_rank(z.busqueda_tsv, consulta.tsq)
    from public.zonas_comunes z, consulta
    where (p_categoria is null or p_categoria = 'zona_comun')
      and z.tenant_id = p_tenant_id
      and z.busqueda_tsv @@ consulta.tsq
  ) resultados
  order by resultados.rank desc
  limit p_limite;
$$;

comment on function public.fn_buscar_global is
  'Búsqueda unificada — UNION ALL con ranking sobre terceros/inmuebles/documentos/novedades/'
  'conceptos/presupuesto_cuenta/casos_juridicos/agrupaciones/zonas_comunes (20260830410000). '
  'p_categoria filtra una rama; null busca en las nueve. subtitulo trae texto ya resuelto '
  '(join a lista_tipos donde aplica) para que el cliente no tenga que hacer una consulta '
  'aparte por resultado.';

revoke execute on function public.fn_buscar_global(uuid, text, text, int) from public, anon;
grant execute on function public.fn_buscar_global(uuid, text, text, int) to authenticated;
