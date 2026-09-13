-- ═══════════════════════════════════════════════════════════════════════
--  Mantenimiento → Activos, Fase 1 (Registro Maestro) — PROMPT_IMPLEMENTACION_
--  MANTENIMIENTO_ACTIVOS_AQUILA.md §8. Ver DECISIONES.md D-88.
--
--  mant_activos_listado(tenant_id): una fila por activo con TODO lo que la
--  tabla/KPIs del registro maestro necesitan, para evitar dos problemas
--  reales de hacerlo desde el cliente:
--
--   1) N+1: `mant_criticidad(activo_id)` es por-activo y **lanza excepción**
--      si al activo le falta evaluar algún criterio del set vigente (diseño
--      deliberado de MANT-1, ver su comentario) — llamarla 128 veces para
--      listar 128 activos no solo sería lento, tumbaría el listado entero
--      en cuanto UNO no tenga evaluación completa. Aquí se calcula la misma
--      fórmula (Σ peso×puntaje/100 contra el set vigente) en conjunto,
--      devolviendo banda = null para el que le falte algo, en vez de fallar.
--   2) Reutilización real, no reinvención: el valor neto/depreciación NO se
--      recalcula aquí — viene de `mant_ppe_por_activo` (MANT-0), llamada tal
--      cual. Solo se agregan aquí las dos cosas que de verdad no existían
--      en ninguna función: último mantenimiento (MAX(cerrada_at) de
--      mant_ordenes_trabajo) y próximo (MIN(fecha_programada) de
--      mant_programaciones pendientes).
--
--  security invoker (default, explícito): hereda el RLS normal de cada
--  tabla que toca (is_member para todas) — no se salta nada.
-- ═══════════════════════════════════════════════════════════════════════

create function public.mant_activos_listado(p_tenant_id uuid)
returns table (
  id                        uuid,
  codigo                    text,
  nombre                    text,
  categoria_nombre          text,
  tipo_nombre               text,
  ubicacion                 text,
  estado                    public.activo_estado_t,
  capitalizado              boolean,
  criticidad_banda          text,
  vida_util_meses           integer,
  vida_util_restante_meses  integer,
  valor_neto                numeric(18, 2),
  ultimo_mantenimiento      date,
  proximo_mantenimiento     date
)
language sql
stable
security invoker
set search_path = ''
as $$
  with set_vigente as (
    select s.id from public.mant_criticidad_set s
    where s.tenant_id = p_tenant_id and s.estado = 'vigente'
  ),
  total_criterios as (
    select count(*) as n from public.mant_criticidad_criterio c
    where c.set_id = (select sv.id from set_vigente sv)
  ),
  puntajes as (
    select
      e.activo_id,
      sum(c.peso * e.puntaje / 100) as puntaje_total,
      count(*) as evaluados
    from public.mant_activo_criticidad e
    join public.mant_criticidad_criterio c on c.id = e.criterio_id
    where c.set_id = (select sv.id from set_vigente sv)
    group by e.activo_id
  ),
  banda_por_activo as (
    select
      p.activo_id,
      (
        select b.etiqueta from public.mant_criticidad_banda b
        where b.set_id = (select sv.id from set_vigente sv)
          and p.puntaje_total >= b.puntaje_desde
          and (b.puntaje_hasta is null or p.puntaje_total <= b.puntaje_hasta)
        order by b.orden
        limit 1
      ) as banda
    from puntajes p
    where (select tc.n from total_criterios tc) > 0
      and p.evaluados = (select tc.n from total_criterios tc)
  ),
  ultimos_ot as (
    select ot.activo_id, max(ot.cerrada_at)::date as ultimo
    from public.mant_ordenes_trabajo ot
    where ot.tenant_id = p_tenant_id and ot.activo_id is not null and ot.cerrada_at is not null
    group by ot.activo_id
  ),
  proximas_prog as (
    select pr.activo_id, min(pr.fecha_programada) as proximo
    from public.mant_programaciones pr
    where pr.tenant_id = p_tenant_id and pr.estado = 'pendiente'
    group by pr.activo_id
  )
  select
    a.id, a.codigo, a.nombre,
    cat.nombre, tip.nombre,
    coalesce(
      nullif(
        trim(both ' · ' from
          coalesce(ag.nombre, '') || case when ag.nombre is not null and z.nombre is not null then ' · ' else '' end
          || coalesce(z.nombre, '')
        ),
        ''
      ),
      a.ubicacion_detalle
    ) as ubicacion,
    a.estado, a.capitalizado,
    bpa.banda,
    a.vida_util_meses,
    case
      when a.vida_util_meses is not null and a.fecha_puesta_servicio is not null then
        a.vida_util_meses - (
          extract(year from age(current_date, a.fecha_puesta_servicio))::integer * 12
          + extract(month from age(current_date, a.fecha_puesta_servicio))::integer
        )
      else null
    end as vida_util_restante_meses,
    ppe.valor_neto,
    uot.ultimo,
    pp.proximo
  from public.activos a
  left join public.lista_tipos cat on cat.id = a.categoria_id
  left join public.lista_tipos tip on tip.id = a.tipo_id
  left join public.agrupaciones ag on ag.id = a.agrupacion_id
  left join public.zonas_comunes z on z.id = a.zona_comun_id
  left join banda_por_activo bpa on bpa.activo_id = a.id
  left join public.mant_ppe_por_activo(p_tenant_id, current_date) ppe on ppe.activo_id = a.id
  left join ultimos_ot uot on uot.activo_id = a.id
  left join proximas_prog pp on pp.activo_id = a.id
  where a.tenant_id = p_tenant_id
  order by a.codigo;
$$;

comment on function public.mant_activos_listado(uuid) is
  'Registro maestro de activos (PROMPT_IMPLEMENTACION_MANTENIMIENTO_ACTIVOS_AQUILA.md §8, D-88): '
  'una fila por activo con nombres ya resueltos, criticidad en conjunto (banda = null si el set '
  'vigente no tiene evaluación completa, nunca lanza), valor neto vía mant_ppe_por_activo (no '
  'recalculado aquí) y último/próximo mantenimiento agregados de mant_ordenes_trabajo/'
  'mant_programaciones. security invoker: mismo RLS que cada tabla ya tiene.';

revoke execute on function public.mant_activos_listado(uuid) from public, anon;
grant execute on function public.mant_activos_listado(uuid) to authenticated, service_role;
