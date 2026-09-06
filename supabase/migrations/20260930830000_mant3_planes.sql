-- ═══════════════════════════════════════════════════════════════════════
--  MANT-3 · Planes de mantenimiento y motor de programación (2/6)
--  Casos de uso/Tres Modulos/Mantenimiento/MANT_03_planes_programacion.md §3.2
--
--  Un plan dice CÓMO se organiza el trabajo; la frecuencia legal, cuando
--  existe, vive en mant_requisito (MANT-2) y este corte solo la hereda —
--  nunca la duplica ni la relaja. "alcance_*" son las cinco columnas de
--  destino posibles (una por cada valor de plan_alcance_t); guard_mant_plan
--  exige que solo la que corresponde esté poblada.
--
--  Fuera de alcance de este archivo (documentado también en el corte):
--  contrato_id (MANT-5) y repuesto_previsto_id (mant_plan_tareas, MANT-6)
--  quedan como uuid sin FK — esas tablas no existen todavía.
-- ═══════════════════════════════════════════════════════════════════════

create type public.plan_alcance_t as enum ('activo', 'tipo_activo', 'categoria', 'ubicacion');
comment on type public.plan_alcance_t is
  'A qué se aplica un plan de mantenimiento (MANT-3 §3.2). Gatilla guard_mant_plan (qué columna '
  'alcance_* debe estar poblada) y fn_mant_resolver_alcance_plan (cómo se expande a activos '
  'concretos en mant_plan_activos) — no es vocabulario descriptivo suelto.';

create type public.plan_frecuencia_origen_t as enum ('heredada_requisito', 'propia');
comment on type public.plan_frecuencia_origen_t is
  'Si la frecuencia del plan viene de un requisito de cumplimiento (MANT-2) o es una decisión '
  'propia de la copropiedad. ''heredada_requisito'' exige requisito_id (PLAN_HERENCIA_SIN_REQUISITO) '
  'y no admite frecuencia_meses mayor que la del requisito (PLAN_FRECUENCIA_INFERIOR_A_EXIGIDA) — '
  'gatilla esa validación, no es descriptivo.';

create table public.mant_planes (
  id                              uuid primary key default gen_random_uuid(),
  tenant_id                       uuid not null references public.tenants (id) on delete cascade,
  codigo                          text not null,
  nombre                          text not null,
  descripcion                     text,
  tipo_mantenimiento_id           bigint not null references public.lista_tipos (id),

  -- Requisito que motiva el plan (MANT-2) — opcional: un plan también puede ser 100% propio.
  requisito_id                    uuid references public.mant_requisito (id),

  -- ── Alcance: exactamente una de las cinco columnas de abajo, según `alcance` ──
  alcance                         public.plan_alcance_t not null,
  alcance_activo_id               uuid references public.activos (id),
  alcance_tipo_activo_id          bigint references public.lista_tipos (id),
  alcance_categoria_id            bigint references public.lista_tipos (id),
  alcance_agrupacion_id           uuid references public.agrupaciones (id),
  alcance_zona_comun_id           uuid references public.zonas_comunes (id),

  frecuencia_meses                integer not null,
  frecuencia_origen               public.plan_frecuencia_origen_t not null,
  ventana_dias                    integer not null,
  horizonte_meses                 integer not null,
  -- §3.3: política de encadenamiento — default "desde ejecución real" pedido por el corte,
  -- parametrizable por plan si el contador de mantenimiento lo discute (D-56 en DECISIONES.md).
  encadenar_desde_ejecucion_real  boolean not null default true,
  duracion_estimada_min           integer,
  requiere_parada_servicio        boolean not null default false,
  -- MANT-5 no existe todavía: sin FK a propósito (ver cabecera).
  contrato_id                     uuid,

  -- Un plan nace inactivo (borrador); se activa con fn_mant_activar_plan, que exige tareas.
  activo                          boolean not null default false,
  vigente_desde                   date not null default current_date,
  vigente_hasta                   date,

  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz,

  constraint mant_planes_codigo_unico unique (tenant_id, codigo),
  constraint mant_planes_frecuencia_positiva check (frecuencia_meses > 0),
  constraint mant_planes_horizonte_positivo check (horizonte_meses > 0),
  constraint mant_planes_ventana_no_negativa check (ventana_dias >= 0),
  constraint mant_planes_nombre_no_vacio check (btrim(nombre) <> ''),
  constraint mant_planes_vigencia_valida check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);

create index mant_planes_tenant_idx on public.mant_planes (tenant_id);
create index mant_planes_requisito_idx on public.mant_planes (requisito_id) where requisito_id is not null;

alter table public.mant_planes enable row level security;
alter table public.mant_planes force row level security;

comment on table public.mant_planes is
  'MANT-3 §3.2: plan de mantenimiento — qué tareas, con qué frecuencia y sobre qué alcance de '
  'activos. La frecuencia legal, si existe, vive en mant_requisito; este plan solo la hereda '
  '(nunca la relaja) vía requisito_id/frecuencia_origen. Nace `activo = false`; '
  'fn_mant_activar_plan la pone en true tras validar que tiene tareas (PLAN_SIN_TAREAS).';
comment on column public.mant_planes.contrato_id is
  'Fuera de alcance de MANT-3 (lo ejecuta MANT-5): uuid sin FK a propósito, tal como el corte '
  'exige — MANT-5 todavía no existe.';

create policy mant_planes_select_miembro
  on public.mant_planes for select
  to authenticated
  using (public.is_member(tenant_id));

create policy mant_planes_insert_auxiliar
  on public.mant_planes for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy mant_planes_update_auxiliar
  on public.mant_planes for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

-- ── Guard de la ficha (§3.2) ─────────────────────────────────────────────
create function public.guard_mant_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo_mant_tipo text;
  v_requisito public.mant_requisito;
  v_dias_frecuencia integer;
  v_destinos_llenos integer;
begin
  select tipo into v_tipo_mant_tipo from public.lista_tipos where id = new.tipo_mantenimiento_id;
  if v_tipo_mant_tipo is distinct from 'TIPO_MANTENIMIENTO' then
    raise exception 'PLAN_TIPO_MANTENIMIENTO_INVALIDO: tipo_mantenimiento_id % no pertenece a '
      'TIPO_MANTENIMIENTO (es %)', new.tipo_mantenimiento_id, coalesce(v_tipo_mant_tipo, 'inexistente');
  end if;

  -- ── Consistencia de alcance: exactamente el destino que corresponde a `alcance` ──
  v_destinos_llenos := (new.alcance_activo_id is not null)::int
    + (new.alcance_tipo_activo_id is not null)::int
    + (new.alcance_categoria_id is not null)::int
    + ((new.alcance_agrupacion_id is not null) or (new.alcance_zona_comun_id is not null))::int;
  if v_destinos_llenos <> 1 then
    raise exception 'PLAN_ALCANCE_INCONSISTENTE: exactamente un destino de alcance debe estar '
      'poblado según `alcance` (%), no % ', new.alcance, v_destinos_llenos;
  end if;
  case new.alcance
    when 'activo' then
      if new.alcance_activo_id is null then
        raise exception 'PLAN_ALCANCE_INCONSISTENTE: alcance = ''activo'' exige alcance_activo_id';
      end if;
      if not exists (select 1 from public.activos where id = new.alcance_activo_id and tenant_id = new.tenant_id) then
        raise exception 'PLAN_TENANT_INCONSISTENTE: el activo % no pertenece al tenant', new.alcance_activo_id;
      end if;
    when 'tipo_activo' then
      if new.alcance_tipo_activo_id is null
         or not exists (select 1 from public.lista_tipos where id = new.alcance_tipo_activo_id and tipo = 'TIPO_ACTIVO') then
        raise exception 'PLAN_ALCANCE_INCONSISTENTE: alcance = ''tipo_activo'' exige alcance_tipo_activo_id '
          'válido de TIPO_ACTIVO';
      end if;
    when 'categoria' then
      if new.alcance_categoria_id is null
         or not exists (select 1 from public.lista_tipos where id = new.alcance_categoria_id and tipo = 'CATEGORIA_ACTIVO') then
        raise exception 'PLAN_ALCANCE_INCONSISTENTE: alcance = ''categoria'' exige alcance_categoria_id '
          'válido de CATEGORIA_ACTIVO';
      end if;
    when 'ubicacion' then
      if (new.alcance_agrupacion_id is not null) = (new.alcance_zona_comun_id is not null) then
        raise exception 'PLAN_ALCANCE_INCONSISTENTE: alcance = ''ubicacion'' exige exactamente uno '
          'de alcance_agrupacion_id / alcance_zona_comun_id';
      end if;
      if new.alcance_agrupacion_id is not null
         and not exists (select 1 from public.agrupaciones where id = new.alcance_agrupacion_id and tenant_id = new.tenant_id) then
        raise exception 'PLAN_TENANT_INCONSISTENTE: la agrupación % no pertenece al tenant', new.alcance_agrupacion_id;
      end if;
      if new.alcance_zona_comun_id is not null
         and not exists (select 1 from public.zonas_comunes where id = new.alcance_zona_comun_id and tenant_id = new.tenant_id) then
        raise exception 'PLAN_TENANT_INCONSISTENTE: la zona común % no pertenece al tenant', new.alcance_zona_comun_id;
      end if;
  end case;

  -- ── Herencia de frecuencia (§2/§3.2) ──
  if new.frecuencia_origen = 'heredada_requisito' and new.requisito_id is null then
    raise exception 'PLAN_HERENCIA_SIN_REQUISITO: frecuencia_origen = ''heredada_requisito'' exige requisito_id';
  end if;

  if new.requisito_id is not null then
    select * into v_requisito from public.mant_requisito where id = new.requisito_id;
    if v_requisito.tenant_id is distinct from new.tenant_id then
      raise exception 'PLAN_TENANT_INCONSISTENTE: el requisito % no pertenece al tenant', new.requisito_id;
    end if;
    if v_requisito.frecuencia_meses is not null and new.frecuencia_meses > v_requisito.frecuencia_meses then
      raise exception 'PLAN_FRECUENCIA_INFERIOR_A_EXIGIDA: % exige cada % meses (%), el plan no '
        'puede programar cada % meses — la frecuencia no es una preferencia del sistema',
        v_requisito.nombre, v_requisito.frecuencia_meses,
        coalesce(v_requisito.norma_referencia, 'sin norma verificada'), new.frecuencia_meses;
    end if;
  end if;

  -- ── ventana_dias no puede exceder la frecuencia (aprox. 30 días/mes, documentado) ──
  v_dias_frecuencia := new.frecuencia_meses * 30;
  if new.ventana_dias > v_dias_frecuencia then
    raise exception 'PLAN_VENTANA_INVALIDA: ventana_dias (%) no puede exceder la frecuencia '
      '(% meses ≈ % días)', new.ventana_dias, new.frecuencia_meses, v_dias_frecuencia;
  end if;

  -- ── Activación: un plan nunca puede nacer activo (sus tareas se cargan después de crearlo); ──
  -- la activación real pasa por fn_mant_activar_plan / por UPDATE, ambos validados abajo.
  if tg_op = 'INSERT' and new.activo then
    raise exception 'PLAN_SIN_TAREAS: un plan no puede crearse ya activo — no puede tener tareas '
      'todavía. Créalo inactivo y actívalo con fn_mant_activar_plan tras cargar sus tareas';
  end if;
  if tg_op = 'UPDATE' and new.activo and not old.activo then
    if not exists (select 1 from public.mant_plan_tareas where plan_id = new.id) then
      raise exception 'PLAN_SIN_TAREAS: el plan % no tiene tareas, no se puede activar', new.id;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

comment on function public.guard_mant_plan() is
  'Valida tipo_mantenimiento_id, consistencia del alcance (exactamente un destino poblado, del '
  'tenant correcto), herencia de frecuencia contra mant_requisito (nunca puede relajarla), '
  'ventana_dias contra la frecuencia, y que la activación exija al menos una tarea.';

create trigger mant_planes_guard
  before insert or update on public.mant_planes
  for each row execute function public.guard_mant_plan();
