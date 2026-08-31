---
timestamp: 2026-08-31T13-58-35Z
slug: apps-web-app-pages-fundamentos-index-vue
---
---
score: 38
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
  help: 3
verdict: CLEAN
date: 2026-08-31
target: apps/web/app/pages/fundamentos/index.vue
---

# Fundamentos Normativos — Post-Fix Critique

## Score: 38/40 (up from 30/40)

## Fixes Applied
1. **P1**: 8× `gray-*` → `neutral-*` across index.vue, nuevo.vue, FundamentosDrawer.vue
2. **P2**: Rejection modal `<UInput>` → `<UTextarea :rows="3" autoresize>`
3. **P2**: Column sorting wired on `tipo` and `norma` columns via `ordenar` function
4. **P2**: `beforeunload` + `onBeforeRouteLeave` guard on nuevo.vue for unsaved fields
5. **P3**: 4× `aria-label` added to icon-only buttons (clear search, link, 2× pencil)
6. **P3**: `space-y-8` → `space-y-6` to match codebase density norm
7. **P3**: Field-level `description` props added to Tipo, Artículo, Referencia, Fuente URL in nuevo.vue and FundamentosDrawer.vue

## Remaining Notes
- `new Date()` without explicit timezone at index.vue:288 — acceptable for now
- Drawer skeleton is generic h-9 blocks — low priority polish
- `as never` casts on tipo enum — type safety improvement for later
