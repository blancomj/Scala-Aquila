---
target: estado-cuenta/index.vue
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 1
p2_count: 2
p3_count: 1
timestamp: 2026-08-31T14-55-43Z
slug: apps-web-app-pages-estado-cuenta-index-vue
---
# Critique: Estado de Cuenta — index.vue

**Date**: 2026-08-31
**Method**: dual-agent (A: design-review, B: detector-manual-scan)
**File**: apps/web/app/pages/estado-cuenta/index.vue (334 lines)

## Scores

| Heuristic | Score |
|-----------|-------|
| Visibility of System Status | 3 |
| Match System / Real World | 4 |
| User Control and Freedom | 2 |
| Consistency and Standards | 3 |
| Error Prevention | 3 |
| Recognition Rather Than Recall | 4 |
| Flexibility and Efficiency | 2 |
| Aesthetic and Minimalist Design | 3 |
| Error Recovery | 3 |
| Help and Documentation | 3 |
| **Total** | **29/40** |

## Governance: CLEAN
0 violations across all 12 checks.

## Priority Issues

### P0: No confirmation dialog before email send
A misclick sends a comprobante to a real property owner. Add UModal confirmation.

### P1: No loading state on initial page load
4 stores load in parallel with no skeleton. User sees blank content.

### P2: Success feedback mismatch
Uses UAlert instead of useToast for success. Diverges from other pages.

### P2: Action buttons visually subordinate
Buttons aligned to selector baseline instead of being page-level actions.

### P3: No retry affordance on error
Error alerts show message but no retry button.

## Persona Red Flags
- Dona Marta: email button disabled with no tooltip explaining prerequisite
- Andres: no batch generation for 20+ units

## Minor Observations
- Line 33: Number() for monetary accumulation (should use Decimal)
- Line 196: smallest page title in app (correct per Operator Heading Rule)
- Line 258: locale hardcoded to es-CO

## Questions
1. Why is email tied to ultimoComprobanteId instead of offering a dropdown?
2. Three tables with zero filtering — intentional for auditor role?
3. Should Comprobantes emitidos be collapsed by default?
4. resultadoCorreo conflates success and error into one ref.
