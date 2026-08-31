---
target: apps/web/app/pages/novedades
total_score: 35
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
p2_count: 2
p3_count: 1
timestamp: 2026-08-31T12-42-38Z
slug: apps-web-app-pages-novedades
---
# Critique: Novedades — Aquila PH

**Method: dual-agent (A: design-review · B: detector-manual-scan)**

---

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Loading skeletons, live summary, filter counts, status badges — all states visible |
| 2 | Match System / Real World | 4 | Domain language with inline explanations; summary sentences are natural speech |
| 3 | User Control and Freedom | 3 | Back link, cancel, self-disarming approve. No undo for approval (domain constraint) |
| 4 | Consistency and Standards | 3 | Raw `<select>` for Motivo instead of UiSelectorBuscable; gray-* vs neutral-* drift |
| 5 | Error Prevention | 4 | `puedeGuardar` guard, two-step approval, derived sign, proactive warnings |
| 6 | Recognition Rather Than Recall | 4 | Summary sidebar externalizes mental model; filter counts; inline help |
| 7 | Flexibility and Efficiency | 4 | Inline approval for batch dispatch; search; inmuebleId pre-selection |
| 8 | Aesthetic and Minimalist Design | 3 | Control-room density achieved; section headers add minor vertical weight |
| 9 | Error Recovery | 4 | Specific inline errors; "no open periodos" prevents failure before it happens |
| 10 | Help and Documentation | 3 | Strong contextual help; missing link to configuración de motivos |
| **Total** | | **35/40** | **Good** |

---

## Design Specificity Verdict

**LLM assessment:** This feature reads as unmistakably Aquila — not a generic SaaS. The filter segmented control with counts, the inline two-step approval showing the exact monto, and the live summary sidebar with `border-primary/40` are all "control room" patterns that no generic template produces. One drift: the native `<select>` for Motivo breaks the UiSelectorBuscable convention.

**Deterministic scan:** 0 automated findings. Manual scan found **45 `gray-*` class usages** in NovedadesEditor.vue (grandfathered legacy, should be `neutral-*`), 1 `green-*` instead of `success-*` token (line 729), and 0 hardcoded colors, 0 `<UTable>`/`<USelectMenu>`, 0 missing aria-labels.

**Visual overlays:** Browser automation unavailable — no injection performed.

---

## Overall Impression

A well-crafted operator tool feature. The three-section numbered form creates a clear decision script, the live summary externalizes the mental model, and the inline two-step approval is a masterclass in high-throughput dispatch design. The single biggest opportunity: migrating the 45 `gray-*` classes to `neutral-*` and replacing the raw `<select>` with `UiSelectorBuscable` to close the design system consistency gap.

---

## What's Working

1. **The inline two-step approval** — button text changes to show exact monto ("¿Aprobar $1.200.000?"), self-disarms on timeout, arming a new row disarms the previous. Built for batch dispatch, faster than any modal. This is the control-room ethos in code.

2. **The live summary sidebar** — resolves user choices into natural-language propositions ("A APTO-301 se le cobrarán $500.000 cada periodo, desde septiembre 2026"). The `border-primary/40` accent treatment makes it the visual anchor. Appears only when there's enough data to resolve.

3. **The three-section numbered form** — each section asks 1-2 questions, not 5. The "Cuánto" section collapsed a 4-way type classification into a single binary (cobro/reembolso) with one-line explanations. Domain simplification that reduces error.

---

## Priority Issues

### [P1] Raw `<select>` for Motivo — design system violation + accessibility gap
**What:** NovedadesEditor.vue:510-518 uses native HTML `<select>` with `gray-*` classes.
**Why it matters:** DESIGN.md mandates `UiSelectorBuscable` for catalogs that can grow. The native `<select>` has no keyboard search, no `role="listbox"` ARIA, bypasses Nuxt UI's focus ring system, and scrolling through 15+ motivos is poor UX.
**Fix:** Replace with `<UiSelectorBuscable :opciones="[{ valor: null, etiqueta: '— Sin clasificar —' }, ...cuentaStore.tiposNovedad.map(t => ({ valor: t.id, etiqueta: t.nombre }))]" />`
**Suggested command:** `/impeccable polish`

### [P2] No success toast after novedad creation
**What:** After `guardar()` succeeds (line 299), user is navigated away with no confirmation.
**Why it matters:** DESIGN.md says "confirm success with a toast." In a high-volume workflow, the user might not notice the navigation.
**Fix:** Add `useToast().add({ title: 'Novedad creada', description: 'Queda pendiente de aprobación.', color: 'success' })` before `navigateTo()`.
**Suggested command:** `/impeccable harden`

### [P2] 45 `gray-*` classes in NovedadesEditor.vue — design system drift
**What:** All 45 instances are in NovedadesEditor.vue. The sibling `estado-cuenta/novedades.vue` uses correct `neutral-*` throughout.
**Why it matters:** Technical debt on the governance allowlist. New `gray-*` additions won't be caught. Visual difference is negligible but consistency matters.
**Fix:** Batch find-and-replace `gray-` → `neutral-` across the file, plus `text-green-600 dark:text-green-500` → `text-success-600 dark:text-success-500` at line 729.
**Suggested command:** `/impeccable polish`

### [P3] Missing link to "Ajustes › Motivos de novedad" in help text
**What:** NovedadesEditor.vue:525 says "Se configura en Ajustes › Motivos de novedad" as plain text.
**Why it matters:** User has to navigate manually to fix a missing motivo→account mapping.
**Fix:** Replace with `<NuxtLink to="/configuracion/motivos-novedad" class="text-primary hover:underline">Ajustes › Motivos de novedad</NuxtLink>`.
**Suggested command:** `/impeccable clarify`

---

## Persona Red Flags

**Alex (Power User):** Low risk. Inline approval built for them. **One flag:** `errorAccion` persists across rows until next successful action — consider clearing on filter change.

**Jordan (First-Timer):** Medium risk. "Cobro" vs "Reembolso" assumes domain knowledge. The label "Tipo" is ambiguous — "¿Qué efecto tiene?" would be clearer. Missing concept warning mentions "Conceptos (Tipo = Novedad)" without a link.

**Casey (Mobile User):** High risk. No sticky bottom action bar — "Crear novedad" button is in the header, requires scrolling back on long forms. 7-column table scrolls horizontally on small screens.

---

## Minor Observations

1. The "Ver" ghost button on each row is redundant with the description `NuxtLink` — the row link alone would suffice.
2. `inputmode="decimal"` should arguably be `inputmode="numeric"` since the field uses comma-separated integers.
3. No pagination on the list — could be a concern if novedades volume grows significantly.

---

## Questions to Consider

1. Should the 4-second approval timeout be configurable for users with accessibility needs?
2. Is "prorrateable" the right term for first-timers, or would "A plazos" be clearer?
3. Should the list show a one-line summary column instead of raw description for faster scanning?
