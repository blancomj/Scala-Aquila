-- PROMPT AUDITORÍA §63 — Riesgo residual dinámico: "después de cerrar
-- acciones, recalcular riesgo residual, pero conservar riesgo histórico.
-- Nunca borrar el estado anterior."
--
-- No existe una fórmula cerrada en el prompt ni en Docs/01-24 para derivar
-- el riesgo residual a partir de riesgo_inherente y el estado de los
-- controles/acciones — inventar una (ej. "cada control activo reduce X%")
-- sería exactamente lo que PLAN §9.2 prohíbe. El residual es entonces un
-- juicio profesional del auditor (probabilidad/impacto reevaluados a la
-- luz de qué tan efectivas resultaron las acciones cerradas), igual que ya
-- es un juicio profesional el probabilidad/impacto INICIAL de
-- auditoria_riesgos — no un cálculo mecánico.
--
-- "Nunca borrar el estado anterior" se cumple con una tabla insert-only
-- (sin UPDATE/DELETE en RLS, mismo patrón que auditoria_evidencias): cada
-- reevaluación agrega una fila nueva, nunca sobrescribe la anterior. El
-- "riesgo residual actual" de un riesgo es simplemente su fila más
-- reciente — no se duplica un campo mutable en auditoria_riesgos para
-- evitar que se desincronice del historial.

create table public.auditoria_riesgo_residual_historial (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  riesgo_id       uuid not null references public.auditoria_riesgos (id) on delete cascade,
  probabilidad    integer not null check (probabilidad between 1 and 5),
  impacto         integer not null check (impacto between 1 and 5),
  riesgo_residual integer generated always as (probabilidad * impacto) stored,
  -- Qué cambió y por qué (PROMPT AUDITORÍA §63: "después de cerrar
  -- acciones" es el disparador típico, pero no el único — un auditor
  -- también puede reevaluar tras un cambio de contexto sin que medie el
  -- cierre de una acción puntual).
  motivo          text not null,
  -- La acción cuyo cierre motivó este recálculo, si aplica (trazabilidad
  -- hacia el eslabón "Acción→Seguimiento→Cierre" de la matriz §91).
  accion_id       uuid references public.auditoria_acciones (id) on delete set null,
  created_by      uuid not null references public.profiles (id) on delete restrict,
  created_at      timestamptz not null default now()
);

alter table public.auditoria_riesgo_residual_historial enable row level security;
alter table public.auditoria_riesgo_residual_historial force row level security;

create index auditoria_riesgo_residual_historial_riesgo_idx
  on public.auditoria_riesgo_residual_historial (tenant_id, riesgo_id, created_at desc);

comment on table public.auditoria_riesgo_residual_historial is
  'Historial insert-only de reevaluaciones de riesgo residual (PROMPT AUDITORÍA §63) — la fila más reciente por riesgo_id es el residual vigente; nunca se actualiza ni se borra una fila existente.';

create policy auditoria_riesgo_residual_historial_select
  on public.auditoria_riesgo_residual_historial for select
  to authenticated
  using (public.has_role(tenant_id, array['auditor', 'administrador']::public.tenant_role_t[]));

create policy auditoria_riesgo_residual_historial_insert
  on public.auditoria_riesgo_residual_historial for insert
  to authenticated
  with check (
    public.has_role(tenant_id, array['auditor', 'administrador']::public.tenant_role_t[])
    and created_by = (select auth.uid())
  );

-- Sin UPDATE/DELETE: "nunca borrar el estado anterior" (§63).
