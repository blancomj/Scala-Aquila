---
timestamp: 2026-08-31T14-12-44Z
slug: apps-web-app-pages-liquidacion-index-vue
---
---
score: 39
heuristics:
  visibility: 4
  match: 4
  control: 4
  consistency: 4
  prevention: 4
  recognition: 4
  flexibility: 3
  aesthetic: 4
  error-recovery: 4
  help: 4
verdict: CLEAN
date: 2026-08-31
target: apps/web/app/pages/liquidacion/index.vue
---

# Liquidación — Post-Fix Critique

## Score: 39/40 (up from 37/40)

## Fixes Applied
1. **P2-1**: `refrescarLineas()` silent failure → now sets `error.value` on catch
2. **P2-2**: Prevuelo "Comprobando…" text → `USkeleton` with 2-row check-item layout
3. **P2-3**: `notaSolicitud`/`motivoRechazo` drafts persisted to `localStorage` keyed by `periodo.id`
4. **P2-4**: Period selector buttons `rounded-md` → `rounded-sm`
5. **P3-1**: `MESES` + `ESTADO_UI` extracted to `~/config/liquidacion-ui.ts` — shared between index.vue and LiquidacionPanel.vue
6. **P3-2**: "Simulada" raw ISO slice → `toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })`; label changed to "Última simulación"

## Deterministic Scan: CLEAN
- 0× `gray-*` tokens
- 0× banned patterns
- 0× missing aria-labels
- Correct component choices throughout
