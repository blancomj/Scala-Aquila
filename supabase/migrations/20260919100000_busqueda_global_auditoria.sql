-- ═══════════════════════════════════════════════════════════════════════
--  Búsqueda global — 4 categorías del módulo de auditoría (PROMPT AUDITORÍA
--  §92: "riesgo, control, auditoría, hallazgo, evidencia, usuario, inmueble,
--  comprobante, periodo, documento, norma").
--
--  fn_buscar_global (20260822150000, extendida 20260830410000) nunca cubrió
--  el módulo de auditoría porque no existía todavía cuando se escribió.
--  Mismo patrón exacto: tsvector GENERATED ALWAYS AS (stored) + índice GIN
--  por tabla, coalesce+|| (no concat_ws, no es IMMUTABLE en columna
--  generada), to_tsvector('spanish'::regconfig, ...).
--
--  "auditoría"/"norma"/"usuario"/"comprobante"/"periodo" del §92 no entran
--  aquí: auditoría (engagement) ya se navega desde la lista propia sin
--  necesitar buscador; norma no existe como tabla todavía (auditoria_
--  normativa, gap documentado); usuario/comprobante/periodo son de otros
--  módulos, fuera de alcance de esta migración.
-- ═══════════════════════════════════════════════════════════════════════

-- ── auditoria_riesgos ────────────────────────────────────────────────────
alter table public.auditoria_riesgos add column busqueda_tsv tsvector generated always as (
  to_tsvector('spanish'::regconfig, public.fn_unaccent_immutable(
    coalesce(nombre, '') || ' ' || coalesce(categoria, '') || ' ' || coalesce(descripcion, '')
  ))
) stored;
create index auditoria_riesgos_busqueda_idx on public.auditoria_riesgos using gin (busqueda_tsv);

-- ── auditoria_controles ──────────────────────────────────────────────────
alter table public.auditoria_controles add column busqueda_tsv tsvector generated always as (
  to_tsvector('spanish'::regconfig, public.fn_unaccent_immutable(
    coalesce(nombre, '') || ' ' || coalesce(objetivo, '') || ' ' || coalesce(proceso, '')
  ))
) stored;
create index auditoria_controles_busqueda_idx on public.auditoria_controles using gin (busqueda_tsv);

-- ── auditoria_hallazgos ──────────────────────────────────────────────────
alter table public.auditoria_hallazgos add column busqueda_tsv tsvector generated always as (
  to_tsvector('spanish'::regconfig, public.fn_unaccent_immutable(
    coalesce(proceso, '') || ' ' || coalesce(criterio, '') || ' ' || coalesce(condicion, '') || ' ' ||
    coalesce(causa, '') || ' ' || coalesce(efecto, '') || ' ' || coalesce(recomendacion, '')
  ))
) stored;
create index auditoria_hallazgos_busqueda_idx on public.auditoria_hallazgos using gin (busqueda_tsv);

-- ── auditoria_evidencias ─────────────────────────────────────────────────
alter table public.auditoria_evidencias add column busqueda_tsv tsvector generated always as (
  to_tsvector('spanish'::regconfig, public.fn_unaccent_immutable(
    coalesce(tipo, '') || ' ' || coalesce(descripcion, '') || ' ' || coalesce(origen, '')
  ))
) stored;
create index auditoria_evidencias_busqueda_idx on public.auditoria_evidencias using gin (busqueda_tsv);

-- ── fn_buscar_global: 4 ramas UNION ALL nuevas ──────────────────────────
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

    union all

    select
      'riesgo',
      r.id,
      r.nombre,
      r.categoria || case when r.riesgo_inherente is not null then ' · riesgo ' || r.riesgo_inherente else '' end,
      null::uuid,
      ts_rank(r.busqueda_tsv, consulta.tsq)
    from public.auditoria_riesgos r, consulta
    where (p_categoria is null or p_categoria = 'riesgo')
      and r.tenant_id = p_tenant_id
      and r.busqueda_tsv @@ consulta.tsq

    union all

    select
      'control',
      c.id,
      c.nombre,
      c.tipo || case when c.automatizado then ' · Automático' else ' · Manual' end,
      null::uuid,
      ts_rank(c.busqueda_tsv, consulta.tsq)
    from public.auditoria_controles c, consulta
    where (p_categoria is null or p_categoria = 'control')
      and c.tenant_id = p_tenant_id
      and c.busqueda_tsv @@ consulta.tsq

    union all

    select
      'hallazgo',
      h.id,
      coalesce(h.condicion, h.proceso),
      h.nivel || ' · ' || initcap(replace(h.estado, '_', ' ')),
      null::uuid,
      ts_rank(h.busqueda_tsv, consulta.tsq)
    from public.auditoria_hallazgos h, consulta
    where (p_categoria is null or p_categoria = 'hallazgo')
      and h.tenant_id = p_tenant_id
      and h.busqueda_tsv @@ consulta.tsq

    union all

    select
      'evidencia',
      e.id,
      coalesce(e.descripcion, e.tipo),
      e.tipo || case when e.origen is not null then ' · ' || e.origen else '' end,
      null::uuid,
      ts_rank(e.busqueda_tsv, consulta.tsq)
    from public.auditoria_evidencias e, consulta
    where (p_categoria is null or p_categoria = 'evidencia')
      and e.tenant_id = p_tenant_id
      and e.busqueda_tsv @@ consulta.tsq
  ) resultados
  order by resultados.rank desc
  limit p_limite;
$$;

comment on function public.fn_buscar_global is
  'Búsqueda unificada — UNION ALL con ranking sobre terceros/inmuebles/documentos/novedades/'
  'conceptos/presupuesto_cuenta/casos_juridicos/agrupaciones/zonas_comunes/auditoria_riesgos/'
  'auditoria_controles/auditoria_hallazgos/auditoria_evidencias (20260919100000). p_categoria '
  'filtra una rama; null busca en las trece. subtitulo trae texto ya resuelto para que el '
  'cliente no tenga que hacer una consulta aparte por resultado.';

revoke execute on function public.fn_buscar_global(uuid, text, text, int) from public, anon;
grant execute on function public.fn_buscar_global(uuid, text, text, int) to authenticated;
