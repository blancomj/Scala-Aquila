---
target: apps/web/app/pages/novedades
total_score: 39
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
p2_count: 0
p3_count: 1
timestamp: 2026-08-31T12-56-11Z
slug: apps-web-app-pages-novedades
---
# Critique v2: Novedades — Aquila PH (post-fix)

**Method: dual-agent (A: design-review · B: detector-manual-scan)**

---

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Loading skeletons, live summary, status badges, toast feedback on all 4 actions |
| 2 | Match System / Real World | 4 | UiSelectorBuscable for catalogs; NuxtLink for config path; domain language with inline explanations |
| 3 | User Control and Freedom | 3 | Back link, cancel, self-disarming approve. No undo for approval (domain constraint) |
| 4 | Consistency and Standards | 4 | All `neutral-*`/`success-*` tokens; UiSelectorBuscable pattern matched; toggle buttons consistent |
| 5 | Error Prevention | 4 | `puedeGuardar` guard, two-step approval, derived sign, proactive warnings |
| 6 | Recognition Rather Than Recall | 4 | Summary sidebar externalizes mental model; filter counts; inline help |
| 7 | Flexibility and Efficiency | 4 | Inline approval for batch dispatch; search; inmuebleId pre-selection |
| 8 | Aesthetic and Minimalist Design | 4 | Control-room density; section headers lightweight; summary panel anchored |
| 9 | Error Recovery | 4 | Specific inline errors; "no open periodos" prevents failure before it happens |
| 10 | Help and Documentation | 4 | Strong contextual help; NuxtLink to config; novedad immutability note |
| **Total** | | **39/40** | **Excellent** |

---

## Design Specificity Verdict

**LLM assessment:** All previous "control room" patterns intact. The `UiSelectorBuscable` migration and `neutral-*` token normalization closed the design system gap without changing the feature's character. The `border-primary/40` summary sidebar remains the single accent anchor.

**Deterministic scan:** 0 automated findings. Manual scan confirmed 0 `gray-*` classes, 0 hardcoded colors, 0 `<UTable>`/`<USelectMenu>`, 0 missing aria-labels.

---

## Overall Impression

Score jumped from 35/40 → 39/40. The two heuristics that dragged the score down (Consistency, Match System) are now at 4. The feature is functionally complete and consistently finished. One minor pre-existing gap remains: H7 (power-user keyboard shortcuts).

---

## What's Working (unchanged)

1. The inline two-step approval — batch dispatch masterclass.
2. The live summary sidebar — externalizes the mental model.
3. The three-section numbered form — clear decision script.

---

## New Issue (P3)

### [P3] Enter key in rejection modal doesn't confirm
**What:** The rejection reason input (line 847) has no `@keydown.enter` handler. Pressing Enter does nothing.
**Why it matters:** Minor flow break on a modal designed for quick text + confirm.
**Fix:** Add `@keydown.enter="confirmarRechazo"` on the input or wrap in `<form @submit.prevent>`.
**Suggested command:** `/impeccable harden`

---

## Previous Issues — Verification

| Issue | Status |
|-------|--------|
| P1: Raw `<select>` → UiSelectorBuscable | ✅ Fixed (line 518-521) |
| P2: No success toast | ✅ Fixed — 4 toasts added (crear, aprobar, rechazar, inhabilitar) |
| P2: 45 `gray-*` → `neutral-*` | ✅ Fixed — 0 remaining |
| P2: `green-*` → `success-*` | ✅ Fixed (line 737) |
| P3: Plain text → NuxtLink | ✅ Fixed (line 530-531) |
