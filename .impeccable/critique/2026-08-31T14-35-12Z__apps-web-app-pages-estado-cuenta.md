---
timestamp: 2026-08-31T14-35-12Z
slug: apps-web-app-pages-estado-cuenta
---
# Critique: Estados de Cuenta

**Date**: 2026-08-31
**Method**: dual-agent (A: design-review, B: detector-manual-scan)
**Files**: 8 (3 pages + 5 components), ~3000 lines total

## Scores

| Heuristic | Before | After |
|-----------|--------|-------|
| Visibility of System Status | 3 | 3 |
| Match System / Real World | 3 | 3 |
| User Control and Freedom | 3 | 3 |
| Consistency and Standards | 2 | 3 |
| Error Prevention | 3 | 3 |
| Recognition Rather Than Recall | 4 | 4 |
| Flexibility and Efficiency | 2 | 2 |
| Aesthetic and Minimalist Design | 2 | 3 |
| Error Recovery | 3 | 3 |
| Help and Documentation | 3 | 3 |
| **Total** | **27/40** | **32/40** |

## Governance compliance

| Metric | Before | After |
|--------|--------|-------|
| gray-* tokens | 187 | 0 |
| native select | 9 | 0 |
| text-[10px] | 10 | 0 |
| border-l-2 border-primary | 3 | 0 |
| success toasts | 0 | 2 |

## Changes applied

1. P1: 187x gray-* -> neutral-* (ConceptosEditor 152, index 10, CondicionHoja 10, CondicionBuilder 8, VariablesPanel 7)
2. P1: 9x native select -> USelect/UiSelectorBuscable (CondicionHoja 5, ConceptosEditor 4)
3. P2: 10x text-[10px] -> text-xs (ConceptosEditor 8, VariablesPanel 2)
4. P2: 3x border-l-2 border-primary -> border-neutral-200 dark:border-neutral-700
5. P3: Added success toasts in guardar() and ejecutarAprobacion()

## Remaining observations

- ConceptosEditor.vue still at 1709 lines (structural monolith, P2 decomposition recommended)
- Two different filter patterns (tabs in novedades vs segmented in conceptos) — pick one
- No keyboard shortcuts anywhere
- Formula jargon leaks to non-technical users
