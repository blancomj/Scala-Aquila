---
target: compositor de correo flotante
total_score: 18
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
timestamp: 2026-08-31T19-06-06Z
slug: components-compositor-compositorcorreoflotante-vue
---
Method: dual-agent (A: a7eb4c2cedc98d2ae · B: a9bda91cc387553b5)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 1 | No loading state anywhere — plantillas/terceros fetch silently, sending shows a spinner but nothing else |
| 2 | Match System / Real World | 3 | "Tercero" / "Correo manual" / "Plantilla" match staff vocabulary well |
| 3 | User Control and Freedom | 1 | Success auto-closes and wipes the whole form on a hard 2s timer with no cancel |
| 4 | Consistency and Standards | 1 | Hand-rolled buttons bypass `UButton`; `bg-brand` used where the rest of the app uses `color="primary"` |
| 5 | Error Prevention | 2 | Email check is `.includes('@')` only; nothing stops sending to a malformed address beyond that |
| 6 | Recognition Rather Than Recall | 3 | Field-registry chips + live preview reduce recall burden well |
| 7 | Flexibility and Efficiency | 1 | No keyboard shortcut to open/close/send, no way to skip the 2s auto-close |
| 8 | Aesthetic and Minimalist Design | 2 | Dense fields are fine, but validation + send-error + success alerts can stack in one scroll region |
| 9 | Error Recovery | 2 | Validation message text is opaque (whatever `validateCompositorBody` throws), no per-field pointer |
| 10 | Help and Documentation | 2 | Chip `title` tooltips serve as inline help; nothing beyond that, acceptable for an expert tool |
| **Total** | | **18/40** | **Poor** |

## Design Specificity Verdict

**LLM assessment**: Structurally this could be any CRUD app's "quick email" modal — generic labeled fields, generic mode toggle, generic template select. It only becomes Aquila-specific through the placeholder registry (`nombreDestinatario`, `inmuebleCodigo`, `saldoPendiente`) and the tercero-search reuse. The chrome itself — raw hand-rolled buttons, `bg-brand`/`bg-neutral-100` pairs instead of `<UButton>`/`<UBadge>` — reads like it was built before "The Control Room" design system existed and never reconciled to it. It doesn't feel authored for this system; it feels bolted onto it.

**Deterministic scan**: `detect.mjs` returned **zero findings** (exit 0, `[]`) on both the component and its two stores (`plantillasCompositor.ts`, `terceros.ts`). Assessment B sanity-checked the tool itself with a deliberately bad fixture (a literal hex color + Comic Sans) and confirmed the detector fires correctly from this location — so the clean result is genuine, not a broken tool. It just means this specific ruleset (documented DESIGN.md token/pattern violations) doesn't currently check for an *invalid* Tailwind class name, which is exactly the kind of bug the LLM review caught and the detector didn't: `bg-brand` (no shade suffix) is not a real utility in this project. `tokens.css` only defines `--color-brand-50` through `--color-brand-950` — there is no bare `--color-brand`. That class resolves to nothing, so the floating action button (line 224, pre-existing) and both mode-toggle buttons (lines 262, 270, added in this session) render with **no background color at all**. This is the one place detector-silence and design-review-finding directly diverge, and the design review was right to catch it.

**Visual overlays**: Not available for this run. The component only renders behind an authenticated, tenant-flagged (`compositor_correo_activo=true`) session; Assessment B confirmed the dev server boots cleanly and unauthenticated visits correctly redirect to `/login` with no compositor visible (expected), but had no credentials or seeded Supabase session to reach the authenticated view, and correctly stopped after one attempt rather than fabricating results.

## Overall Impression

The interaction logic here is genuinely careful — the deferred-focus-check pattern that prevents Reka UI's teleported dropdowns from closing the whole panel is not a beginner mistake to get right, and the live placeholder preview is a thoughtful touch. But the visual chrome around that logic was never brought into this project's actual design system: real Nuxt UI components exist for everything the hand-rolled buttons do, and one of those hand-rolled patterns (`bg-brand`) is simply broken CSS, not a style disagreement — it renders invisible. The single biggest opportunity is bringing this panel's chrome onto `UButton`/`UBadge` wholesale, which would fix the broken class, the missing focus rings, the missing `aria-label`s, and the "no Nuxt UI component reused" consistency issue all at once, in one pass.

## What's Working

- **The `alPerderFoco` deferred-focus fix** (lines ~202-216): correctly reasons through Reka UI's real DOM focus movement into a teleported listbox and re-checks `document.activeElement` after it settles, tracking the select's own open state separately. This is exactly the kind of edge case that produces "click X, whole panel vanishes" bug reports, and it's handled properly here.
- **Live placeholder preview with graceful fallback**: `asuntoPreview`/`cuerpoPreview` leave an unresolved `{{ params.x }}` visible instead of silently blanking it, so staff can catch a bad merge field before sending — a real trust-building detail for a tool that sends real email to real people.
- **Reuse of `UiSelectorBuscable` and `COMPOSITOR_FIELD_REGISTRY`**: the tercero search and the placeholder-chip list both pull from shared, systemic sources rather than being reinvented locally.

## Priority Issues

- **[P0] `bg-brand` renders no background at all.** The floating action button and both "Tercero"/"Correo manual" toggle buttons use a Tailwind class (`bg-brand`) that doesn't exist in this project's token scale (only `bg-brand-50`...`bg-brand-950` are defined). *Why it matters*: the primary entry point to this whole feature (the FAB) and its main mode switch render unstyled/invisible against most backgrounds — this isn't a taste issue, it's broken. *Fix*: replace `bg-brand` with `bg-primary-500` (or better, replace the raw `<button>`s with `<UButton color="primary">` per the next issue). *Suggested command*: `/impeccable polish`.

- **[P0] Hand-rolled buttons bypass Nuxt UI and the design system entirely.** The mode toggle (lines 259-274), the panel close button (242-250), and the placeholder-insert chips (316-330) are all raw `<button>` elements with manually composed Tailwind classes instead of `UButton`/`UBadge`. *Why it matters*: this loses focus-visible rings, the documented 32px minimum interactive target (the chips are ~20px tall), disabled/loading states, and consistent hover/active treatment — all for free if built on the components the rest of the app already uses. It's also the direct cause of the `bg-brand` bug above: hand-rolled markup is where an invalid class slips through unnoticed. *Fix*: `UButton size="xs" color="primary|neutral" variant="solid|subtle"` for the toggle, `UButton` with `icon` + `aria-label` for close, `UBadge` or `UButton variant="soft"` for the chips. *Suggested command*: `/impeccable polish`.

- **[P1] No loading state while `cargarTerceros`/`cargarPlantillas` are in flight.** A user opening "Tercero" mode before the fetch resolves sees `UiSelectorBuscable` with zero options and the exact same "Sin resultados" text a genuinely-empty catalog would show — no way to tell "still loading" from "no terceros exist." *Why it matters*: this is a real confusion point for a tool used many times a day; a user will assume the catalog is broken or empty and may switch to manual-email mode unnecessarily. *Fix*: gate the panel body with `USkeleton` (sized to the real content) until both stores resolve, per this system's documented loading-state convention. *Suggested command*: `/impeccable polish`.

- **[P1] Success auto-closes and wipes the form on an uncancelable 2-second timer.** After a successful send, `exitoEnvio` shows briefly, then `setTimeout(..., 2000)` force-closes the panel and clears all state — no way to review what was actually sent, and no way for a fast user to immediately compose a second email. *Why it matters*: sending a real email to a real third party is the highest-stakes moment in this panel; rushing the user out right after is the wrong note to end on, and it actively works against the "Alex" power-user persona's expectation of firing off several quick emails in a row. *Fix*: keep the success `UAlert` visible with an explicit "Cerrar" / "Enviar otro" action instead of a forced timeout. *Suggested command*: `/impeccable polish`.

- **[P2] Fixed `w-[560px]` panel width has no responsive ceiling.** The panel is `absolute` off a `fixed bottom-6 right-6` anchor with no `max-width` relative to viewport. *Why it matters*: on a narrow viewport (laptop with the app sidebar open, or a smaller screen) this can overflow the right edge or force horizontal scroll. *Fix*: add `max-w-[calc(100vw-3rem)]` alongside the fixed width. *Suggested command*: `/impeccable adapt`.

## Persona Red Flags

**Alex (Impatient Power User)**: No keyboard shortcut to open the composer — must mouse-hunt for a small, potentially invisible (see P0) FAB every time. The forced 2-second auto-close after send means Alex can't immediately fire off a second email without waiting out a timer neither requested nor controllable. The validation/send-error `UAlert`s live inside a `max-h-[500px] overflow-y-auto` body below the textarea — if Alex has scrolled down while composing, a newly-appeared error alert may not be visible at all.

**Sam (Accessibility-Dependent User)**: The panel close (×) button has no `aria-label`, only a bare SVG — a screen reader announces nothing useful. The two mode-toggle buttons show "Tercero"/"Correo manual" as visible text but set no `aria-pressed`, so a screen reader has no way to announce which mode is currently active. The placeholder-insert chips carry only a `title` attribute (not reliably announced) and no `aria-label`; clicking one silently appends text into the body textarea with no live-region confirmation. None of the hand-rolled buttons show a visible focus ring — only the `UInput`/`USelect`-owned controls get Nuxt UI's default ring — so Sam tabbing through mode-toggle → selector → template → subject → body → chips → footer loses the location cue exactly on the custom elements.

## Minor Observations

- `emailManual.value.includes('@')` is the entire manual-email validator — `"@"` alone passes; no format/domain check.
- `UFormField label="Para"` wraps a flex div containing two mode-toggle buttons *and* the actual picker control — a screen reader's label association between "Para" and the real input is ambiguous.
- The template dropdown offers no "manage templates" affordance from inside the panel; users must already know to navigate elsewhere to create/edit a `plantilla`.
- The FAB's `fixed bottom-6 right-6 z-50` positioning on every authenticated page wasn't checked against other floating UI (notifications, chat widgets) that might claim the same corner — worth a manual check, not verifiable from this file alone.

## Questions to Consider

- If sending a wrong email to a real third party is the worst-case outcome here, why is there no explicit "You are about to send to X" confirmation step, given other consequential actions in this codebase (payments, role changes) go through more ceremony?
- Why build a second bespoke button/chip visual language in this one component when `UButton`/`UBadge` already exist and are used everywhere else in the app — was this prototyped before the design system settled and never reconciled?
- Given staff use this for hours across a shift, should a "sent" confirmation persist as a small recent-sends log instead of vanishing after 2 seconds, so the peak moment doesn't double as the point where all evidence of it disappears?
