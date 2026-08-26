-- ═══════════════════════════════════════════════════════════════════════
--  A1 (auditoría externa 2026-08-26, Docs/evaluacion/01) — RLS faltante en
--  contable_codigo_retirado
--
--  20260830540000 creó esta tabla sin `enable/force row level security` —
--  la única de las 66 tablas de `public` en ese estado, verificado con
--  tests/rls/schema-forced-rls.test.ts (T-SEC-01), que en efecto falla
--  contra esto hasta esta migración. Sin RLS, cualquier `authenticated`
--  puede DELETE/SELECT esta tabla por los grants por defecto de Supabase —
--  un DELETE aquí desactiva en la práctica
--  guard_contable_codigo_no_retirado() para TODOS los tenants (la tabla no
--  tiene tenant_id: es catálogo global, agrava el alcance del hueco).
--
--  Deny-by-default basta, sin políticas: la única lectora legítima es
--  guard_contable_codigo_no_retirado() (SECURITY DEFINER, bypassa RLS por
--  diseño) — ningún rol de cliente necesita leer ni escribir esta tabla
--  directamente.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.contable_codigo_retirado enable row level security;
alter table public.contable_codigo_retirado force row level security;
