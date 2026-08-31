---
target: cartera/acciones.vue
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
timestamp: 2026-08-31T06-25-41Z
slug: app-pages-cartera-acciones-vue
---
Method: dual-agent (A: design-review sub-agent · B: detector/browser-evidence sub-agent)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3/4 | Counters update live on action, but initial table load and modal evidence load have no loading indicator |
| 2 | Match System / Real World | 4/4 | Aprobada/Ejecutada/Acreditada kept genuinely distinct in copy and in a dedicated "Prueba" column |
| 3 | User Control and Freedom | 2/4 | No undo/cancel once a send fires |
| 4 | Consistency and Standards | 2/4 | `rounded-xl` vs `rounded-md` in the same file; two unrelated "active" visual languages for one filter concept |
| 5 | Error Prevention | 1/4 | "Enviar" dispatches an irreversible SMS/email/letter with zero confirmation |
| 6 | Recognition Rather Than Recall | 3/4 | Good inline disabled-reason text for despachar; Aprobar/Rechazar's reason is hover-only |
| 7 | Flexibility and Efficiency | 1/4 | No bulk approve/dispatch, no keyboard shortcuts, no auto-refresh |
| 8 | Aesthetic and Minimalist Design | 3/4 | Appropriately dense; modal's 4-column grid cramped in a narrow container |
| 9 | Error Recovery | 3/4 | Dispatch-failure toasts distinguish provider rejection / missing evidence / generic error |
| 10 | Help and Documentation | 2/4 | Legal basis (art. 48, §34) exists only in code comments, never surfaced in-product |
| **Total** | | **24/40** | **Acceptable** |

## Design Specificity Verdict

**LLM assessment:** Genuinely authored for this domain, not a scaffold — the vocabulary (art. 48 maker-checker, "acreditada" derived from acuses rather than the send itself, frozen decision-context, per-co-owner notice splitting, MIME/size-gated judicial evidence upload) reflects real product decisions. But the visual chrome around that logic — KPI cards, tab filters, the detail-modal grid — is generic Tailwind-dashboard boilerplate, and that's exactly where it drifts from Aquila's own DESIGN.md (radius scale, no-shadow rule, `USkeleton` requirement). Domain logic is bespoke and disciplined; the visual layer is template-grade.

**Deterministic scan:** `detect.mjs` on the file: exit 2, 15 findings, all one advisory rule (`design-system-font-size`) — literal `text-[10px]` on the 5 KPI-card labels (lines 385/390/395/400/405) and 9 modal field labels (607–655), below the DESIGN.md "Two-Font Floor Rule" (never below `text-xs`/12px). Child components (`UiTituloDescripcion`, `UiTabla`, `UiSelectorBuscable`) scanned clean. The live-DOM pass additionally caught low contrast (3.2:1, need 4.5:1) on those same 5 KPI labels and 8px badge text on "Acreditada"/"Rebotado" (inherited from Nuxt UI's `UBadge size="xs"`, not a literal class in this file). A large share of the live-DOM findings (`ai-color-palette` ×24, `marquee` ×7, `layout-transition` ×2, `overused-font` ×1) were flagged `inMain:false` — sidebar/global-layout noise, not this page — and are excluded as not applicable.

**Visual overlays:** injection into the live page succeeded (confirmed DOM mutation) and the detector rendered overlay boxes over the flagged elements during the scan; the temporary detector server has since been stopped per protocol, so the overlay isn't persistently viewable now.

## Overall Impression

The page gets the hard part right — the domain rules that actually carry legal weight (maker-checker, acreditación) are enforced and explained in the UI, not just in a data model. What it gets wrong is almost the inverse of what you'd expect: the low-stakes interaction (browsing/filtering) is over-built with two overlapping ways to slice the same seven states, while the highest-stakes interaction on the page — dispatching an irreversible message to a real debtor — has less friction than approving one does. The single biggest opportunity is closing that specific gap; everything else here is normal design-system drift.

## What's Working

1. **Domain precision is load-bearing, not decorative.** The Prueba column is structurally separate from Estado specifically because "acreditada" must survive as its own signal. The dispatch toast explicitly teaches "despachado ≠ entregado" at the exact moment a user could conflate them.
2. **Disabled-state text over silent gray buttons — where it's applied.** When a channel can't auto-dispatch, the row shows visible text ("Gestión manual"/"No despachable") instead of a mystery-disabled button.
3. **Differentiated failure handling.** Provider rejection, missing-evidence warning, and generic error are three distinct toasts with distinct colors and copy — not one catch-all message.

## Priority Issues

**[P0] No confirmation before an irreversible external send**
- Why it matters: Live-verified — clicking "Enviar" fires `despacharAccion` on a single click with zero dialog, state flips to Despachada immediately. This is the one action on the page that puts a message in front of a real debtor and can't be recalled, yet it has less friction than approving it does.
- Fix: Add one lightweight confirm step before calling `despachar()` — an inline "¿Confirmar envío a {destinatario}?" or a small modal.
- Suggested command: `/impeccable harden`

**[P1] Disabled-reason explanations rely solely on native `title` tooltips**
- Why it matters: `motivoNoPuedeDecidir` (self-approval block, wrong role) is only exposed via `:title` on a `:disabled` Aprobar/Rechazar button — unreliable on hover, not read by screen readers, invisible on touch.
- Fix: Match the despachar pattern — render the reason as visible inline text, or a real tooltip with `aria-describedby`.
- Suggested command: `/impeccable audit`

**[P1] No `USkeleton`; a banned "Cargando…" text loading state**
- Why it matters: DESIGN.md requires `USkeleton` sized to content and bans spinner/"Cargando…" text. Line 660 renders literal "Cargando…"; the initial table load shows no indicator at all.
- Fix: Skeleton rows for the table's first load, skeleton blocks for the evidence panel.
- Suggested command: `/impeccable polish`

**[P2] KPI summary labels are both undersized and low-contrast**
- Why it matters: Detector-confirmed on both passes — the 5 KPI-card labels use literal `text-[10px]` (below the 12px floor) and render at 3.2:1 contrast (need 4.5:1) — the same 5 elements failing two documented rules at once.
- Fix: Bump to `text-xs` (12px) and a neutral shade that clears 4.5:1 against the card background.
- Suggested command: `/impeccable typeset`

**[P2] Mobile layout breaks: filter tabs and table overflow**
- Live-verified at 375×812: the filter-tab row overflows and truncates ("Rechazadas" cut off, "Despachadas" shows as "De…"); the table only shows Unidad/Acción/Destinatario before needing horizontal scroll.
- Fix: Wrap or scroll-contain the tab row explicitly; a responsive column-priority scheme or a clearer scroll affordance for the table on narrow viewports.
- Suggested command: `/impeccable adapt`

## Persona Red Flags

**Alex (Power User):** Will like that despachar has zero friction — then hit a wall: no checkbox column to bulk-approve, no keyboard shortcuts, "Actualizar" is manual-only with no polling. The one place Alex wants speed (bulk dispatch) is also the one place the product most needs a deliberate pause — opposite mistakes in the same flow.

**Sam (Accessibility-Dependent):** The 5 KPI labels fail contrast (3.2:1) and size (10px) simultaneously. The Aprobar/Rechazar block-reason is `title`-only, which screen readers won't reliably announce and touch users can't trigger — the explanation most needed before an irreversible legal action is the one most likely to go unheard.

**Riley (Stress Tester):** `destinatario` has no truncate/max-width — a long name will wrap and desync row height. The despachar button has `:loading` but no explicit `:disabled` in the template, so double-click protection during a real, unconfirmed send is unverified. Both empty states are plain text with no icon/CTA — a systemic gap, not a one-off.

## Minor Observations

- Search filters the table but the 5 KPI cards keep showing global totals — plausibly intended, worth confirming.
- "Fallidas" is a static, non-clickable card despite being second-most-urgent after approvals; only "Esperan aprobación" was wired as a shortcut.
- The active filter-tab pill carries `shadow-sm`, prohibited by DESIGN.md's flat-by-construction rule.
- Modal's context grid (`md:grid-cols-4`) renders cramped 86px columns inside a 512px-wide modal, wrapping values onto two lines.
- Detector's `nested-cards` finding on the estado-dot+label wrapper is likely a false positive — a table-cell wrapper, not an actual nested card.
- Icon-only "Ver detalle" button relies on `:title` with no explicit `aria-label` — likely covered by Nuxt UI defaults, not independently confirmed.

## Questions to Consider

1. If self-approval is blocked because art. 48 treats approval as legally load-bearing, why does the actual dispatch get zero ceremony?
2. The KPI row visually promises five actionable things; only one is clickable, and it isn't "Fallidas." Deliberate scope cut, or drift?
3. Nothing in the UI surfaces "art. 48" or the acuse/acreditación logic to the person using it — only in code comments. Should a first-day collections agent already know why "Aprobar" is grayed out?
