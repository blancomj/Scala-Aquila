-- ═══════════════════════════════════════════════════════════════════════
--  MANT-8 · Indicadores y tendencias de mantenimiento (1/4)
--  Casos de uso/Tres Modulos/Mantenimiento/MANT_08_indicadores_tendencias.md §3.1
--
--  Indicadores operativos — todos en función pura, ninguno persistido (§3.4:
--  primero se mide con explain analyze, solo si la medición lo exige se
--  materializa; ver MANT_08_INFORME.md).
--
--  MTTR/OT a tiempo se miden en horas/días CORRIDOS, no hábiles: el repo ya
--  tiene un motor de días hábiles (GOB-4, gobierno_es_dia_habil y afines),
--  pero es de granularidad DÍA (festivos/fines de semana), no de horario
--  laboral dentro del día — no existe en ningún punto del modelo un
--  "horario laboral" (hora de apertura/cierre) por tenant. Definir MTTR en
--  "horas hábiles" exigiría inventar esa política, fuera del alcance de
--  este corte (que es de indicadores, no de un motor de horario laboral).
--  Documentado como decisión de alcance, no como omisión.
-- ═══════════════════════════════════════════════════════════════════════

-- ── MTTR: tiempo medio entre el reporte de la incidencia y el cierre de la OT ──
create function public.mant_indicador_mttr(
  p_tenant_id uuid, p_desde date, p_hasta date, p_activo_id uuid default null
)
returns table (mttr_horas numeric, muestras int)
language sql
stable
set search_path = ''
as $$
  select
    avg(extract(epoch from (ot.cerrada_at - i.reportada_at)) / 3600.0) as mttr_horas,
    count(*)::int as muestras
  from public.mant_incidencias i
  join public.mant_ordenes_trabajo ot on ot.id = i.orden_trabajo_id
  where i.tenant_id = p_tenant_id
    and ot.tenant_id = p_tenant_id
    and ot.cerrada_at is not null
    and ot.cerrada_at::date between p_desde and p_hasta
    and (p_activo_id is null or i.activo_id = p_activo_id);
$$;

comment on function public.mant_indicador_mttr(uuid, date, date, uuid) is
  'MANT-8 §3.1: MTTR = promedio de horas CORRIDAS entre mant_incidencias.reportada_at (apertura) y '
  'mant_ordenes_trabajo.cerrada_at (cierre de la OT que resolvió la incidencia), sobre OT cerradas '
  'en el rango [p_desde, p_hasta]. Sin muestras, mttr_horas es null (dato insuficiente, no cero). '
  'p_activo_id opcional filtra a un solo activo (reutilizado por mant_tendencia_fallas).';

-- ── MTBF: tiempo medio entre fallas consecutivas de un mismo activo ──
create function public.mant_indicador_mtbf(
  p_tenant_id uuid, p_activo_id uuid, p_desde date, p_hasta date
)
returns table (mtbf_horas numeric, fallas int)
language sql
stable
set search_path = ''
as $$
  with fallas as (
    select reportada_at
    from public.mant_incidencias
    where tenant_id = p_tenant_id
      and activo_id = p_activo_id
      and estado <> 'descartada'
      and reportada_at::date between p_desde and p_hasta
  ),
  ordenadas as (
    select reportada_at, lag(reportada_at) over (order by reportada_at) as anterior
    from fallas
  )
  select
    avg(extract(epoch from (reportada_at - anterior)) / 3600.0) as mtbf_horas,
    (select count(*) from fallas)::int as fallas
  from ordenadas
  where anterior is not null;
$$;

comment on function public.mant_indicador_mtbf(uuid, uuid, date, date) is
  'MANT-8 §3.1: MTBF = promedio de horas corridas entre fallas consecutivas de UN activo '
  '(mant_incidencias.reportada_at, excluidas las descartadas) en el rango. Con 0 o 1 falla en el '
  'rango, mtbf_horas es null — se necesitan al menos 2 fallas para medir un intervalo.';

-- ── Disponibilidad: proporción del rango con el activo en_servicio ──
create function public.mant_indicador_disponibilidad(
  p_tenant_id uuid, p_activo_id uuid, p_desde date, p_hasta date
)
returns table (disponibilidad_pct numeric, horas_cubiertas numeric)
language sql
stable
set search_path = ''
as $$
  with periodo as (
    select p_desde::timestamptz as inicio, (p_hasta::timestamptz + interval '1 day') as fin
  ),
  historial as (
    select
      estado_nuevo,
      created_at,
      lead(created_at) over (order by created_at) as siguiente
    from public.activo_estado_historial
    where tenant_id = p_tenant_id and activo_id = p_activo_id
  ),
  recortado as (
    select
      h.estado_nuevo,
      greatest(h.created_at, per.inicio) as desde,
      least(coalesce(h.siguiente, per.fin), per.fin) as hasta
    from historial h, periodo per
    where coalesce(h.siguiente, per.fin) > per.inicio
      and h.created_at < per.fin
  )
  select
    case
      when sum(extract(epoch from (hasta - desde))) > 0 then
        round(
          100.0 * sum(extract(epoch from (hasta - desde))) filter (where estado_nuevo = 'en_servicio')
          / sum(extract(epoch from (hasta - desde))), 1)
      else null
    end as disponibilidad_pct,
    round(sum(extract(epoch from (hasta - desde))) / 3600.0, 1) as horas_cubiertas
  from recortado;
$$;

comment on function public.mant_indicador_disponibilidad(uuid, uuid, date, date) is
  'MANT-8 §3.1: % del rango [p_desde, p_hasta] con activo_estado_historial.estado_nuevo = '
  '''en_servicio'', reconstruyendo intervalos entre transiciones consecutivas (append-only, MANT-0). '
  'Sin ninguna transición registrada que toque el rango, disponibilidad_pct es null (dato '
  'insuficiente) — no se asume ningún estado por defecto antes de la primera transición.';

-- ── Ayuda: estado de un activo a una fecha dada (último historial <= fecha, o el actual si no hay) ──
create function public.mant_activo_estado_en(p_tenant_id uuid, p_activo_id uuid, p_fecha date)
returns public.activo_estado_t
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select estado_nuevo from public.activo_estado_historial
     where tenant_id = p_tenant_id and activo_id = p_activo_id and created_at::date <= p_fecha
     order by created_at desc limit 1),
    (select estado from public.activos where id = p_activo_id and tenant_id = p_tenant_id)
  );
$$;

comment on function public.mant_activo_estado_en(uuid, uuid, date) is
  'MANT-8: estado de un activo a una fecha — último activo_estado_historial en o antes de p_fecha, '
  'o activos.estado si todavía no tiene ninguna transición registrada. Usada por '
  'mant_indicador_cumplimiento_plan para no penalizar programaciones omitidas por activo fuera de '
  'servicio, verificado contra el historial real en vez de confiar en el texto libre de '
  'omitida_motivo.';

-- ── Cumplimiento del plan: ejecutadas sobre programadas, sin penalizar activo fuera de servicio ──
create function public.mant_indicador_cumplimiento_plan(p_tenant_id uuid, p_desde date, p_hasta date)
returns table (programadas int, ejecutadas int, excluidas_activo_no_disponible int, pct numeric)
language sql
stable
set search_path = ''
as $$
  with base as (
    select
      p.estado,
      (public.mant_activo_estado_en(p_tenant_id, p.activo_id, p.fecha_programada) <> 'en_servicio') as activo_no_disponible
    from public.mant_programaciones p
    where p.tenant_id = p_tenant_id
      and p.fecha_programada between p_desde and p_hasta
  ),
  elegibles as (
    select * from base where not (estado = 'omitida' and activo_no_disponible)
  )
  select
    (select count(*) from elegibles)::int,
    (select count(*) from elegibles where estado = 'generada')::int,
    (select count(*) from base where estado = 'omitida' and activo_no_disponible)::int,
    case when (select count(*) from elegibles) = 0 then null
      else round(100.0 * (select count(*) from elegibles where estado = 'generada')
                  / (select count(*) from elegibles), 1)
    end;
$$;

comment on function public.mant_indicador_cumplimiento_plan(uuid, date, date) is
  'MANT-8 §3.1/prueba 8: programaciones con estado ''generada'' sobre el total programado en el '
  'rango — excluye del total (no penaliza) las ''omitida'' cuyo activo estaba fuera de '
  '''en_servicio'' según mant_activo_estado_en a la fecha_programada (verificado contra el '
  'historial real, no contra omitida_motivo en texto libre).';

-- ── OT cerradas a tiempo, contra su fecha_limite ──
create function public.mant_indicador_ot_a_tiempo(p_tenant_id uuid, p_desde date, p_hasta date)
returns table (cerradas int, a_tiempo int, pct numeric)
language sql
stable
set search_path = ''
as $$
  with base as (
    select cerrada_at, fecha_limite
    from public.mant_ordenes_trabajo
    where tenant_id = p_tenant_id
      and estado = 'cerrada'
      and cerrada_at is not null
      and fecha_limite is not null
      and cerrada_at::date between p_desde and p_hasta
  )
  select
    count(*)::int,
    count(*) filter (where cerrada_at::date <= fecha_limite)::int,
    case when count(*) = 0 then null
      else round(100.0 * count(*) filter (where cerrada_at::date <= fecha_limite) / count(*), 1)
    end
  from base;
$$;

comment on function public.mant_indicador_ot_a_tiempo(uuid, date, date) is
  'MANT-8 §3.1: de las OT cerradas en el rango CON fecha_limite definida, proporción cerrada en o '
  'antes de esa fecha. Una OT cerrada sin fecha_limite (nunca se le fijó) no entra al cálculo — no '
  'hay contra qué compararla.';

-- ── Proporción preventivo/correctivo (y demás TIPO_MANTENIMIENTO) ──
create function public.mant_indicador_proporcion_mantenimiento(p_tenant_id uuid, p_desde date, p_hasta date)
returns table (tipo_id bigint, tipo_codigo text, tipo_nombre text, cantidad int)
language sql
stable
set search_path = ''
as $$
  select ot.tipo_mantenimiento_id, lt.codigo, lt.nombre, count(*)::int
  from public.mant_ordenes_trabajo ot
  join public.lista_tipos lt on lt.id = ot.tipo_mantenimiento_id
  where ot.tenant_id = p_tenant_id
    and ot.estado <> 'cancelada'
    and ot.created_at::date between p_desde and p_hasta
  group by ot.tipo_mantenimiento_id, lt.codigo, lt.nombre;
$$;

comment on function public.mant_indicador_proporcion_mantenimiento(uuid, date, date) is
  'MANT-8 §3.1: OT no canceladas creadas en el rango, agrupadas por su TIPO_MANTENIMIENTO '
  '(lista_tipos: preventivo/correctivo/predictivo/reglamentario/mejora, MANT-3). La fecha de '
  'anclaje es created_at (cuándo se abrió la OT), no fecha_programada ni cerrada_at.';
