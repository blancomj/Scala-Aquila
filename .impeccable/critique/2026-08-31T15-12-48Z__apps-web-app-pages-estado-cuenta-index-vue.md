---
target: estado-cuenta/index.vue (post-fix)
total_score: 33
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
p2_count: 2
p3_count: 2
timestamp: 2026-08-31T15-12-48Z
slug: apps-web-app-pages-estado-cuenta-index-vue
---
# Critique: Estado de Cuenta — index.vue (post-fix)

**Date**: 2026-08-31
**Method**: dual-agent (A: design-review, B: detector-manual-scan)
**File**: apps/web/app/pages/estado-cuenta/index.vue (399 lines)

## Scores (Before → After)

| Heuristic | Before | After |
|-----------|--------|-------|
| Visibility of System Status | 3 | 3.5 |
| Match System / Real World | 4 | 4 |
| User Control and Freedom | 2 | 3 |
| Consistency and Standards | 3 | 3.5 |
| Error Prevention | 3 | 3 |
| Recognition Rather Than Recall | 4 | 4 |
| Flexibility and Efficiency | 2 | 2 |
| Aesthetic and Minimalist Design | 3 | 3.5 |
| Error Recovery | 3 | 3.5 |
| Help and Documentation | 3 | 2.5 |
| **Total** | **29/40** | **33/40** |

## Governance: PASS (0 violations)

## Priority Issues

### P2: No loading state when switching inmuebles
Watcher fires async load but shows no skeleton for tables.

### P2: space-y-8 wider than standard
Tighten to space-y-6 for density.

### P3: No tooltips on action buttons
Add title props to Generar and Enviar buttons.

### P3: No keyboard shortcut
Add Ctrl+Enter for Generar comprobante.

## What's Working
- P0 modal well-crafted with domain-accurate copy
- Skeleton matches actual layout
- Toast feedback consistent with app
- Button separation improves scanability
- Error states don't auto-dismiss (correct for accounting)
