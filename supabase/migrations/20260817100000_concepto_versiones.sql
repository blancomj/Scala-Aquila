-- ═══════════════════════════════════════════════════════════════════════
--  AEL-004 Fase 3 — historial append-only de versiones de concepto
--  Propietario: PLAN_AEL004_RULE_WORKSPACE.md Fase 3, Doc 10 §25-30/§161-164
--
--  Alcance acotado a propósito: esto NO es el flujo borrador/vigente/
--  historica de coeficiente_sets/politicas_financieras/presupuestos (esos
--  tres son configuración singleton por tenant; conceptos es un conjunto de
--  reglas independientes, todas "activo" a la vez — no hay "una vigente por
--  tenant" que versionar). Es solo un historial: una fila nueva por cada
--  guardado de un concepto, para poder ver qué cambió y comparar. No toca
--  cómo liquidar-periodo lee conceptos (snapshot-supabase.ts sigue leyendo
--  estado='activo' tal cual).
-- ═══════════════════════════════════════════════════════════════════════

create table public.concepto_versiones (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  concepto_id      uuid not null references public.conceptos (id) on delete cascade,
  version          int not null,
  nombre           text not null,
  tipo_base        public.concepto_tipo_base_t not null,
  modo_calculo     public.concepto_modo_calculo_t not null,
  formula_ael      text,
  prioridad        int not null,
  estado_concepto  public.concepto_estado_t not null,
  hash             text not null,
  created_by       uuid not null references public.profiles (id),
  created_at       timestamptz not null default now(),

  constraint concepto_versiones_unica unique (concepto_id, version)
);

alter table public.concepto_versiones enable row level security;
alter table public.concepto_versiones force row level security;

create index concepto_versiones_tenant_idx on public.concepto_versiones (tenant_id);
create index concepto_versiones_concepto_idx on public.concepto_versiones (concepto_id);

comment on table public.concepto_versiones is
  'Historial append-only: una fila por cada guardado de un concepto (nombre/fórmula/prioridad '
  'congelados tal como quedaron). version se asigna en el servidor (guard_concepto_version_auto), '
  'nunca la envía el cliente. hash es un SHA-256 sobre los campos, no el hash canónico de 19§73.';

-- ── version se calcula en el servidor, nunca la envía el cliente ─────────
create function public.asignar_version_concepto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select coalesce(max(version), 0) + 1 into new.version
    from public.concepto_versiones
   where concepto_id = new.concepto_id;
  return new;
end;
$$;

create trigger concepto_versiones_auto_version
  before insert on public.concepto_versiones
  for each row execute function public.asignar_version_concepto();

-- ── append-only — un historial que se pudiera editar no sería un historial ─
create trigger concepto_versiones_append_only
  before update or delete on public.concepto_versiones
  for each row execute function public.forbid_mutation();

-- ── RLS: lectura cualquier miembro (mismo criterio que conceptos), escritura
--    solo agent — mismo patrón que conceptos_insert_agent ─────────────────
create policy concepto_versiones_select_miembro
  on public.concepto_versiones for select
  to authenticated
  using (public.is_member(tenant_id));

create policy concepto_versiones_insert_agent
  on public.concepto_versiones for insert
  to authenticated
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));
