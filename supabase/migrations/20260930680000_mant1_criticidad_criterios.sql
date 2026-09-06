-- ═══════════════════════════════════════════════════════════════════════
--  MANT-1 · Atributos técnicos dinámicos y criticidad (3/4)
--
--  Este archivo: criterios de criticidad versionados (§3.3). Reutiliza
--  vigencia_estado_t (20260814100000) y guard_politica_inmutable()
--  (20260814100300) tal cual — no crea equivalentes propios (D-24, marco
--  §3). El patrón set + filas hijas es el de coeficiente_sets/coeficientes
--  (20260814100100), más apropiado aquí que política+tramo de CO-7 porque
--  esto es una LISTA abierta de criterios ponderados, no un único método.
--
--  Cero valores sembrados (marco §6.6): ni criterios, ni pesos, ni bandas.
--  La plantilla sugerida por el prompt original (impacto en seguridad,
--  habitabilidad, unidades afectadas, redundancia, costo de la falla,
--  tiempo de reposición, exigencia normativa) va en un script de siembra
--  OPCIONAL (entregable 3 del corte), nunca en una migración.
-- ═══════════════════════════════════════════════════════════════════════

-- ── §3.3 Set versionado de criterios (mismo patrón que coeficiente_sets) ─
create table public.mant_criticidad_set (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  version       int not null,
  estado        public.vigencia_estado_t not null default 'borrador',
  vigente_desde date,
  vigente_hasta date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,

  constraint mant_criticidad_set_version_unica unique (tenant_id, version)
);

alter table public.mant_criticidad_set enable row level security;
alter table public.mant_criticidad_set force row level security;

create index mant_criticidad_set_tenant_idx on public.mant_criticidad_set (tenant_id);
create unique index mant_criticidad_set_vigente_unico
  on public.mant_criticidad_set (tenant_id)
  where estado = 'vigente';

comment on table public.mant_criticidad_set is
  'MANT-1 §3.3: versión de un conjunto de criterios de criticidad ponderados — mismo patrón que '
  'coeficiente_sets. Inmutable en vigente/historica (guard_politica_inmutable, reutilizado tal '
  'cual). Solo un set puede estar vigente por tenant a la vez.';

create trigger set_updated_at before update on public.mant_criticidad_set
  for each row execute function public.set_updated_at();

create trigger guard_politica_inmutable
  before update on public.mant_criticidad_set
  for each row execute function public.guard_politica_inmutable();

-- ── §3.3 Criterio individual, hijo de un set ────────────────────────────
create table public.mant_criticidad_criterio (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  set_id      uuid not null references public.mant_criticidad_set (id) on delete cascade,
  codigo      text not null,
  nombre      text not null,
  descripcion text,
  peso        numeric(5, 2) not null,
  -- valor (elegido en mant_activo_criticidad) → puntaje, p.ej. {"bajo":20,"medio":50,"alto":100}.
  escala      jsonb not null,
  created_at  timestamptz not null default now(),

  constraint mant_criticidad_criterio_codigo_unico unique (set_id, codigo),
  constraint mant_criticidad_criterio_peso_valido check (peso >= 0 and peso <= 100)
);

alter table public.mant_criticidad_criterio enable row level security;
alter table public.mant_criticidad_criterio force row level security;

create index mant_criticidad_criterio_tenant_idx on public.mant_criticidad_criterio (tenant_id);
create index mant_criticidad_criterio_set_idx on public.mant_criticidad_criterio (set_id);

comment on table public.mant_criticidad_criterio is
  'MANT-1 §3.3: un criterio ponderado de un mant_criticidad_set. Sin fila sembrada por defecto — '
  'los criterios sugeridos por el prompt original (impacto en seguridad, habitabilidad, etc.) '
  'son plantilla, no catálogo cerrado. Inmutable si su set ya no es borrador '
  '(guard_criticidad_set_hijo_inmutable, abajo) — se corrige creando una versión nueva del set.';
comment on column public.mant_criticidad_criterio.escala is
  'Mapa valor→puntaje que usará mant_activo_criticidad.valor (MANT-1 §3.3). Las claves son el '
  'vocabulario que la copropiedad decide para este criterio (p. ej. ''bajo''/''medio''/''alto'' '
  'o ''si''/''no'') — no hay un vocabulario cerrado impuesto por este corte.';

-- ── Guard: criterio inmutable si su set ya no es borrador ───────────────
create function public.guard_criticidad_set_hijo_inmutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_set_id uuid := coalesce(new.set_id, old.set_id);
  v_estado public.vigencia_estado_t;
begin
  select estado into v_estado from public.mant_criticidad_set where id = v_set_id;
  if v_estado in ('vigente', 'historica') then
    raise exception 'IMMUTABLE_POLICY: los criterios del set de criticidad % son inmutables en '
      'estado % — corrige creando una versión nueva (MANT-1 §3.3)', v_set_id, v_estado;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger guard_criticidad_set_hijo_inmutable
  before insert or update or delete on public.mant_criticidad_criterio
  for each row execute function public.guard_criticidad_set_hijo_inmutable();

-- ── §3.3 Bandas configurables, atadas a la misma versión que sus pesos ──
create table public.mant_criticidad_banda (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  set_id         uuid not null references public.mant_criticidad_set (id) on delete cascade,
  etiqueta       text not null,
  puntaje_desde  numeric(6, 2) not null,
  puntaje_hasta  numeric(6, 2),
  orden          smallint not null default 0,
  created_at     timestamptz not null default now(),

  constraint mant_criticidad_banda_rango_valido
    check (puntaje_hasta is null or puntaje_hasta >= puntaje_desde)
);

alter table public.mant_criticidad_banda enable row level security;
alter table public.mant_criticidad_banda force row level security;

create index mant_criticidad_banda_tenant_idx on public.mant_criticidad_banda (tenant_id);
create index mant_criticidad_banda_set_idx on public.mant_criticidad_banda (set_id);

comment on table public.mant_criticidad_banda is
  'MANT-1 §3.3: bandas de interpretación del puntaje total (crítico/alto/medio/bajo en el '
  'prompt original, pero configurables, sin ninguna sembrada). Atadas al mismo set que sus '
  'pesos para que no queden desalineadas si la copropiedad cambia de versión de criterios.';

create trigger guard_criticidad_set_hijo_inmutable
  before insert or update or delete on public.mant_criticidad_banda
  for each row execute function public.guard_criticidad_set_hijo_inmutable();

-- ── Guard: la suma de pesos del set debe ser exactamente 100 al activarlo ─
create function public.guard_criticidad_set_pesos_completos()
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
    from public.mant_criticidad_criterio
   where set_id = new.id;

  if v_suma <> 100 then
    raise exception 'CRITICIDAD_PESOS_INVALIDOS: los pesos del set % suman % (deben sumar '
      'exactamente 100, MANT-1 §3.3)', new.id, v_suma;
  end if;

  return new;
end;
$$;

comment on function public.guard_criticidad_set_pesos_completos() is
  'MANT-1 §3.3: solo se valida al ENTRAR a vigente (un borrador puede tener pesos incompletos '
  'mientras se construye) — mismo criterio que guard_politica_deterioro_completa (CO-7).';

create trigger guard_criticidad_set_pesos_completos
  before update on public.mant_criticidad_set
  for each row execute function public.guard_criticidad_set_pesos_completos();

-- ── RLS — mant_criticidad_set ────────────────────────────────────────────
create policy mant_criticidad_set_select_miembro
  on public.mant_criticidad_set for select
  to authenticated
  using (public.is_member(tenant_id));

create policy mant_criticidad_set_insert_auxiliar
  on public.mant_criticidad_set for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy mant_criticidad_set_update_auxiliar
  on public.mant_criticidad_set for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

-- ── RLS — mant_criticidad_criterio ───────────────────────────────────────
create policy mant_criticidad_criterio_select_miembro
  on public.mant_criticidad_criterio for select
  to authenticated
  using (public.is_member(tenant_id));

create policy mant_criticidad_criterio_insert_auxiliar
  on public.mant_criticidad_criterio for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy mant_criticidad_criterio_update_auxiliar
  on public.mant_criticidad_criterio for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy mant_criticidad_criterio_delete_auxiliar
  on public.mant_criticidad_criterio for delete
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

-- ── RLS — mant_criticidad_banda ──────────────────────────────────────────
create policy mant_criticidad_banda_select_miembro
  on public.mant_criticidad_banda for select
  to authenticated
  using (public.is_member(tenant_id));

create policy mant_criticidad_banda_insert_auxiliar
  on public.mant_criticidad_banda for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy mant_criticidad_banda_update_auxiliar
  on public.mant_criticidad_banda for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy mant_criticidad_banda_delete_auxiliar
  on public.mant_criticidad_banda for delete
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));
