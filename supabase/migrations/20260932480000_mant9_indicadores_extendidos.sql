-- ═══════════════════════════════════════════════════════════════════════
--  MANT-9 · Salud del activo y apoyo a la decisión (4/7)
--  Casos de uso/Tres Modulos/Mantenimiento/MANT_09_salud_decision.md §3.1
--
--  mant_indicador_cumplimiento_plan y mant_indicador_ot_a_tiempo (MANT-8,
--  20260932400000) nacieron tenant-wide — MANT-9 necesita "cumplimiento
--  del plan"/"OT a tiempo" COMO FACTOR de un activo individual. Se
--  extienden con p_activo_id opcional (default null = comportamiento
--  tenant-wide sin cambios, mismo patrón que mant_indicador_mttr) en vez
--  de duplicar la lógica en una función nueva de MANT-9 — reproduciendo el
--  cuerpo COMPLETO y vigente de cada una (no una versión desactualizada;
--  lección MANT-2/GOB-1/CO-8 aplicada desde el origen).
-- ═══════════════════════════════════════════════════════════════════════

-- create or replace no basta: cambiar la firma (agregar p_activo_id) crea un SEGUNDO overload en
-- vez de reemplazar el original de MANT-8 (3 args), dejando una llamada con 3 args ambigua entre
-- ambos. Hay que tumbar la firma vieja explícitamente antes de crear la nueva.
drop function if exists public.mant_indicador_cumplimiento_plan(uuid, date, date);
drop function if exists public.mant_indicador_ot_a_tiempo(uuid, date, date);

create or replace function public.mant_indicador_cumplimiento_plan(
  p_tenant_id uuid, p_desde date, p_hasta date, p_activo_id uuid default null
)
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
      and (p_activo_id is null or p.activo_id = p_activo_id)
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

comment on function public.mant_indicador_cumplimiento_plan(uuid, date, date, uuid) is
  'MANT-8 §3.1/prueba 8, extendida por MANT-9 §3.1 con p_activo_id opcional (default null = '
  'tenant-wide, sin cambio de comportamiento): programaciones con estado ''generada'' sobre el '
  'total programado en el rango — excluye del total (no penaliza) las ''omitida'' cuyo activo '
  'estaba fuera de ''en_servicio'' según mant_activo_estado_en a la fecha_programada.';

create or replace function public.mant_indicador_ot_a_tiempo(
  p_tenant_id uuid, p_desde date, p_hasta date, p_activo_id uuid default null
)
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
      and (p_activo_id is null or activo_id = p_activo_id)
  )
  select
    count(*)::int,
    count(*) filter (where cerrada_at::date <= fecha_limite)::int,
    case when count(*) = 0 then null
      else round(100.0 * count(*) filter (where cerrada_at::date <= fecha_limite) / count(*), 1)
    end
  from base;
$$;

comment on function public.mant_indicador_ot_a_tiempo(uuid, date, date, uuid) is
  'MANT-8 §3.1, extendida por MANT-9 §3.1 con p_activo_id opcional (default null = tenant-wide, '
  'sin cambio de comportamiento): de las OT cerradas en el rango CON fecha_limite definida, '
  'proporción cerrada en o antes de esa fecha.';
