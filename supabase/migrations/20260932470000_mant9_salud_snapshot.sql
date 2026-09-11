-- ═══════════════════════════════════════════════════════════════════════
--  MANT-9 · Salud del activo y apoyo a la decisión (3/7)
--  Casos de uso/Tres Modulos/Mantenimiento/MANT_09_salud_decision.md §3.1
--
--  Histórico append-only, para ver la evolución del índice — mant_salud()
--  (siguiente migración) es una función pura que SIEMPRE calcula en vivo
--  con los factores VIGENTES; el snapshot es la única foto congelada
--  (version_factores) que "cambiar los pesos no reescribe" (prueba 5).
--
--  Un registro manual (RPC, botón "Guardar snapshot" en la ficha) más un
--  cron mensual — no diario: la salud de un activo no cambia hora a hora,
--  y un cron diario llenaría la tabla sin aportar resolución real a
--  "evolución". Mismo mecanismo pg_cron que mant3_cron/gob9, sin scheduler
--  nuevo.
-- ═══════════════════════════════════════════════════════════════════════

create table public.mant_salud_snapshot (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  activo_id        uuid not null references public.activos (id),
  fecha            date not null,
  indice           numeric(5, 2) not null,
  detalle          jsonb not null,
  version_factores int not null,
  registrado_por   uuid references public.profiles (id),
  created_at       timestamptz not null default now(),

  constraint mant_salud_snapshot_unico unique (activo_id, fecha)
);

alter table public.mant_salud_snapshot enable row level security;
alter table public.mant_salud_snapshot force row level security;

create index mant_salud_snapshot_tenant_idx on public.mant_salud_snapshot (tenant_id);
create index mant_salud_snapshot_activo_idx on public.mant_salud_snapshot (activo_id, fecha desc);

comment on table public.mant_salud_snapshot is
  'MANT-9 §3.1: histórico append-only del índice de salud — version_factores congela con qué '
  'versión de mant_salud_set se calculó, así que reemplazar los pesos nunca reescribe una foto '
  'ya tomada (prueba 5). Un snapshot por activo por día (unique).';

create trigger mant_salud_snapshot_append_only
  before update or delete on public.mant_salud_snapshot
  for each row execute function public.forbid_mutation();

create policy mant_salud_snapshot_select_miembro
  on public.mant_salud_snapshot for select
  to authenticated
  using (public.is_member(tenant_id));

create policy mant_salud_snapshot_insert_auxiliar
  on public.mant_salud_snapshot for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));
