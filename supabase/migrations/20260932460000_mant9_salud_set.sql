-- ═══════════════════════════════════════════════════════════════════════
--  MANT-9 · Salud del activo y apoyo a la decisión (2/7)
--  Casos de uso/Tres Modulos/Mantenimiento/MANT_09_salud_decision.md §3.1
--
--  Set versionado de factores ponderados — mismo patrón que
--  mant_criticidad_set/_criterio/_banda (MANT-1, 20260930680000), incluido
--  el guard de inmutabilidad YA CORREGIDO desde el día uno: MANT-1
--  descubrió que reutilizar guard_politica_inmutable() tal cual bloqueaba
--  la propia transición vigente->historica necesaria para activar una
--  segunda versión (20260930710000_mant1_fix_criticidad_set_reemplazo_
--  vigente.sql) — aquí se construye directo el guard dedicado que sí la
--  permite, sin repetir el hallazgo por una prueba fallida.
--
--  Cero pesos, cero bandas sembrados (marco §6.6 / corte §4). La plantilla
--  sugerida por el §11 del prompt original va en un script OPCIONAL
--  (entregable 3), nunca en una migración.
-- ═══════════════════════════════════════════════════════════════════════

create table public.mant_salud_set (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  version       int not null,
  estado        public.vigencia_estado_t not null default 'borrador',
  vigente_desde date,
  vigente_hasta date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,

  constraint mant_salud_set_version_unica unique (tenant_id, version)
);

alter table public.mant_salud_set enable row level security;
alter table public.mant_salud_set force row level security;

create index mant_salud_set_tenant_idx on public.mant_salud_set (tenant_id);
create unique index mant_salud_set_vigente_unico
  on public.mant_salud_set (tenant_id)
  where estado = 'vigente';

comment on table public.mant_salud_set is
  'MANT-9 §3.1: versión de un conjunto de factores ponderados del índice de salud — mismo patrón '
  'que mant_criticidad_set. Inmutable en vigente/historica salvo la única transición '
  'vigente->historica que permite guard_salud_set_inmutable. Solo un set vigente por tenant.';

create trigger set_updated_at before update on public.mant_salud_set
  for each row execute function public.set_updated_at();

-- ── Guard dedicado (nunca el genérico guard_politica_inmutable — ver cabecera) ──
create function public.guard_salud_set_inmutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.estado = 'historica' then
    raise exception 'IMMUTABLE_POLICY: el set de salud % (versión %) es inmutable en estado % '
      '— corrige creando una versión nueva (MANT-9 §3.1)', old.id, old.version, old.estado;
  end if;

  if old.estado = 'vigente' then
    -- Único cambio permitido sobre un set vigente: retirarlo a 'historica' con su
    -- vigente_hasta, cuando lo reemplaza una versión nueva.
    if new.estado is distinct from 'historica'
       or new.version is distinct from old.version
       or new.vigente_desde is distinct from old.vigente_desde then
      raise exception 'IMMUTABLE_POLICY: el set de salud % (versión %) es inmutable en estado % '
        '— corrige creando una versión nueva (MANT-9 §3.1)', old.id, old.version, old.estado;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.guard_salud_set_inmutable() is
  'MANT-9 §3.1: mismo patrón que guard_criticidad_set_inmutable (MANT-1) — único cambio '
  'permitido sobre una fila vigente es retirarla a historica.';

create trigger guard_salud_set_inmutable
  before update on public.mant_salud_set
  for each row execute function public.guard_salud_set_inmutable();

-- ── Factor individual, hijo de un set ────────────────────────────────────
create table public.mant_salud_factor (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  set_id       uuid not null references public.mant_salud_set (id) on delete cascade,
  codigo       text not null,
  nombre       text not null,
  descripcion  text,
  peso         numeric(5, 2) not null,
  fuente_id    bigint not null references public.lista_tipos (id),
  -- Ventana de datos que este factor mira hacia atrás desde la fecha de evaluación —
  -- configurable por factor (disponibilidad y costo no tienen por qué mirar el mismo
  -- horizonte). Sin esto, mant_salud() tendría que inventar un número fijo para todos.
  ventana_dias integer not null default 365,
  -- Tramos ordenados por "hasta" ascendente (null = sin techo), cada uno con su puntaje
  -- 0-100 — sin motor de expresiones genérico (misma DSL mínima que CO-5). La dirección
  -- "mayor/menor es mejor" queda implícita en cómo el tenant asigna los puntajes a los
  -- tramos, no es una columna aparte: [{"hasta":24,"puntaje":100},{"hasta":72,"puntaje":60},
  -- {"hasta":null,"puntaje":20}] para "menor mejor" (ej. MTTR); ascendente en vez de
  -- descendente para "mayor mejor" (ej. disponibilidad).
  escala       jsonb not null,
  created_at   timestamptz not null default now(),

  constraint mant_salud_factor_codigo_unico unique (set_id, codigo),
  constraint mant_salud_factor_peso_valido check (peso > 0 and peso <= 100),
  constraint mant_salud_factor_ventana_valida check (ventana_dias > 0),
  constraint mant_salud_factor_escala_es_arreglo check (jsonb_typeof(escala) = 'array')
);

alter table public.mant_salud_factor enable row level security;
alter table public.mant_salud_factor force row level security;

create index mant_salud_factor_tenant_idx on public.mant_salud_factor (tenant_id);
create index mant_salud_factor_set_idx on public.mant_salud_factor (set_id);

comment on table public.mant_salud_factor is
  'MANT-9 §3.1: un factor ponderado del índice de salud, hijo de un mant_salud_set. fuente_id '
  'debe pertenecer a la familia FUENTE_SALUD_FACTOR (SALUD_FACTOR_FUENTE_INVALIDA si no). Cero '
  'filas sembradas — el administrador arma su propio set desde cero o desde la plantilla '
  'opcional (script, no migración).';

-- ── Guard: hijo inmutable una vez el set entra a vigente/historica (mismo patrón MANT-1) ──
create function public.guard_salud_set_hijo_inmutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_set_id uuid := coalesce(new.set_id, old.set_id);
  v_estado public.vigencia_estado_t;
begin
  select estado into v_estado from public.mant_salud_set where id = v_set_id;
  if v_estado in ('vigente', 'historica') then
    raise exception 'IMMUTABLE_POLICY: los factores del set de salud % son inmutables en estado '
      '% — corrige creando una versión nueva (MANT-9 §3.1)', v_set_id, v_estado;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger guard_salud_set_hijo_inmutable
  before insert or update or delete on public.mant_salud_factor
  for each row execute function public.guard_salud_set_hijo_inmutable();

-- ── Guard: fuente_id debe pertenecer a FUENTE_SALUD_FACTOR ──────────────
create function public.guard_salud_factor_fuente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo text;
begin
  select tipo into v_tipo from public.lista_tipos where id = new.fuente_id;
  if v_tipo is distinct from 'FUENTE_SALUD_FACTOR' then
    raise exception 'SALUD_FACTOR_FUENTE_INVALIDA: fuente_id % no pertenece a '
      'FUENTE_SALUD_FACTOR (es %)', new.fuente_id, coalesce(v_tipo, 'inexistente');
  end if;
  return new;
end;
$$;

comment on function public.guard_salud_factor_fuente() is
  'MANT-9 §3.1: catálogo cerrado de fuentes interpretables — un factor con fuente_id fuera de '
  'FUENTE_SALUD_FACTOR falla, nunca se guarda en silencio con una fuente que mant_salud() no '
  'sabría interpretar.';

create trigger guard_salud_factor_fuente
  before insert or update on public.mant_salud_factor
  for each row execute function public.guard_salud_factor_fuente();

-- ── Guard: la suma de pesos del set debe ser exactamente 100 al activarlo ──
create function public.guard_salud_set_pesos_completos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_suma numeric(7, 2);
begin
  if new.estado <> 'vigente' or old.estado = 'vigente' then
    return new;
  end if;

  select coalesce(sum(peso), 0) into v_suma
    from public.mant_salud_factor
   where set_id = new.id;

  if v_suma <> 100 then
    raise exception 'SALUD_PESOS_INVALIDOS: los pesos del set % suman % (deben sumar '
      'exactamente 100, MANT-9 §3.1)', new.id, v_suma;
  end if;

  return new;
end;
$$;

comment on function public.guard_salud_set_pesos_completos() is
  'MANT-9 §3.1: solo se valida al ENTRAR a vigente — un borrador puede tener pesos incompletos '
  'mientras se construye, mismo criterio que guard_criticidad_set_pesos_completos (MANT-1).';

create trigger guard_salud_set_pesos_completos
  before update on public.mant_salud_set
  for each row execute function public.guard_salud_set_pesos_completos();

-- ── Bandas de interpretación del índice total (crítico/alto/medio/bajo en el prompt
-- original, configurables, cero sembradas) — atadas al mismo set que sus pesos. ──
create table public.mant_salud_banda (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  set_id        uuid not null references public.mant_salud_set (id) on delete cascade,
  etiqueta      text not null,
  puntaje_desde numeric(6, 2) not null,
  puntaje_hasta numeric(6, 2),
  orden         smallint not null default 0,
  created_at    timestamptz not null default now(),

  constraint mant_salud_banda_rango_valido
    check (puntaje_hasta is null or puntaje_hasta >= puntaje_desde)
);

alter table public.mant_salud_banda enable row level security;
alter table public.mant_salud_banda force row level security;

create index mant_salud_banda_tenant_idx on public.mant_salud_banda (tenant_id);
create index mant_salud_banda_set_idx on public.mant_salud_banda (set_id);

comment on table public.mant_salud_banda is
  'MANT-9 §3.1: bandas de interpretación del índice total, puramente de presentación (nunca una '
  'decisión) — cero sembradas. Mismo patrón que mant_criticidad_banda (MANT-1).';

create trigger guard_salud_set_hijo_inmutable
  before insert or update or delete on public.mant_salud_banda
  for each row execute function public.guard_salud_set_hijo_inmutable();

-- ── RLS — mant_salud_set ─────────────────────────────────────────────────
create policy mant_salud_set_select_miembro
  on public.mant_salud_set for select
  to authenticated
  using (public.is_member(tenant_id));

create policy mant_salud_set_insert_auxiliar
  on public.mant_salud_set for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy mant_salud_set_update_auxiliar
  on public.mant_salud_set for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

-- ── RLS — mant_salud_factor ──────────────────────────────────────────────
create policy mant_salud_factor_select_miembro
  on public.mant_salud_factor for select
  to authenticated
  using (public.is_member(tenant_id));

create policy mant_salud_factor_insert_auxiliar
  on public.mant_salud_factor for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy mant_salud_factor_update_auxiliar
  on public.mant_salud_factor for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy mant_salud_factor_delete_auxiliar
  on public.mant_salud_factor for delete
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

-- ── RLS — mant_salud_banda ───────────────────────────────────────────────
create policy mant_salud_banda_select_miembro
  on public.mant_salud_banda for select
  to authenticated
  using (public.is_member(tenant_id));

create policy mant_salud_banda_insert_auxiliar
  on public.mant_salud_banda for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy mant_salud_banda_update_auxiliar
  on public.mant_salud_banda for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy mant_salud_banda_delete_auxiliar
  on public.mant_salud_banda for delete
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));
