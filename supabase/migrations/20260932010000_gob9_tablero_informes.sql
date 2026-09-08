-- ═══════════════════════════════════════════════════════════════════════
--  GOB-9 (7/7) · Tablero de gobierno e informes de gestión
--  Ver GOB_09_comunicaciones_workflow.md §3.4-3.5, prueba 10.
--
--  gobierno_tablero_resumen() y gobierno_informe_gestion() son las ÚNICAS
--  dos funciones que gobierno/tablero.vue y sus exportadores llaman —
--  ambas componen exclusivamente funciones ya expuestas por cada corte
--  (gobierno_decision_ejecucion de GOB-5, y las agregadas en
--  20260931990000/20260932000000 para GOB-1/4/6/7/8). Prueba 10: el
--  tablero (frontend) no hace una sola consulta propia sobre tablas de
--  otro corte — un solo RPC.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Compromisos por responsable (dueño conceptual: GOB-5) ───────────────
create function public.gobierno_compromisos_pendientes(p_tenant_id uuid)
returns table (
  compromiso_id  uuid,
  decision_id    uuid,
  titulo         text,
  responsable    text,
  estado         public.gobierno_compromiso_estado_t,
  fecha_limite   date,
  vencido        boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.id,
    c.decision_id,
    c.titulo,
    coalesce(tm.nombre_completo, tt.nombre_completo, 'La administración'),
    c.estado,
    c.fecha_limite,
    (c.estado not in ('cumplido', 'cancelado') and c.fecha_limite is not null and c.fecha_limite < current_date)
  from public.gobierno_compromisos c
  left join public.gobierno_miembros gm on gm.id = c.responsable_miembro_id
  left join public.terceros tm on tm.id = gm.tercero_id
  left join public.terceros tt on tt.id = c.responsable_tercero_id
  where c.tenant_id = p_tenant_id
    and c.estado not in ('cumplido', 'cancelado')
$$;

comment on function public.gobierno_compromisos_pendientes(uuid) is
  'GOB-5 (agregada por GOB-9 §3.4): compromisos activos por responsable resuelto, con su propio '
  'vencido derivado — mismo criterio que gobierno_decision_ejecucion, a nivel de fila en vez de '
  'agregado por decisión.';

-- ── Decisiones vigentes sin compromisos / vencidas ───────────────────────
create function public.gobierno_decisiones_estado(p_tenant_id uuid)
returns table (
  decision_id       uuid,
  titulo            text,
  sin_compromisos   boolean,
  semaforo          text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  return query
  select d.id, d.titulo, (ej.total_compromisos = 0), ej.semaforo
  from public.gobierno_decisiones d
  cross join lateral public.gobierno_decision_ejecucion(d.id) ej
  where d.tenant_id = p_tenant_id;
end;
$$;

comment on function public.gobierno_decisiones_estado(uuid) is
  'GOB-5 (agregada por GOB-9 §3.4): decisiones vigentes sin compromisos, y su semáforo, '
  'reutilizando gobierno_decision_ejecucion(decision_id) — no reimplementa el cálculo.';

-- ── El tablero: una sola función, compone lo ya expuesto ────────────────
create function public.gobierno_tablero_resumen(p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_resultado jsonb;
begin
  select jsonb_build_object(
    'compromisos', (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) from public.gobierno_compromisos_pendientes(p_tenant_id) c),
    'decisiones', (select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) from public.gobierno_decisiones_estado(p_tenant_id) d),
    'expedientes_detenidos', (select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) from public.gobierno_expedientes_detenidos(p_tenant_id) e),
    'solicitudes_sla', (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from public.gobierno_solicitudes_sla_estado(p_tenant_id) s),
    'actas_pendientes', (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) from public.gobierno_actas_pendientes(p_tenant_id) a),
    'impugnaciones_en_tramite', (select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb) from public.gobierno_impugnaciones_en_tramite(p_tenant_id) i),
    'alertas_organo', (select coalesce(jsonb_agg(to_jsonb(al)), '[]'::jsonb) from public.gobierno_organo_alertas(p_tenant_id) al)
  ) into v_resultado;

  return v_resultado;
end;
$$;

comment on function public.gobierno_tablero_resumen(uuid) is
  'GOB-9 §3.4 — el único RPC que gobierno/tablero.vue invoca. Compone exclusivamente funciones ya '
  'expuestas por cada corte (GOB-1, GOB-4 a GOB-8) — prueba estructural 10.';

-- ── Informes de gestión (asamblea/consejo) — mismo jsonb, distinto corte ─
create function public.gobierno_informe_gestion(p_tenant_id uuid, p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_resultado jsonb;
begin
  select jsonb_build_object(
    'periodo', jsonb_build_object('desde', p_desde, 'hasta', p_hasta),
    'decisiones', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', d.id, 'titulo', d.titulo, 'fecha', d.created_at,
        'ejecucion', to_jsonb(ej)
      )), '[]'::jsonb)
      from public.gobierno_decisiones d
      cross join lateral public.gobierno_decision_ejecucion(d.id) ej
      where d.tenant_id = p_tenant_id and d.created_at::date between p_desde and p_hasta
    ),
    'compromisos', (
      select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
      from public.gobierno_compromisos_pendientes(p_tenant_id) c
    ),
    'expedientes_convivencia', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', e.id, 'etapa', e.etapa, 'estado_final', e.estado_final, 'cerrado_at', e.cerrado_at
      )), '[]'::jsonb)
      from public.gobierno_expedientes_convivencia e
      where e.tenant_id = p_tenant_id
        and (e.cerrado_at is null or e.cerrado_at::date between p_desde and p_hasta)
    ),
    'solicitudes', (
      select jsonb_build_object(
        'atendidas', count(*) filter (where s.resuelta_at is not null),
        'abiertas', count(*) filter (where s.resuelta_at is null and s.cerrada_at is null),
        'sla', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.gobierno_solicitudes_sla_estado(p_tenant_id) x)
      )
      from public.solicitudes s
      where s.tenant_id = p_tenant_id and s.created_at::date between p_desde and p_hasta
    ),
    'impugnaciones_en_tramite', (
      select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb) from public.gobierno_impugnaciones_en_tramite(p_tenant_id) i
    )
  ) into v_resultado;

  return v_resultado;
end;
$$;

comment on function public.gobierno_informe_gestion(uuid, date, date) is
  'GOB-9 §3.5 — fuente jsonb de los dos informes exportables (asamblea: corte del período que '
  'elija el usuario; consejo: corte mensual con foco en lo pendiente). Un solo cálculo servidor; '
  'la diferencia entre ambos informes es de presentación en el cliente (rango de fechas y qué '
  'secciones se enfatizan), no de datos — se anexa al paquete de CO-9 cuando exista, sin '
  'depender de él.';
