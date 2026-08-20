-- ═══════════════════════════════════════════════════════════════════════
--  Fix real: nivel/ruta sin DEFAULT obligaba a mandar placeholders en
--  cada INSERT (store y media docena de fixtures de test), aunque
--  guard_presupuesto_cuenta_arbol (BEFORE INSERT) siempre los recalcula y
--  los pisa — encontrado al correr `npm run typecheck` en todo el
--  monorepo por primera vez esta sesión: el tipo Insert generado exige
--  ambas columnas NOT NULL sin default, y vitest (que no type-checkea)
--  nunca lo había señalado.
--
--  Fix: darles un DEFAULT real (nivel=1, ruta='' — valores de una cuenta
--  raíz recién creada, coherentes con lo que el guard produciría para
--  parent_id IS NULL). El trigger sigue sobrescribiendo ambos siempre,
--  así que el comportamiento real no cambia — solo deja de ser
--  obligatorio mandarlos a mano. apps/web/app/stores/presupuesto.ts sigue
--  mandando el placeholder explícito (inofensivo, ya no necesario) — no
--  se toca, no hay razón para el churn.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.presupuesto_cuenta
  alter column nivel set default 1,
  alter column ruta set default '';
