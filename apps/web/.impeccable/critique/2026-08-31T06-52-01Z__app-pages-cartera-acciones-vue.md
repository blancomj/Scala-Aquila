---
target: cartera/acciones.vue
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
timestamp: 2026-08-31T06-52-01Z
slug: app-pages-cartera-acciones-vue
---
Method: dual-agent (A: design-review sub-agent · B: detector/browser-evidence sub-agent) — re-critique after the P0/P1 fix pass

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 4/4 | `USkeleton` now covers initial table load and evidence-panel load; counters update live and correctly post-dispatch |
| 2 | Match System / Real World | 4/4 | Aprobada/Ejecutada/Acreditada still kept distinct; toast still teaches "despachado ≠ entregado" |
| 3 | User Control and Freedom | 3/4 | Send now has real Cancel + Escape-to-dismiss (both leave state unchanged); still no undo once a decision is committed |
| 4 | Consistency and Standards | 2/4 | `rounded-xl` (10px) on KPI cards/context panel instead of prescribed `rounded-md`; active filter pill still ships a real `box-shadow` against the flat-by-construction rule — both unresolved from last round |
| 5 | Error Prevention | 3/4 | Modal genuinely blocks the accidental send (Cancel/Escape/Confirm all verified correct); docked one point for a copy bug in the confirmation sentence itself |
| 6 | Recognition Rather Than Recall | 3/4 | Blocked-decision and blocked-dispatch reasons are now visible inline text, not title-only; the visible label is still a short gloss, full explanation stays title-only |
| 7 | Flexibility and Efficiency | 1/4 | No bulk approve/dispatch, no keyboard shortcuts, "Actualizar" still manual-only |
| 8 | Aesthetic and Minimalist Design | 3/4 | Appropriately dense; undersized/low-contrast KPI and modal-grid labels are the main blemish |
| 9 | Error Recovery | 3/4 | Three distinct dispatch-failure toasts still present and correctly differentiated |
| 10 | Help and Documentation | 3/4 | Art. 48 now surfaced in-product for non-admins (was comments-only); still nothing proactive explains "acreditada" outside a reactive toast |
| **Total** | | **29/40** | **Good — up from 24/40** |

## Design Specificity Verdict

**LLM assessment:** Still genuinely domain-authored, and the fixes reinforce it — the confirmation modal doesn't say a generic "¿Estás seguro?", it names channel, recipient, contact, and unit, and states the exact consequence. The disabled-reason logic mirrors the DB trigger exactly. Where it still reads generic is the visual chrome: `rounded-xl` KPI cards, a shadowed active-tab pill, and `text-[10px]` labels are dashboard-boilerplate patterns DESIGN.md explicitly forbids — and this is the **second consecutive critique** flagging the same three untouched.

**Deterministic scan:** `detect.mjs` on the file: exit 2, 15 findings, all the same advisory rule (`design-system-font-size`) on the same content as last round — the 5 KPI-card labels and 10 modal field labels, just shifted line numbers. The live-DOM pass reconfirmed low contrast (measured `rgb(107,107,112)` on `rgb(27,27,29)` ≈ 3.25:1, need 4.5:1) on those same 5 labels, and additionally caught **8px badge text** on the Prueba column's "Acreditada"/"Rebotado"/"Fallido" badges — inherited from Nuxt UI's `UBadge size="xs"`, not a literal class in this file, so out of this file's direct control. The confirmation modal's own computed styles (8px panel radius, 5px button radius, Signal Blue hue-255 accent, Nuxt UI's own `shadow-lg`) were independently verified to match DESIGN.md's documented tokens — the new modal itself is compliant; the pre-existing KPI/tab chrome is what remains non-compliant.

## Overall Impression

The P0 is genuinely fixed, not checkbox-fixed — both assessments independently verified live that Cancel, Escape, and Confirm all behave correctly, and the modal's copy does real work (naming exactly what's about to happen and why it can't be undone). The score moved from 24/40 to 29/40, crossing from "Acceptable" into "Good." But the same three cosmetic DESIGN.md violations flagged last time are completely untouched, and a new small defect appeared in the process: the confirmation sentence — the one line in the product designed to make someone slow down — reads as "Vas a despachar SMS por SMS a..." for the two automatic channels, a redundant, slightly broken-sounding sentence at exactly the moment credibility matters most.

## What's Working

1. **The confirm modal is substantively good, not decorative.** Names channel + recipient + contact + unit and states the specific irreversibility consequence; Cancel, Escape, and Confirm all live-verified to behave correctly, with no accidental-send path through backdrop or Escape.
2. **Skeleton states are correctly shaped, not generic bars.** Table skeleton uses row-height blocks, evidence skeleton uses card-height blocks matching the real content, and the banned "Cargando…" text is gone.
3. **The dispatch toast still actively teaches the domain's central distinction** at the exact moment a user could conflate "sent" with "delivered" — unchanged and still working well.

## Priority Issues

**[P2] Confirm-modal copy reads broken for the most common case ("SMS por SMS")**
- Why it matters: live-verified the modal literally renders "Vas a despachar **SMS** por **SMS** a Hernan Gutierrez" for SMS, and the same redundancy hits plain email reminders ("Correo por Correo"). This is the one sentence explicitly designed to make someone slow down and read before an irreversible action — a redundant, slightly nonsensical sentence undermines that credibility right when it matters most.
- Fix: only show the "por {canal}" clause when it adds information — e.g. skip the canal clause when `tipoAccion === canal`.
- Suggested command: `/impeccable clarify`

**[P2] KPI-card and modal-grid labels still fail both the size floor and contrast — unresolved, second consecutive critique**
- Why it matters: same `text-[10px]` labels, same ~3.25:1 contrast in dark mode (need 4.5:1), same 15 detector findings, untouched since the last report. Live-DOM pass additionally found 8px text on the Prueba-column badges (inherited from Nuxt UI's `UBadge size="xs"`, not directly fixable in this file without a component-level override).
- Fix: bump the 5 KPI + 10 modal labels to `text-xs` (12px) and a neutral shade (e.g. `neutral-400` in dark mode) that clears 4.5:1.
- Suggested command: `/impeccable typeset`

**[P2] `rounded-xl` and `shadow-sm` still violate the flat/radius-scale rules — unresolved, second consecutive critique**
- Why it matters: KPI cards and the modal context panel compute to 10px radius (`rounded-xl`) against DESIGN.md's prescribed `rounded-md` (6px) for cards/panels; the active filter-tab pill still computes a real `box-shadow`, contradicting "depth via border or surface-color step, never decorative shadows." Same finding, same file, zero change since last round.
- Fix: `rounded-md` on KPI cards/context panel; drop `shadow-sm` from the active-tab class.
- Suggested command: `/impeccable layout`

**[P3] Mobile layout still breaks at 375×812 — unresolved, downgraded priority**
- Why it matters: the 7-item filter-tab row still overflows/truncates and the table still needs an independent horizontal scroll to reach Estado/Prueba/Enviar. Downgraded from P2 specifically because the new confirm modal now restates unit/recipient/channel before any send fires, so the "which row did I even press" risk from scrolling is now caught by the modal rather than causing a blind send.
- Fix: wrap or scroll-contain the tab row independently; consider a responsive column-priority scheme instead of one wide table.
- Suggested command: `/impeccable adapt`

**[P3] Icon-only "Ver detalle" button has no `aria-label`, only `title` — now confirmed**
- Why it matters: DOM-confirmed `aria-label` is null; the only accessible name comes from `title`. Browsers do fall back to `title` for the accessible name, so it's not a hard dead end, but it's the exact pattern the file's own code comments reject elsewhere.
- Fix: add an explicit `aria-label` matching the existing `title` text.
- Suggested command: `/impeccable audit`

## Persona Red Flags

**Alex (Power User):** The single-row workflow is smooth now — search, click Enviar, read the modal, confirm, watch counters update live. But processing a stack of pending sends still means a full modal round-trip per row with zero bulk lever anywhere. The fix solved the too-little-friction problem correctly but did nothing for the no-efficiency-path problem flagged last round — the one place Alex most wants speed is still the slowest workflow on the page.

**Riley (Stress Tester):** Two things that used to break are now solid — rapid double-clicking "Enviar" can't double-fire a send (the first click only opens the modal), and Escape/Cancel/backdrop-dismiss all leave state untouched. But the confirm-modal sentence itself reads broken for SMS/email actions, a long destinatario name still has no truncate/max-width on its cell, and the KPI/modal labels are unreadable at low contrast in dark mode — the numbers on this page are legible; the words explaining what they mean are not.

## Minor Observations

- Search still filters the table but not the 5 KPI counters — plausibly intended, still unconfirmed as deliberate.
- "Fallidas" remains the only non-clickable, second-most-urgent card; only "Esperan aprobación" is wired as a filter shortcut.
- The evidence-upload flow (tipo de constancia + file input + "Adjuntar constancia") is well-executed in isolation — correctly disabled until both fields are set, uses `UiSelectorBuscable` per the design system's own rule.
- One additional near-miss found live: the "Enviar" button's own text measured 4.4:1 contrast, just under the 4.5:1 threshold.
- Art. 48 is now visible to non-admins as a permission explanation, but the admin who actually approves never sees the legal basis surfaced anywhere in the UI — only the person blocked from acting sees it.

## Questions to Consider

1. The modal now treats a routine SMS reminder and a formal legal notice (`requerimiento_formal`/`aviso_prejuridico`) with identical confirmation weight. Should a legal notice get harder confirmation (e.g. typed unit code) than a routine SMS, or is uniform friction the deliberate trade-off?
2. Two consecutive critiques have now flagged the same `rounded-xl`/`shadow-sm`/`text-[10px]` findings untouched. Is visual-chrome drift simply lower priority than functional fixes for this team, or did the fix pass just not include a DESIGN.md token pass?
3. Art. 48 is now visible to the person blocked from approving, but not to the admin who actually approves. Should the person wielding the legally load-bearing action see the legal basis for it too?
