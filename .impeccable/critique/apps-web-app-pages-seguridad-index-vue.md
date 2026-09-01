# Impeccable Critique — apps/web/app/pages/seguridad/index.vue

**Reviewed:** 2026-09-13 19:45
**Model:** opencode/gemini-2.5-pro
**Prompt id:** imminent-reef
**Skill version:** 1.0.0

---

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | No loading skeletons, no error handling — API failures silently show zero counts |
| 2 | Match System / Real World | 3 | Domain-appropriate terminology, but "Módulos con acceso restringible" is jargon-heavy |
| 3 | User Control and Freedom | 2 | Navigation cards look identical to stat cards — no affordance that they're clickable |
| 4 | Consistency and Standards | 1 | 12× `gray-*` instead of `neutral-*`, `hover:border-indigo-500` breaks One Voice Rule, `rounded-lg` instead of `rounded-md` |
| 5 | Error Prevention | 1 | Zero error states — failed API calls render as silent zeros, indistinguishable from empty-but-healthy |
| 6 | Recognition Rather Than Recall | 2 | Hub's value over sidebar is unclear — stat cards are decorative, not actionable |
| 7 | Flexibility and Efficiency | 2 | Stat cards have no click-through; roles table has no search/filter/sort |
| 8 | Aesthetic and Minimalist Design | 3 | Visually restrained, no gradients/shadows/decoration — but stat cards are "overview noise" |
| 9 | Error Recovery | 1 | No error states, no retry, no contextual empty messages — "Sin registros" hides failures |
| 10 | Help and Documentation | 1 | No inline help, no tooltips on jargon, no explanation of what a "rol funcional" is |
| **Total** | | **18/40** | **Poor — significant UX overhaul required** |

## Design Specificity Verdict

**Category-interchangeable with domain coating.** The page is a 3-stat-cards + 2-link-cards + 1-read-only-table pattern architecturally indistinguishable from any SaaS admin panel. PH-specificity comes only from copy and the `MODULO_ETIQUETA` map — nothing about the layout, hierarchy, or interaction is authored for this domain. An auditoría or cartera page reads as *written for Aquila*; this page reads as a scaffold that happens to display PH labels.

**Deterministic scan:** 12 `gray-*` violations (should be `neutral-*`), 1 excessive spacing violation (`space-y-8`). The bundled `detect.mjs` returned empty — it doesn't scan Vue template `class=""` attributes for Tailwind class names, so these were caught by manual audit. The `design-system-coverage.test.ts` governance test should catch `gray-*` but appears not to cover this page.

## Overall Impression

A hub page that orients poorly and routes weakly. The three stat cards (members, roles, modules) are passive decoration — a power user already knows these rough numbers. The two navigation cards duplicate sidebar entries. The only genuinely valuable element — the roles functional catalog table — is buried at the bottom after two rows of cards the operator must parse and dismiss. The page's existence is questionable: every element is either decorative or redundant with the sidebar.

## What's Working

1. **UiTabla usage is correct.** The roles catalog uses the project's mandated table wrapper with proper column definitions and slot-based cell rendering. No raw `<UTable>`.
2. **UiTituloDescripcion for the section header.** The collapsible description pattern is correctly applied — the description "Catálogo de plataforma, de solo lectura aquí" is contextual and appropriately scoped.
3. **Non-blocking data loading.** Two parallel `useAsyncData` calls fetch members and the role catalog independently — a network failure in one won't block the other.

## Priority Issues

### [P0] Broken accent — One Voice Rule violation
`hover:border-indigo-500` on lines 56/62 uses Indigo (hue ~265), not Signal Blue (hue 255). Every hover state on the navigation cards emits a hue that doesn't exist in the Aquila palette. Fix: `hover:border-primary-500`.
**Fix:** `/impeccable polish` — replace `indigo-500` with `primary-500`
**File:** `seguridad/index.vue:56,62`

### [P0] 12× `gray-*` instead of `neutral-*`
`text-gray-500` and `border-gray-200` appear 13 times, violating the `neutral-* not gray-*` governance rule. The governance test `design-system-coverage.test.ts` should catch these.
**Fix:** `/impeccable polish` — replace all `gray-*` with `neutral-*`
**File:** `seguridad/index.vue:37,41,43,45,47,49,51,56,58,62,64,69,87`

### [P1] Zero error/loading states
No error handling for either `useAsyncData` call. No `USkeleton` loading states. If the API fails, the page renders with 0 counts and "Sin registros" — indistinguishable from an empty but healthy state. The operator cannot diagnose what went wrong.
**Fix:** `/impeccable harden` — add error ref, UAlert, USkeleton for loading
**File:** `seguridad/index.vue:14-19`

### [P1] `rounded-lg` instead of `rounded-md` on cards
Lines 41, 45, 49, 56, 62 use `rounded-lg` (8px) when the design system says `rounded-md` (6px) for cards and panels.
**Fix:** `/impeccable polish` — replace `rounded-lg` with `rounded-md`
**File:** `seguridad/index.vue:41,45,49,56,62`

### [P2] Stat cards have no click-through affordance
The 3 stat cards are purely decorative. Clicking "Miembros activos" should navigate to `/usuarios`. Clicking "Roles funcionales definidos" should scroll to or focus the roles table. Currently dead-end displays consuming vertical space.
**Fix:** `/impeccable shape` — add click-through or remove stat cards
**File:** `seguridad/index.vue:40-53`

### [P2] Navigation cards visually indistinguishable from stat cards
The link-cards use the exact same styling as the stat cards. No icon, no arrow, no visual cue they're clickable. The `hover:border-indigo-500` is the only hover signal.
**Fix:** `/impeccable shape` — add visual affordance (arrow icon, primary-colored border on hover)
**File:** `seguridad/index.vue:55-66`

## Persona Red Flags

### Alex (Power User)
- This page adds zero value over the sidebar — Alex already knows /usuarios and /auditoria exist. The hub is an extra click that delivers no additional information. Alex will never return after the first visit.
- The roles table has no search or filter. If the copropiedad has 10+ roles, Alex must visually scan a flat list with no way to find "which roles cover cartera?"

### Jordan (First-Timer)
- "Módulos con acceso restringible" is opaque — Jordan doesn't know what a "módulo" is in this context or why restricting access matters.
- Navigation cards look like stat cards. Jordan may not realize they're clickable without hovering.
- If `MODULO_ETIQUETA` doesn't cover a module, the raw snake_case key is displayed — Jordan won't understand `cuenta_corriente`.

### Sam (Accessibility-Dependent)
- Navigation cards are plain `<div>`/`<NuxtLink>` with no focus indicator beyond browser defaults. No `focus-visible:border-*` style defined — the `hover:border-indigo-500` has no focus equivalent.
- Stat cards have no semantic structure — `<div>` with `<p>` children, no `role="group"`, no `aria-label`. A screen reader announces "3 Miembros activos" as disconnected text fragments.
- The comma-separated module list in the roles table is not structured — a screen reader reads it as one long string.

## Minor Observations

- `space-y-8` (32px) is at the upper end — design system says "density over whitespace" and `gap-4`–`gap-6`. Consider `space-y-6`.
- The `UiTituloDescripcion` `clase-descripcion` prop passes `text-gray-500` — repeats the gray violation.
- No dark-mode support — all colors are hardcoded for light mode. The rest of the app has dark-mode variants.
- The `definePageMeta` `permiso: 'users:manage'` may be too restrictive for a hub page where the roles table is read-only.

## Questions to Consider

1. Does this page need to exist? If every element is either decorative or redundant with the sidebar, what is the hub adding? Could the roles table live directly on `/usuarios` as a collapsible section?
2. Who is the stat card row for? A PH admin managing 1 copropiedad probably knows their member count. Are these numbers for platform owners viewing a customer's copropiedad? If so, the permission gate is wrong.
3. Should the roles table invert its perspective — show modules as rows and which roles cover each one? That matches the operator's mental model for access auditing better.
4. Should the "Auditoría" link carry more visual weight? In a security context, audit trails are high-value — making it visually equal to "Usuarios" underweights observability.
