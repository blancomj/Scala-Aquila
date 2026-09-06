-- ═══════════════════════════════════════════════════════════════════════
--  MANT-3 · Planes de mantenimiento y motor de programación (5/6)
--  Casos de uso/Tres Modulos/Mantenimiento/MANT_03_planes_programacion.md §3.4
-- ═══════════════════════════════════════════════════════════════════════

-- ── Activación (§3.2): valida tareas (guard_mant_plan ya lo exige en el UPDATE),
-- resuelve alcance y genera la primera tanda de programaciones en un solo paso. ──
create function public.fn_mant_activar_plan(p_plan_id uuid)
returns public.mant_planes
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_plan public.mant_planes%rowtype;
begin
  update public.mant_planes set activo = true where id = p_plan_id
  returning * into v_plan;

  if v_plan.id is null then
    raise exception 'PLAN_INEXISTENTE: %', p_plan_id;
  end if;

  perform public.fn_mant_generar_programaciones(p_plan_id);

  return v_plan;
end;
$$;

comment on function public.fn_mant_activar_plan(uuid) is
  'MANT-3 §3.2: activa un plan (guard_mant_plan exige que ya tenga tareas, '
  'PLAN_SIN_TAREAS si no) y en el mismo paso resuelve su alcance y genera la primera tanda de '
  'programaciones. SECURITY INVOKER: el UPDATE corre con los privilegios del llamador — la RLS '
  'de mant_planes (rol auxiliar) es la única autorización que necesita.';

-- ── Cobertura (§3.4): el hueco que nadie ve — calculada en cada llamada, nunca ──
-- almacenada (mismo criterio que mant_estado_cumplimiento / contable_estado_financiero). No
-- depende de mant_plan_activos ya resuelto: expande el alcance del plan en vivo, así que nunca
-- queda desactualizada aunque el plan no se haya vuelto a activar.
create function public.mant_cobertura_requisitos(p_tenant_id uuid)
returns table (
  requisito_id uuid, requisito_nombre text, activo_id uuid, activo_codigo text,
  plan_id uuid, plan_nombre text, plan_frecuencia_meses integer, cubierto boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with req as (
    select r.id, r.nombre, r.tipo_activo_id, r.frecuencia_meses as frecuencia_exigida
    from public.mant_requisito r
    where r.tenant_id = p_tenant_id and r.activo
  ),
  alcance_requisito as (
    select req.id as requisito_id, req.nombre as requisito_nombre,
           null::uuid as activo_id, null::text as activo_codigo
    from req where req.tipo_activo_id is null
    union all
    select req.id, req.nombre, a.id, a.codigo
    from req
    join public.activos a on a.tenant_id = p_tenant_id and a.tipo_id = req.tipo_activo_id
    where req.tipo_activo_id is not null
  ),
  planes_por_requisito as (
    select p.id as plan_id, p.nombre as plan_nombre, p.frecuencia_meses, p.requisito_id,
           p.alcance, p.alcance_activo_id, p.alcance_tipo_activo_id, p.alcance_categoria_id,
           p.alcance_agrupacion_id, p.alcance_zona_comun_id
    from public.mant_planes p
    where p.tenant_id = p_tenant_id and p.activo and p.requisito_id is not null
  )
  select
    ar.requisito_id, ar.requisito_nombre, ar.activo_id, ar.activo_codigo,
    ppr.plan_id, ppr.plan_nombre, ppr.frecuencia_meses,
    (ppr.plan_id is not null) as cubierto
  from alcance_requisito ar
  left join planes_por_requisito ppr
    on ppr.requisito_id = ar.requisito_id
   and (
     ar.activo_id is null
     or (ppr.alcance = 'activo' and ppr.alcance_activo_id = ar.activo_id)
     or (ppr.alcance = 'tipo_activo' and exists (
           select 1 from public.activos a2 where a2.id = ar.activo_id and a2.tipo_id = ppr.alcance_tipo_activo_id))
     or (ppr.alcance = 'categoria' and exists (
           select 1 from public.activos a2 where a2.id = ar.activo_id and a2.categoria_id = ppr.alcance_categoria_id))
     or (ppr.alcance = 'ubicacion' and exists (
           select 1 from public.activos a2 where a2.id = ar.activo_id
             and ((ppr.alcance_agrupacion_id is not null and a2.agrupacion_id = ppr.alcance_agrupacion_id)
               or (ppr.alcance_zona_comun_id is not null and a2.zona_comun_id = ppr.alcance_zona_comun_id))))
   )
$$;

comment on function public.mant_cobertura_requisitos(uuid) is
  'MANT-3 §3.4: por cada (requisito, activo) aplicable, si hay un plan activo derivado de ese '
  'requisito que lo cubra y con qué frecuencia. Calculado en cada llamada sobre mant_planes '
  'directamente (nunca sobre mant_plan_activos, que es solo el snapshot que consume el motor de '
  'programación) — un plan nuevo aparece cubierto sin depender de que alguien lo haya activado '
  'primero.';
