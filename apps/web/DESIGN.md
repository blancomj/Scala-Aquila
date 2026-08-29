---
colors:
  instrument-gray-100: "#ececee"
  instrument-gray-200: "#d9d9de"
  instrument-gray-300: "#c4c4ca"
  instrument-gray-400: "#8d8d93"
  instrument-gray-50: "#f5f5f6"
  instrument-gray-500: "#6b6b70"
  instrument-gray-600: "#55555a"
  instrument-gray-700: "#3d3d40"
  instrument-gray-800: "#28282a"
  instrument-gray-900: "#1b1b1d"
  instrument-gray-950: "#0b0b0c"
  signal-blue-100: oklch(0.94 0.04 255)
  signal-blue-200: oklch(0.88 0.07 255)
  signal-blue-300: oklch(0.80 0.10 255)
  signal-blue-400: oklch(0.72 0.13 255)
  signal-blue-50: oklch(0.97 0.02 255)
  signal-blue-500: oklch(0.56 0.17 255)
  signal-blue-600: oklch(0.50 0.17 255)
  signal-blue-700: oklch(0.46 0.15 255)
  signal-blue-800: oklch(0.38 0.13 255)
  signal-blue-900: oklch(0.30 0.10 255)
  signal-blue-950: oklch(0.22 0.07 255)
components:
  badge-primary:
    backgroundColor: "{colors.signal-blue-50}"
    padding: 2px 8px
    rounded: "{rounded.xs}"
    textColor: "{colors.signal-blue-700}"
  button-outline:
    backgroundColor: transparent
    padding: 8px 16px
    rounded: "{rounded.sm}"
    textColor: "{colors.instrument-gray-700}"
  button-primary:
    backgroundColor: "{colors.signal-blue-500}"
    padding: 8px 16px
    rounded: "{rounded.sm}"
    textColor: "#ffffff"
  button-primary-hover:
    backgroundColor: "{colors.signal-blue-600}"
description: Back-office SaaS for propiedad-horizontal liquidation and
  accounting --- precise, restrained, control-room grade.
name: Aquila PH
rounded:
  lg: 8px
  md: 6px
  sm: 5px
  xl: 10px
  xs: 3px
typography:
  body:
    fontFamily: Inter, ui-sans-serif, system-ui, sans-serif
    fontSize: 1rem
    fontWeight: 400
    letterSpacing: normal
    lineHeight: 1.5
  display:
    fontFamily: Inter Tight, ui-sans-serif, system-ui, sans-serif
    fontSize: clamp(1.5rem, 3vw, 4.5rem)
    fontWeight: 500
    letterSpacing: "-0.01em"
    lineHeight: 1.1
  label:
    fontFamily: Inter, ui-sans-serif, system-ui, sans-serif
    fontSize: 0.875rem
    fontWeight: 600
    letterSpacing: normal
    lineHeight: 1.25
---

# Design System: Aquila PH

## Overview

**Creative North Star: "The Control Room"**

Aquila PH is instrumentation, not a storefront. Its staff users spend
hours a day inside it running liquidations, chasing cartera, and
reconciling accounts --- the interface's job is to stay out of the way
of that work, the way a well-run control room's panels stay legible
under sustained, high-volume use rather than trying to impress on first
glance.

The system reads as **precise and confiable (trustworthy)**: nothing is
decorative without functional value, nothing moves without a reason, and
the one accent color exists to mean "act here," never to add visual
interest. Neutrals --- a cold, instrument-panel gray --- carry almost
the entire visual weight; the single brand hue (Azul Señal / Signal
Blue) is spent sparingly, the way a control panel reserves its one
colored light for the signal that actually matters. Depth comes from a
border or a surface-color step, never a shadow with weight to it; radius
is small and consistent everywhere, which reads as *engineered*, not
soft or approachable-for-its-own-sake.

This is deliberately **not** a generic SaaS-marketing dashboard
aesthetic. It has no aspiration to feel spacious, airy, or delightful in
the way a landing page does --- it aspires to feel dense, correct,
auditable, and fast to scan, because the person using it is doing
accounting-grade work under time pressure, many times a day.

The product's visual character must also communicate **financial rigor
and auditability**. Aquila's interface should reinforce that monetary
results are expected to be decimal-exact, deterministic, traceable, and
reviewable. The visual language therefore favors explicit states, clear
provenance, stable layouts, and unambiguous relationships between
inputs, calculations, results, approvals, and audit information.

**Key Characteristics:** - One accent, spent rarely --- everything else
is neutral gray doing structural work. - Flat by construction ---
border/surface-step depth, no dramatic shadows. - Small, consistent
radius (3--10px) --- reads as engineered, not soft. - Density and
legibility outrank whitespace and "breathing room." - Financial
correctness and auditability are communicated through clarity and
explicit state, not decoration. - Every interactive/status color routes
through a semantic token
(`primary`/`neutral`/`success`/`warning`/`error`) --- never a hardcoded
hex/oklch in markup.

## Colors

One accent hue, everything else neutral. The rule that governs this
system:

**The One Voice Rule.** The brand accent (Signal Blue, oklch hue 255) is
the *only* accent in the system. It never shares the stage with a second
competing hue --- status colors (success/warning/error) are semantic,
not decorative, and route through Nuxt UI's own defaults rather than the
brand hue.

### Primary

-   **Azul Señal / Signal Blue** (`oklch(0.56 0.17 255)`, scale
    50--950): the single accent. Primary actions, links, focus rings,
    selected/active states. Nothing else in the interface competes with
    it for attention --- it marks "you can act here" and nothing more.

### Neutral

-   **Gris Instrumento / Instrument Gray** (`#6b6b70` at 500, scale
    50--950): text, borders, surfaces, dark-fill controls. This scale
    does almost all of the system's visual work --- panels, dividers,
    disabled states, and body text all live here rather than reaching
    for the accent.

### Semantic (not part of this system's token scale --- Nuxt UI defaults, intentionally unmodified)

-   **success / warning / error**: status, validation, destructive
    actions. Kept as Nuxt UI's own accessible defaults rather than
    brand-matched, on the stated principle that they only need to be
    correct and recognizable, not on-brand.

### Named Rules

**The One Voice Rule.** See above --- one accent, no exceptions, no
second hue introduced for variety.

**The Semantic-Only Color Rule.** No hex/oklch value is ever hardcoded
in component markup --- every color reaches the DOM through
`primary`/`neutral`/`success`/`warning`/`error` (or, in the legacy
`ficha-inmueble.css` tree, through its own named variables that resolve
to these same tokens).

**The `neutral-*` Not `gray-*` Rule.** New code uses the `neutral-*`
scale (or Nuxt UI's semantic classes like `text-muted`/`border-default`)
--- never Tailwind's default `gray-*`. Enforced by
`tests/governance/design-system-coverage.test.ts`. (Pre-existing
`gray-*` usage from before this was unified is not being retroactively
migrated --- the visual difference is negligible --- but no new `gray-*`
is accepted.)

## Typography

**Display Font:** Inter Tight (with
`ui-sans-serif, system-ui, sans-serif` fallback) **Body Font:** Inter
(with `ui-sans-serif, system-ui, sans-serif` fallback)

**Character:** Inter Tight's slightly condensed, higher-contrast forms
mark headings as structural labels rather than editorial statements;
Inter carries everything else at a size built for scanning dense tables
and forms, not long-form reading.

### Hierarchy

-   **Display --- hero** (font-semibold, `text-7xl` ≈72px): reserved for
    exceptional product/marketing surfaces, if any. It is not used in
    normal operator surfaces.
-   **Display --- page** (font-semibold, `text-5xl` ≈52px): reserved for
    exceptional page-level presentation, not normal back-office pages.
-   **Title** (font-semibold, `text-4xl` ≈36px): section headings.
    Normal operator pages should prefer this level or smaller according
    to context and available space.
-   **Subheading** (font-medium, `text-2xl`, 24px): subheadings within a
    page.
-   **Body --- long-form** (`text-lg`, 18px): long-form body copy where
    it appears.
-   **Body --- standard** (`text-base`, 16px): standard body text.
-   **Label** (font-semibold, `text-sm`, 14px): form labels, table
    headers --- Nuxt UI components set this internally; don't override
    it ad hoc.
-   **Metadata** (font-medium, `text-xs`, 12px): fine print and
    secondary metadata. This is the floor for metadata; nothing in the
    system goes smaller.

### Named Rules

**The Two-Font Floor Rule.** Never use a font outside Inter / Inter
Tight, and never drop below `text-xs` (12px) --- legibility at density
is a constraint, not a suggestion.

**The Operator Heading Rule.** Normal back-office/operator surfaces do
not use hero-scale or marketing-scale headings. Page titles must remain
compact enough to preserve vertical space for filters, tables, forms,
and operational content. Heading size should serve hierarchy and
scanning, not visual impact.

**The Context Text Rule.** Text must be sized according to its role
rather than automatically shrunk because it is secondary: -
metadata/fine print: `text-xs` (12px); - help text and compact guidance:
`text-xs`--`text-sm` (12--14px), according to readability; - contextual,
legal, or explanatory text that users are expected to read: normally
`text-sm` (14px) or `text-base` (16px) when required; - standard body:
`text-base` (16px). Contextual/legal text must not be reduced below a
readable size merely to save space.

## Layout

Layout (sidebar, topbar, grids) is plain Tailwind utility classes
(`flex`, `grid`, `gap-*`, `p-*`) --- Nuxt UI owns components, not
layout. The system favors **density over whitespace**: this is an
operator tool viewed for hours across many rows/fields per screen, not a
marketing surface meant to feel spacious.

**Operational Density Rule.** Preserve the maximum amount of useful
information that can be presented comfortably and scanned quickly. Do
not increase component height, padding, gaps, whitespace, or container
size merely to create a more "airy" or minimalist appearance. Any
increase in visual space should have a functional reason: hierarchy,
grouping, readability, touch interaction, responsive adaptation, or
error prevention.

Minimum interactive target is 32px on desktop, 44px on touch-facing
views. Density must never reduce legibility or make interactive targets
difficult to use.

## Elevation & Depth

**The Border-Over-Shadow Rule.** This system is flat by default. Depth
is conveyed through a border or a one-step surface-color change, not a
shadow --- shadows exist only as Nuxt UI's own restrained
`shadow-sm`/`shadow-md`/`shadow-lg` defaults, used sparingly (e.g., a
popover or dropdown lifting off the page), never as a decorative "card
floating on a gradient" effect. There is no elevation system beyond that
--- no custom shadow tokens were introduced.

## Shapes

Radius is small and uniform across the whole system, which is itself a
rule: `rounded-xs` (3px) for the tightest chrome, `rounded-sm` (5px) for
buttons and form fields, `rounded-md` (6px) for cards, panels, and
modals, `rounded-lg`/`rounded-xl` (8/10px) reserved for large feature
modules, and `rounded-full` for avatars and status dots only. This scale
was deliberately recalibrated down twice from a more spacious starting
point (originally 8/14/20/28) because larger radii read as "pill-
shaped" on this back-office's compact \~36px controls --- see
`apps/web/app/assets/css/tokens.css`.

**The Contained-Radius Rule.** Never reach for a radius outside this
five-step scale, and never use a larger radius than the component class
calls for (a button is never `rounded-xl`).

## Components

### Buttons

-   **Shape:** `rounded-sm` (5px).
-   **Primary:** Signal Blue solid background, white text ---
    `<UButton color="primary" variant="solid">`.
-   **Secondary/Cancel:** neutral outline ---
    `<UButton color="neutral" variant="outline">`.
-   **Tertiary:** `variant="link"` for lower-emphasis actions ("Ver
    más").
-   **Destructive:** `color="error" variant="solid"` --- reserved for
    irreversible actions (delete).
-   **Disabled:** use the `disabled` prop, never a dimmed style alone.

### Badges / Status

-   **Style:** `variant="subtle"` --- soft-tinted background, not solid
    fill, for status chips.
-   **Semantics:** `primary` for "new," `success` for "al día," `error`
    for "en mora" --- status color is always semantic, never decorative.

### Cards / Containers

-   **Corner Style:** `rounded-md` (6px).
-   **Shadow Strategy:** none by default --- a border or neutral-50/100
    surface step does the separation.
-   **Border:** `neutral-200` hairline is the default separator.

### Inputs / Fields

-   **Style:** `rounded-sm` (5px), neutral border.
-   **Focus:** visible ring in the `primary` (Signal Blue) color ---
    never stripped via `focus:outline-none`.
-   **Error:** `color="error"` on the field plus an inline `UAlert`
    beside the field for errors the user needs to read deliberately (not
    a toast, which is reserved for confirming success).
-   **Help/description text:** `text-xs`--`text-sm` according to the
    Context Text Rule; do not reduce explanatory/legal text below a
    readable size merely for compactness.

### Loading & Feedback

-   **Success feedback:** `useToast()` confirms an action completed
    (create/update/delete) --- never silence after a "Guardar" click.
    Not used for every micro-action; an inline toggle that already
    changes visibly in place doesn't need a toast.
-   **Loading states with a known shape:** `USkeleton`, sized to
    approximate the real content it replaces --- never plain
    "Cargando..." text or a hand-rolled `animate-pulse` div.

### Tables & Searchable Selects (signature components)

-   **Tables:** always `<UiTabla>`
    (`apps/web/app/components/ui/UiTabla.vue`), never a raw `<UTable>`
    --- the wrapper every table in the app already uses.
-   **Searchable/long-catalog selects:** always `<UiSelectorBuscable>`
    (`apps/web/app/components/ui/UiSelectorBuscable.vue`), never a raw
    `<USelectMenu>` (which has no theming of its own in this project). A
    short, non-searchable list still uses plain `<USelect>`.

### Out of scope for this document

-   **Dataviz** (`components/cartera/*Chart.vue` and similar): charts
    need a categorical multi-tone palette (e.g., delinquency-age
    buckets), not the single accent --- governed by the `dataviz` skill,
    not this file.
-   **AEL formula editor syntax highlighting**
    (`utils/ael-codemirror.ts`): code-token colors follow code-editor
    convention, not brand.

## Do's and Don'ts

### Do:

-   **Do** reach for a `U*` Nuxt UI component before any raw HTML
    element or custom-built equivalent.
-   **Do** drive every color through
    `primary`/`neutral`/`success`/`warning`/`error` --- never a literal
    hex/oklch in markup.
-   **Do** keep the accent scarce --- most of any screen should read as
    neutral gray.
-   **Do** match radius to the component's class (`rounded-sm`
    buttons/fields, `rounded-md` cards).
-   **Do** use `<UiTabla>` for every table and `<UiSelectorBuscable>`
    for every searchable/long select.
-   **Do** confirm success with a toast and reserve inline `UAlert` for
    errors the user must read.

### Don't:

This system optimizes for an operator scanning dense data all day, not
for a first-glance marketing impression. Each of the following is a
verifiable bar, not a matter of taste:

-   **Don't** wrap content in a card unless it is a genuinely discrete,
    scannable unit --- a page section split into 3+ cards where a single
    table/list would do the same job is the smell to catch.
-   **Don't** use section/page padding beyond the scale already in use
    elsewhere in the app (`p-4`--`p-6`, `gap-4`--`gap-6`). No
    `p-12`+/`gap-12`+ "hero-style" spacing on operator screens.
-   **Don't** use a `linear-gradient`/`radial-gradient` background
    anywhere in the operator surface --- zero usages is the bar, not
    "used sparingly."
-   **Don't** use `backdrop-filter: blur(...)` or any translucent-panel/
    glassmorphism effect.
-   **Don't** exceed Nuxt UI's own `shadow-sm`/`shadow-md`/`shadow-lg`
    defaults --- no custom `box-shadow` value anywhere.
-   **Don't** add decorative illustration/SVG assets. Icons come only
    from the already-adopted Lucide set (`@iconify-json/lucide`) and
    only to label a real action or status --- never as pure decoration.
-   **Don't** ship a transition/animation that isn't tied to a real
    state change (hover, focus, loading, success) or that runs longer
    than ~200ms. No scroll-triggered or entrance animations.
-   **Don't** stack an icon next to a label that already says the same
    thing, and never use an icon-only control without an `aria-label`.
-   **Don't** scale a control above this system's established compact
    size (~36px control height) for visual emphasis --- use color/weight
    (`primary` color, `font-semibold`) instead of size.
-   **Don't** trade away density or operational efficiency for a
    "cleaner-looking" minimalist layout --- legibility-at-density is the
    actual goal, not whitespace for its own sake. This is the
    **Operational Density Rule** (see Layout).
-   **Don't** hardcode a hex/oklch color in component markup.
-   **Don't** introduce a second accent hue for "variety."
-   **Don't** rebuild a component Nuxt UI already provides (a custom
    button, a custom modal).
-   **Don't** strip built-in focus-visible rings or ARIA behavior with a
    custom reset.
-   **Don't** use a raw `<UTable>` or `<USelectMenu>` --- use the
    project's `<UiTabla>` / `<UiSelectorBuscable>` wrappers instead.
-   **Don't** introduce new `gray-*` Tailwind classes --- use
    `neutral-*` or Nuxt UI's semantic classes.
