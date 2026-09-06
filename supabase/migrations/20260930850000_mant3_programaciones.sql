-- ═══════════════════════════════════════════════════════════════════════
--  MANT-3 · Planes de mantenimiento y motor de programación (4/6)
--  Casos de uso/Tres Modulos/Mantenimiento/MANT_03_planes_programacion.md §3.3
--
--  Motor de programación. orden_trabajo_id queda sin FK (MANT-4 no existe
--  todavía): la programación APUNTA a una OT futura, no la crea.
--
--  Política de encadenamiento (D-56, mant_planes.encadenar_desde_ejecucion_real,
--  default true): la SIGUIENTE programación de un (plan, activo) se calcula
--  desde la fecha de EJECUCIÓN REAL de la anterior (generada_at), no desde
--  su fecha_programada teórica — así un mantenimiento tardío no acumula
--  deuda de calendario. Sin ejecución real todavía, se encadena desde la
--  última fecha_programada.
-- ═══════════════════════════════════════════════════════════════════════

create type public.programacion_estado_t as enum ('pendiente', 'generada', 'omitida', 'cancelada');
comment on type public.programacion_estado_t is
  'Ciclo de vida de una fila de calendario (MANT-3 §3.3). Gatilla '
  'guard_mant_programacion_transicion: pendiente es el único estado no terminal — generada/'
  'omitida/cancelada son inmutables (PROGRAMACION_TERMINAL_INMUTABLE). No es vocabulario '
  'descriptivo suelto.';

create table public.mant_programaciones (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  plan_id           uuid not null references public.mant_planes (id),
  activo_id         uuid not null references public.activos (id),
  fecha_programada  date not null,
  ventana_hasta     date not null,
  estado            public.programacion_estado_t not null default 'pendiente',
  -- MANT-4 no existe todavía: sin FK a propósito — la programación APUNTA a una OT futura.
  orden_trabajo_id  uuid,
  omitida_motivo    text,
  generada_at       timestamptz,
  created_at        timestamptz not null default now(),

  -- Idempotencia real: un índice único, no una verificación en código (§3.3).
  constraint mant_programaciones_unica unique (plan_id, activo_id, fecha_programada),
  constraint mant_programaciones_ventana_valida check (ventana_hasta >= fecha_programada)
);

create index mant_programaciones_tenant_idx on public.mant_programaciones (tenant_id);
create index mant_programaciones_activo_idx on public.mant_programaciones (activo_id);
create index mant_programaciones_plan_activo_idx on public.mant_programaciones (plan_id, activo_id, fecha_programada desc);

alter table public.mant_programaciones enable row level security;
alter table public.mant_programaciones force row level security;

comment on table public.mant_programaciones is
  'MANT-3 §3.3: calendario generado por fn_mant_generar_programaciones. orden_trabajo_id sin FK '
  '(MANT-4 no existe) — se puebla cuando esa serie la cree. Idempotente por índice único '
  '(plan_id, activo_id, fecha_programada), nunca por verificación en código.';

create policy mant_programaciones_select_miembro
  on public.mant_programaciones for select
  to authenticated
  using (public.is_member(tenant_id));

create policy mant_programaciones_update_auxiliar
  on public.mant_programaciones for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

-- Sin policy de insert/delete para authenticated: solo fn_mant_generar_programaciones
-- (SECURITY DEFINER) escribe filas nuevas; "cancelar" es un UPDATE de estado, nunca un DELETE.

-- ── Máquina de estados (§3.3) — terminal-inmutable en TODA columna, no solo `estado` ──
create function public.guard_mant_programacion_transicion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.estado in ('generada', 'omitida', 'cancelada') then
    raise exception 'PROGRAMACION_TERMINAL_INMUTABLE: la programación % ya está en estado '
      'terminal (%) y no admite cambios', old.id, old.estado;
  end if;

  if new.estado is distinct from old.estado then
    if new.estado not in ('generada', 'omitida', 'cancelada') then
      raise exception 'PROGRAMACION_TRANSICION_INVALIDA: % -> % no está permitida', old.estado, new.estado;
    end if;
    if new.estado = 'omitida' and (new.omitida_motivo is null or btrim(new.omitida_motivo) = '') then
      raise exception 'PROGRAMACION_OMISION_SIN_MOTIVO: omitir una programación exige omitida_motivo';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.guard_mant_programacion_transicion() is
  'pendiente -> {generada|omitida|cancelada}, nunca al revés; generada/omitida/cancelada son '
  'terminales para CUALQUIER columna (lección de D-54/FIN-1: un guard "before update of estado" '
  'no bastaba, había que bloquear también editar otras columnas tras el estado terminal).';

create trigger mant_programaciones_guard_transicion
  before update on public.mant_programaciones
  for each row execute function public.guard_mant_programacion_transicion();

-- ── Generación (§3.3) ─────────────────────────────────────────────────────
create function public.fn_mant_generar_programaciones(p_plan_id uuid)
returns table (generadas integer, omitidas integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan               public.mant_planes%rowtype;
  v_activo             record;
  v_horizonte_hasta    date;
  v_ultima_programada  date;
  v_ultima_real        date;
  v_ultimo_cumplimiento date;
  v_base               date;
  v_fecha              date;
  v_generadas          integer := 0;
  v_omitidas           integer := 0;
  v_omitidas_ronda     integer;
begin
  select * into v_plan from public.mant_planes where id = p_plan_id;
  if v_plan.id is null then
    raise exception 'PLAN_INEXISTENTE: %', p_plan_id;
  end if;

  -- Sesión real de usuario (auth.uid() no nulo): exige auxiliar/administrador del tenant.
  -- Contexto de confianza (cron, service_role, otra función SECURITY DEFINER propia): sin
  -- sesión, se permite — mismo criterio que cron_cartera_recalcular_diario.
  if (select auth.uid()) is not null
     and not public.has_role(v_plan.tenant_id, array['auxiliar', 'administrador']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: no tienes rol suficiente en este tenant para generar programaciones';
  end if;

  if not v_plan.activo then
    raise exception 'PLAN_INACTIVO: % no está activo, no se generan programaciones', p_plan_id;
  end if;

  perform public.fn_mant_resolver_alcance_plan(p_plan_id);

  v_horizonte_hasta := (current_date + (v_plan.horizonte_meses || ' months')::interval)::date;

  for v_activo in
    select pa.activo_id, a.estado
    from public.mant_plan_activos pa
    join public.activos a on a.id = pa.activo_id
    where pa.plan_id = p_plan_id
  loop
    if v_activo.estado in ('fuera_de_servicio', 'retirado') then
      -- Las pendientes futuras se omiten con motivo, nunca se borran (§3.3).
      update public.mant_programaciones
         set estado = 'omitida', omitida_motivo = 'Activo en estado ' || v_activo.estado
       where plan_id = p_plan_id and activo_id = v_activo.activo_id
         and estado = 'pendiente' and fecha_programada > current_date;
      get diagnostics v_omitidas_ronda = row_count;
      v_omitidas := v_omitidas + v_omitidas_ronda;
      continue;
    end if;

    select max(fecha_programada) into v_ultima_programada
    from public.mant_programaciones
    where plan_id = p_plan_id and activo_id = v_activo.activo_id and estado <> 'cancelada';

    if v_ultima_programada is not null then
      -- Ya hay historial: encadenar desde la ejecución real (si la política lo pide y existe)
      -- o, en su defecto, desde la última fecha programada.
      v_ultima_real := null;
      if v_plan.encadenar_desde_ejecucion_real then
        select max(generada_at::date) into v_ultima_real
        from public.mant_programaciones
        where plan_id = p_plan_id and activo_id = v_activo.activo_id
          and estado = 'generada' and generada_at is not null;
      end if;
      v_base := coalesce(v_ultima_real, v_ultima_programada);
    else
      -- Primera programación: fecha de activación o último cumplimiento (MANT-2) del
      -- requisito que motiva el plan, lo que sea posterior (§3.3) — nunca hacia el pasado.
      v_ultimo_cumplimiento := null;
      if v_plan.requisito_id is not null then
        select max(c.fecha_cumplimiento) into v_ultimo_cumplimiento
        from public.mant_cumplimiento c
        where c.requisito_id = v_plan.requisito_id
          and coalesce(c.activo_id, v_activo.activo_id) = v_activo.activo_id;
      end if;
      v_base := greatest(current_date, v_plan.vigente_desde, coalesce(v_ultimo_cumplimiento, current_date));
    end if;

    v_fecha := (v_base + (v_plan.frecuencia_meses || ' months')::interval)::date;

    while v_fecha <= v_horizonte_hasta loop
      insert into public.mant_programaciones (tenant_id, plan_id, activo_id, fecha_programada, ventana_hasta)
      values (v_plan.tenant_id, p_plan_id, v_activo.activo_id, v_fecha, v_fecha + v_plan.ventana_dias)
      on conflict (plan_id, activo_id, fecha_programada) do nothing;
      if found then
        v_generadas := v_generadas + 1;
      end if;
      v_fecha := (v_fecha + (v_plan.frecuencia_meses || ' months')::interval)::date;
    end loop;
  end loop;

  return query select v_generadas, v_omitidas;
end;
$$;

comment on function public.fn_mant_generar_programaciones(uuid) is
  'MANT-3 §3.3: idempotente (índice único + ON CONFLICT DO NOTHING), acotada al horizonte del '
  'plan, sin programar hacia el pasado, y con el encadenamiento desde ejecución real como '
  'default (D-56). Excluye activos fuera_de_servicio/retirado, omitiendo (no borrando) sus '
  'pendientes futuras. Corre sobre pg_cron (siguiente archivo) — no crea un scheduler nuevo.';
