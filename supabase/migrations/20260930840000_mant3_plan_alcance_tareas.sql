-- ═══════════════════════════════════════════════════════════════════════
--  MANT-3 · Planes de mantenimiento y motor de programación (3/6)
--  Casos de uso/Tres Modulos/Mantenimiento/MANT_03_planes_programacion.md §3.2/§3.5
--
--  mant_plan_activos es la resolución MATERIALIZADA del alcance de un plan
--  a activos concretos — el motor de programación (siguiente archivo) la
--  consume tal cual, sin volver a resolver el alcance en cada corrida.
--  Solo la escribe fn_mant_resolver_alcance_plan (SECURITY DEFINER): sin
--  policy de insert/update/delete para authenticated, mismo criterio que
--  las filas semilla de mant_requisito.
--
--  mant_previsualizar_alcance es de solo lectura, para que el editor de
--  plan (§3.5 "cuántos activos quedan cubiertos") pueda mostrar el conteo
--  ANTES de guardar, sin tocar mant_plan_activos.
-- ═══════════════════════════════════════════════════════════════════════

create table public.mant_plan_activos (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  plan_id     uuid not null references public.mant_planes (id) on delete cascade,
  activo_id   uuid not null references public.activos (id),
  resuelto_at timestamptz not null default now(),

  constraint mant_plan_activos_unico unique (plan_id, activo_id)
);

create index mant_plan_activos_tenant_idx on public.mant_plan_activos (tenant_id);
create index mant_plan_activos_activo_idx on public.mant_plan_activos (activo_id);

alter table public.mant_plan_activos enable row level security;
alter table public.mant_plan_activos force row level security;

comment on table public.mant_plan_activos is
  'MANT-3 §3.2: resolución materializada de mant_planes.alcance a activos concretos — el motor '
  'de programación la consume directamente. Solo la escribe fn_mant_resolver_alcance_plan '
  '(SECURITY DEFINER); sin policy de escritura para authenticated.';

create policy mant_plan_activos_select_miembro
  on public.mant_plan_activos for select
  to authenticated
  using (public.is_member(tenant_id));

create table public.mant_plan_tareas (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references public.tenants (id) on delete cascade,
  plan_id                  uuid not null references public.mant_planes (id) on delete cascade,
  orden                    integer not null,
  descripcion              text not null,
  duracion_estimada_min    integer,
  requiere_medicion        boolean not null default false,
  requiere_evidencia_foto  boolean not null default false,
  -- MANT-6 no existe todavía: sin FK a propósito (mismo criterio que contrato_id en mant_planes).
  repuesto_previsto_id     uuid,
  cantidad_prevista        numeric(18, 2),
  created_at               timestamptz not null default now(),

  constraint mant_plan_tareas_orden_unico unique (plan_id, orden),
  constraint mant_plan_tareas_descripcion_no_vacia check (btrim(descripcion) <> ''),
  constraint mant_plan_tareas_cantidad_valida check (cantidad_prevista is null or cantidad_prevista > 0)
);

create index mant_plan_tareas_tenant_idx on public.mant_plan_tareas (tenant_id);
create index mant_plan_tareas_plan_idx on public.mant_plan_tareas (plan_id);

alter table public.mant_plan_tareas enable row level security;
alter table public.mant_plan_tareas force row level security;

comment on table public.mant_plan_tareas is
  'MANT-3 §3.2: actividades ordenadas de un plan. repuesto_previsto_id queda sin FK — MANT-6 '
  '(inventario de repuestos) no existe todavía.';

create policy mant_plan_tareas_select_miembro
  on public.mant_plan_tareas for select
  to authenticated
  using (public.is_member(tenant_id));

create policy mant_plan_tareas_insert_auxiliar
  on public.mant_plan_tareas for insert
  to authenticated
  with check (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and exists (select 1 from public.mant_planes p where p.id = plan_id and p.tenant_id = mant_plan_tareas.tenant_id)
  );

create policy mant_plan_tareas_update_auxiliar
  on public.mant_plan_tareas for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy mant_plan_tareas_delete_auxiliar
  on public.mant_plan_tareas for delete
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

-- ── Previsualización de alcance (solo lectura, §3.5) ─────────────────────
create function public.mant_previsualizar_alcance(
  p_tenant_id uuid,
  p_alcance public.plan_alcance_t,
  p_activo_id uuid default null,
  p_tipo_activo_id bigint default null,
  p_categoria_id bigint default null,
  p_agrupacion_id uuid default null,
  p_zona_comun_id uuid default null
)
returns setof public.activos
language sql
stable
security invoker
set search_path = ''
as $$
  select a.* from public.activos a
  where a.tenant_id = p_tenant_id
    and (
      (p_alcance = 'activo' and a.id = p_activo_id)
      or (p_alcance = 'tipo_activo' and a.tipo_id = p_tipo_activo_id)
      or (p_alcance = 'categoria' and a.categoria_id = p_categoria_id)
      or (p_alcance = 'ubicacion' and (
            (p_agrupacion_id is not null and a.agrupacion_id = p_agrupacion_id)
         or (p_zona_comun_id is not null and a.zona_comun_id = p_zona_comun_id)
          ))
    )
$$;

comment on function public.mant_previsualizar_alcance(uuid, public.plan_alcance_t, uuid, bigint, bigint, uuid, uuid) is
  'MANT-3 §3.5: cuántos/cuáles activos cubriría un alcance ANTES de guardar el plan — solo '
  'lectura, respeta RLS del invocador (security invoker), no toca mant_plan_activos.';

-- ── Resolución materializada (§3.2, escrita solo por esta función) ───────
create function public.fn_mant_resolver_alcance_plan(p_plan_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.mant_planes%rowtype;
  v_total integer;
begin
  select * into v_plan from public.mant_planes where id = p_plan_id;
  if v_plan.id is null then
    raise exception 'PLAN_INEXISTENTE: %', p_plan_id;
  end if;

  delete from public.mant_plan_activos where plan_id = p_plan_id;

  insert into public.mant_plan_activos (tenant_id, plan_id, activo_id)
  select v_plan.tenant_id, p_plan_id, a.id
  from public.activos a
  where a.tenant_id = v_plan.tenant_id
    and (
      (v_plan.alcance = 'activo' and a.id = v_plan.alcance_activo_id)
      or (v_plan.alcance = 'tipo_activo' and a.tipo_id = v_plan.alcance_tipo_activo_id)
      or (v_plan.alcance = 'categoria' and a.categoria_id = v_plan.alcance_categoria_id)
      or (v_plan.alcance = 'ubicacion' and (
            (v_plan.alcance_agrupacion_id is not null and a.agrupacion_id = v_plan.alcance_agrupacion_id)
         or (v_plan.alcance_zona_comun_id is not null and a.zona_comun_id = v_plan.alcance_zona_comun_id)
          ))
    );

  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

comment on function public.fn_mant_resolver_alcance_plan(uuid) is
  'MANT-3 §3.2: recalcula mant_plan_activos desde mant_planes.alcance (borra e inserta — nunca '
  'acumula). Llamada por fn_mant_activar_plan y al inicio de cada corrida de '
  'fn_mant_generar_programaciones, nunca directo por un cliente (sin grant a authenticated: se '
  'invoca desde otra función SECURITY DEFINER del mismo dueño).';

revoke execute on function public.fn_mant_resolver_alcance_plan(uuid) from public, anon, authenticated;
