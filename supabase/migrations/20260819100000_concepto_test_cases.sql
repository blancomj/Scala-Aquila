-- ═══════════════════════════════════════════════════════════════════════
--  AEL-004 Fase 6 — casos de prueba persistidos por concepto (Doc 10 §33-44
--  TEST RUNNER/TEST CASE/SNAPSHOT TESTING/TEST SUITE)
--
--  A diferencia de concepto_versiones (Fase 3, append-only por diseño —
--  es un historial de auditoría), estos son fixtures de prueba: se editan
--  y se borran con normalidad a medida que la fórmula evoluciona. Mismo
--  patrón de RLS que inmuebles/zonas_comunes/coeficiente_sets
--  (20260814100200): select agent+auditor, insert/update/delete agent.
--
--  `entradas`/`resultado_esperado` son jsonb con el shape ValorMock de
--  apps/web/app/utils/ael-test-runner.ts ({tipo, valor}) — ejecutar un
--  caso de prueba es una función pura en el cliente (crearContextoMock +
--  probarFormula ya existentes), no necesita ninguna Edge Function.
--  `tipo_esperado` es texto con check, no un enum nativo: nada en la base
--  lo lee para lógica de control, es solo dato para el cliente.
-- ═══════════════════════════════════════════════════════════════════════

create table public.concepto_test_cases (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants (id) on delete cascade,
  concepto_id        uuid not null references public.conceptos (id) on delete cascade,
  nombre             text not null,
  entradas           jsonb not null default '[]'::jsonb,
  tipo_esperado      text not null check (tipo_esperado in ('NUMBER', 'BOOLEAN', 'MONEY', 'NULO')),
  resultado_esperado jsonb,
  created_by         uuid not null references public.profiles (id),
  created_at         timestamptz not null default now()
);

alter table public.concepto_test_cases enable row level security;
alter table public.concepto_test_cases force row level security;

create index concepto_test_cases_tenant_idx on public.concepto_test_cases (tenant_id);
create index concepto_test_cases_concepto_idx on public.concepto_test_cases (concepto_id);

comment on table public.concepto_test_cases is
  'Casos de prueba persistidos por concepto (Doc 10 §34 TEST CASE) — ejecutados client-side '
  'contra un ExecutionContext mock, reproducibles (Doc 10 §38 SNAPSHOT TESTING). No es un '
  'historial append-only: se editan/borran como cualquier fixture de prueba.';

create policy concepto_test_cases_select_miembro
  on public.concepto_test_cases for select
  to authenticated
  using (public.is_member(tenant_id));

create policy concepto_test_cases_insert_agent
  on public.concepto_test_cases for insert
  to authenticated
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create policy concepto_test_cases_update_agent
  on public.concepto_test_cases for update
  to authenticated
  using (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create policy concepto_test_cases_delete_agent
  on public.concepto_test_cases for delete
  to authenticated
  using (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));
