-- ═══════════════════════════════════════════════════════════════════════
--  Búsqueda global — nueve categorías nuevas, pedidas por el usuario tras
--  ver que la barra de búsqueda (Ctrl+K) no cubría casi nada de lo
--  construido en las series EXS/MOV/GOB/MANT/cartera.
--
--  Mismo patrón exacto de siempre (20260822150000, extendida
--  20260830410000 y 20260919100000): tsvector GENERATED ALWAYS AS
--  (stored) + índice GIN por tabla, coalesce+|| (no concat_ws, no es
--  IMMUTABLE en columna generada), to_tsvector('spanish'::regconfig, ...).
--
--  Dos tablas (gobierno_reuniones, acciones_cobranza) no tienen un campo
--  de nombre propio — el tsv se arma con lo que sí hay (lugar/medio,
--  clasificación/contacto) y el título se resuelve en la consulta con un
--  join a lista_tipos, igual que ya hacía la rama de "documento".
--
--  "hallazgo_mantenimiento" es una categoría aparte de "hallazgo"
--  (auditoria_hallazgos, 20260919100000): son dos tablas y dos pantallas
--  distintas: fusionarlas en una sola ruta de resultado sería inventar una
--  equivalencia que el dominio no tiene.
-- ═══════════════════════════════════════════════════════════════════════

-- ── anuncios (EXS-3) ─────────────────────────────────────────────────────
alter table public.anuncios add column busqueda_tsv tsvector generated always as (
  to_tsvector('spanish'::regconfig, public.fn_unaccent_immutable(
    coalesce(titulo, '') || ' ' || coalesce(resumen, '') || ' ' || coalesce(contenido, '')
  ))
) stored;
create index anuncios_busqueda_idx on public.anuncios using gin (busqueda_tsv);

-- ── vehiculos (EXS-5) ────────────────────────────────────────────────────
alter table public.vehiculos add column busqueda_tsv tsvector generated always as (
  to_tsvector('spanish'::regconfig, public.fn_unaccent_immutable(
    coalesce(placa, '') || ' ' || coalesce(marca, '') || ' ' || coalesce(modelo, '') || ' ' ||
    coalesce(color, '')
  ))
) stored;
create index vehiculos_busqueda_idx on public.vehiculos using gin (busqueda_tsv);

-- ── gobierno_organos (GOB-1) ─────────────────────────────────────────────
alter table public.gobierno_organos add column busqueda_tsv tsvector generated always as (
  to_tsvector('spanish'::regconfig, public.fn_unaccent_immutable(
    coalesce(nombre, '') || ' ' || coalesce(reglamento_referencia, '')
  ))
) stored;
create index gobierno_organos_busqueda_idx on public.gobierno_organos using gin (busqueda_tsv);

-- ── gobierno_reuniones (GOB-2) ───────────────────────────────────────────
alter table public.gobierno_reuniones add column busqueda_tsv tsvector generated always as (
  to_tsvector('spanish'::regconfig, public.fn_unaccent_immutable(
    coalesce(lugar, '') || ' ' || coalesce(medio, '') || ' ' || coalesce(cancelada_motivo, '')
  ))
) stored;
create index gobierno_reuniones_busqueda_idx on public.gobierno_reuniones using gin (busqueda_tsv);

-- ── gobierno_decisiones (GOB-5) ──────────────────────────────────────────
alter table public.gobierno_decisiones add column busqueda_tsv tsvector generated always as (
  to_tsvector('spanish'::regconfig, public.fn_unaccent_immutable(
    coalesce(titulo, '') || ' ' || coalesce(descripcion, '') || ' ' || coalesce(fundamento, '')
  ))
) stored;
create index gobierno_decisiones_busqueda_idx on public.gobierno_decisiones using gin (busqueda_tsv);

-- ── mant_ordenes_trabajo (MANT-4) ────────────────────────────────────────
alter table public.mant_ordenes_trabajo add column busqueda_tsv tsvector generated always as (
  to_tsvector('spanish'::regconfig, public.fn_unaccent_immutable(
    coalesce(titulo, '') || ' ' || coalesce(descripcion, '')
  ))
) stored;
create index mant_ordenes_trabajo_busqueda_idx on public.mant_ordenes_trabajo using gin (busqueda_tsv);

-- ── mant_hallazgos (MANT-7) ──────────────────────────────────────────────
alter table public.mant_hallazgos add column busqueda_tsv tsvector generated always as (
  to_tsvector('spanish'::regconfig, public.fn_unaccent_immutable(coalesce(descripcion, '')))
) stored;
create index mant_hallazgos_busqueda_idx on public.mant_hallazgos using gin (busqueda_tsv);

-- ── acciones_cobranza (cartera) ──────────────────────────────────────────
-- tipo_accion/canal quedan fuera del tsv: castear un enum a text dentro de
-- una expresión GENERATED no pasa el chequeo de inmutabilidad de Postgres
-- (aunque el cast en sí lo sea) — se filtran igual por categoría, no hace
-- falta que estén en el texto buscable.
alter table public.acciones_cobranza add column busqueda_tsv tsvector generated always as (
  to_tsvector('spanish'::regconfig, public.fn_unaccent_immutable(
    coalesce(clasificacion_codigo, '') || ' ' || coalesce(destinatario_contacto, '') || ' ' ||
    coalesce(destinatario_rol_codigo, '')
  ))
) stored;
create index acciones_cobranza_busqueda_idx on public.acciones_cobranza using gin (busqueda_tsv);

-- ── solicitudes (GOB-8, PQR) ─────────────────────────────────────────────
alter table public.solicitudes add column busqueda_tsv tsvector generated always as (
  to_tsvector('spanish'::regconfig, public.fn_unaccent_immutable(
    coalesce(asunto, '') || ' ' || coalesce(descripcion, '')
  ))
) stored;
create index solicitudes_busqueda_idx on public.solicitudes using gin (busqueda_tsv);

-- ── fn_buscar_global: 9 ramas UNION ALL nuevas ──────────────────────────
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

    union all

    -- ── anuncios (EXS-3) ──────────────────────────────────────────────
    select
      'anuncio',
      an.id,
      an.titulo,
      (case when an.numero is not null then 'N.º ' || an.numero::text || '/' || an.anio::text
            else 'Borrador' end)
        || ' · ' || initcap(an.estado::text),
      null::uuid,
      ts_rank(an.busqueda_tsv, consulta.tsq)
    from public.anuncios an, consulta
    where (p_categoria is null or p_categoria = 'anuncio')
      and an.tenant_id = p_tenant_id
      and an.busqueda_tsv @@ consulta.tsq

    union all

    -- ── vehiculos (EXS-5) ─────────────────────────────────────────────
    select
      'vehiculo',
      veh.id,
      veh.placa,
      coalesce(nullif(btrim(coalesce(veh.marca, '') || ' ' || coalesce(veh.modelo, '')), ''), 'Vehículo')
        || ' · ' || initcap(veh.estado::text),
      null::uuid,
      ts_rank(veh.busqueda_tsv, consulta.tsq)
    from public.vehiculos veh, consulta
    where (p_categoria is null or p_categoria = 'vehiculo')
      and veh.tenant_id = p_tenant_id
      and veh.busqueda_tsv @@ consulta.tsq

    union all

    -- ── gobierno_organos (GOB-1) ──────────────────────────────────────
    select
      'organo_gobierno',
      go.id,
      coalesce(go.nombre, lt_organo.nombre),
      lt_organo.nombre || case when go.vigente_hasta is null then ' · Vigente' else ' · Terminado' end,
      null::uuid,
      ts_rank(go.busqueda_tsv, consulta.tsq)
    from public.gobierno_organos go
    left join public.lista_tipos lt_organo on lt_organo.id = go.tipo_id
    cross join consulta
    where (p_categoria is null or p_categoria = 'organo_gobierno')
      and go.tenant_id = p_tenant_id
      and go.busqueda_tsv @@ consulta.tsq

    union all

    -- ── gobierno_reuniones (GOB-2) ────────────────────────────────────
    select
      'reunion_gobierno',
      gr.id,
      coalesce(lt_reunion.nombre, 'Reunión') || ' · ' || to_char(gr.fecha_hora, 'DD/MM/YYYY'),
      initcap(gr.estado::text) || case when gr.lugar is not null then ' · ' || gr.lugar else '' end,
      null::uuid,
      ts_rank(gr.busqueda_tsv, consulta.tsq)
    from public.gobierno_reuniones gr
    left join public.lista_tipos lt_reunion on lt_reunion.id = gr.tipo_id
    cross join consulta
    where (p_categoria is null or p_categoria = 'reunion_gobierno')
      and gr.tenant_id = p_tenant_id
      and gr.busqueda_tsv @@ consulta.tsq

    union all

    -- ── gobierno_decisiones (GOB-5) ───────────────────────────────────
    select
      'decision_gobierno',
      gd.id,
      gd.titulo,
      'N.º ' || gd.numero::text || '/' || gd.anio::text || ' · ' || initcap(gd.estado::text),
      null::uuid,
      ts_rank(gd.busqueda_tsv, consulta.tsq)
    from public.gobierno_decisiones gd, consulta
    where (p_categoria is null or p_categoria = 'decision_gobierno')
      and gd.tenant_id = p_tenant_id
      and gd.busqueda_tsv @@ consulta.tsq

    union all

    -- ── mant_ordenes_trabajo (MANT-4) ─────────────────────────────────
    select
      'orden_trabajo',
      ot.id,
      ot.titulo,
      'OT ' || ot.numero::text || '/' || ot.anio::text || ' · ' || initcap(replace(ot.estado::text, '_', ' ')),
      null::uuid,
      ts_rank(ot.busqueda_tsv, consulta.tsq)
    from public.mant_ordenes_trabajo ot, consulta
    where (p_categoria is null or p_categoria = 'orden_trabajo')
      and ot.tenant_id = p_tenant_id
      and ot.busqueda_tsv @@ consulta.tsq

    union all

    -- ── mant_hallazgos (MANT-7) — distinta de "hallazgo" (auditoría) ──
    select
      'hallazgo_mantenimiento',
      mh.id,
      mh.descripcion,
      initcap(mh.severidad::text) || ' · ' || initcap(replace(mh.estado::text, '_', ' ')),
      null::uuid,
      ts_rank(mh.busqueda_tsv, consulta.tsq)
    from public.mant_hallazgos mh, consulta
    where (p_categoria is null or p_categoria = 'hallazgo_mantenimiento')
      and mh.tenant_id = p_tenant_id
      and mh.busqueda_tsv @@ consulta.tsq

    union all

    -- ── acciones_cobranza (cartera) ───────────────────────────────────
    select
      'accion_cobranza',
      ac.id,
      initcap(replace(ac.tipo_accion::text, '_', ' ')) || ' · ' || initcap(ac.canal::text),
      ac.clasificacion_codigo || ' · ' || ac.dias_mora_al_momento::text || ' días de mora',
      ac.inmueble_id,
      ts_rank(ac.busqueda_tsv, consulta.tsq)
    from public.acciones_cobranza ac, consulta
    where (p_categoria is null or p_categoria = 'accion_cobranza')
      and ac.tenant_id = p_tenant_id
      and ac.busqueda_tsv @@ consulta.tsq

    union all

    -- ── solicitudes (GOB-8, PQR) ──────────────────────────────────────
    select
      'solicitud',
      sol.id,
      sol.asunto,
      'N.º ' || sol.numero::text || '/' || sol.anio::text || ' · ' || initcap(replace(sol.estado::text, '_', ' ')),
      sol.inmueble_id,
      ts_rank(sol.busqueda_tsv, consulta.tsq)
    from public.solicitudes sol, consulta
    where (p_categoria is null or p_categoria = 'solicitud')
      and sol.tenant_id = p_tenant_id
      and sol.busqueda_tsv @@ consulta.tsq
  ) resultados
  order by resultados.rank desc
  limit p_limite;
$$;

comment on function public.fn_buscar_global is
  'Búsqueda unificada — UNION ALL con ranking sobre terceros/inmuebles/documentos/novedades/'
  'conceptos/presupuesto_cuenta/casos_juridicos/agrupaciones/zonas_comunes/auditoria_riesgos/'
  'auditoria_controles/auditoria_hallazgos/auditoria_evidencias/anuncios/vehiculos/'
  'gobierno_organos/gobierno_reuniones/gobierno_decisiones/mant_ordenes_trabajo/mant_hallazgos/'
  'acciones_cobranza/solicitudes (20260934020000). p_categoria filtra una rama; null busca en '
  'las veintidós. subtitulo trae texto ya resuelto para que el cliente no tenga que hacer una '
  'consulta aparte por resultado.';

revoke execute on function public.fn_buscar_global(uuid, text, text, int) from public, anon;
grant execute on function public.fn_buscar_global(uuid, text, text, int) to authenticated;
