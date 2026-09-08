-- ═══════════════════════════════════════════════════════════════════════
--  GOB-5 · gobierno_decision_ejecucion — estado de ejecución DERIVADO
--  Ver GOB_05_decision_compromisos.md §4.3, prueba 4 y 6.
--
--  Ninguna columna de gobierno_decisiones almacena avance/semáforo/estado
--  de ejecución (marco §6.3) — todo se calcula aquí, en cada llamada, a
--  partir de gobierno_compromisos. cancelado se excluye del denominador de
--  porcentaje_avance/estado_ejecucion: un compromiso cancelado no cuenta
--  ni a favor ni en contra del cumplimiento de la decisión (decisión de
--  diseño, documentada en el informe — el spec no fija el tratamiento
--  exacto de cancelado).
-- ═══════════════════════════════════════════════════════════════════════

create function public.gobierno_decision_ejecucion(p_decision_id uuid)
returns table (
  total_compromisos integer,
  cumplidos         integer,
  en_progreso       integer,
  bloqueados        integer,
  vencidos          integer,
  cancelados        integer,
  porcentaje_avance numeric,
  semaforo          text,
  estado_ejecucion  text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_tenant_id      uuid;
  v_dias_umbral    integer;
  v_total          integer;
  v_activos        integer;
  v_cumplidos      integer;
  v_en_progreso    integer;
  v_bloqueados     integer;
  v_cancelados     integer;
  v_vencidos       integer;
  v_proximo_vencer boolean;
begin
  select tenant_id into v_tenant_id from public.gobierno_decisiones where id = p_decision_id;

  select coalesce(
    (select p.dias_proximo_vencer from public.fn_gobierno_politica_semaforo_vigente(v_tenant_id) p),
    5
  ) into v_dias_umbral;

  select
    count(*),
    count(*) filter (where c.estado = 'cumplido'),
    count(*) filter (where c.estado = 'en_progreso'),
    count(*) filter (where c.estado = 'bloqueado'),
    count(*) filter (where c.estado = 'cancelado'),
    count(*) filter (
      where c.estado not in ('cumplido', 'cancelado')
        and c.fecha_limite is not null and c.fecha_limite < current_date
    )
  into v_total, v_cumplidos, v_en_progreso, v_bloqueados, v_cancelados, v_vencidos
  from public.gobierno_compromisos c
  where c.decision_id = p_decision_id;

  v_activos := v_total - v_cancelados;

  select exists (
    select 1 from public.gobierno_compromisos c
    where c.decision_id = p_decision_id
      and c.estado not in ('cumplido', 'cancelado')
      and c.fecha_limite is not null
      and c.fecha_limite >= current_date
      and c.fecha_limite <= current_date + v_dias_umbral
  ) into v_proximo_vencer;

  total_compromisos := v_total;
  cumplidos := v_cumplidos;
  en_progreso := v_en_progreso;
  bloqueados := v_bloqueados;
  vencidos := v_vencidos;
  cancelados := v_cancelados;
  porcentaje_avance :=
    case when v_activos = 0 then 0 else round(v_cumplidos::numeric / v_activos * 100, 2) end;

  semaforo := case
    when v_bloqueados > 0 then 'bloqueado'
    when v_vencidos > 0 then 'vencido'
    when v_proximo_vencer then 'proximo_vencer'
    else 'en_plazo'
  end;

  estado_ejecucion := case
    when v_total = 0 then 'sin_compromisos'
    when v_bloqueados > 0 then 'bloqueada'
    when v_activos > 0 and v_cumplidos = v_activos then 'cumplida'
    else 'en_ejecucion'
  end;

  return next;
end;
$$;

comment on function public.gobierno_decision_ejecucion(uuid) is
  'GOB-5 §4.3: estado de ejecución de una decisión, calculado en cada llamada desde sus '
  'compromisos — sin ningún job ni columna de estado almacenada (prueba 4). El semáforo cambia '
  'de en_plazo a vencido solo por el paso de current_date, sin que nada lo actualice (prueba 6).';
