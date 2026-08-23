# Northline Design System — Nuxt UI v4 + Tailwind v4

**Instructions for AI coding assistants (Claude Code, Cursor, Copilot, etc.):** this app is built on **Nuxt UI v4** (`@nuxt/ui`), which ships Tailwind v4 as its styling base. Always prefer a Nuxt UI component (`UButton`, `UBadge`, `UInput`, etc.) over raw HTML elements — they already carry correct focus rings, ARIA, and dark-mode handling. Only reach for raw Tailwind utility classes for layout (flex/grid/spacing), never to reimplement something Nuxt UI already provides. Never hardcode hex/oklch colors in component markup — always go through the `primary` / `neutral` / `success` / `warning` / `error` color props, which resolve to the tokens below.

> ⚠️ Exact prop names/variants below reflect Nuxt UI's public API as of v4. Since this project's actual `@nuxt/ui` version wasn't inspected directly, verify against `node_modules/@nuxt/ui` or the Nuxt UI docs before relying on an unusual prop.

## Setup

1. Copy `tokens.css` into your project and import it **after** Tailwind in your main CSS:
   ```css
   @import "tailwindcss";
   @import "./design-system/tokens.css";
   ```
2. Merge `app.config.ts` into your project's `app.config.ts` (or add the `ui.colors` block if the file already exists):
   ```ts
   export default defineAppConfig({
     ui: { colors: { primary: 'brand', neutral: 'neutral' } },
   });
   ```
3. Load fonts: `Inter:wght@400;500;600` and `Inter Tight:wght@500;600;700`.
4. Source of truth: `Design System.dc.html`. If it changes, update `tokens.css` and this file to match.

## Color

Rule: neutrals do almost all the work. One accent hue (`brand`, oklch hue 255) covers every interactive state — never introduce a second competing accent.

| Nuxt UI alias | Token | Use |
|---|---|---|
| `primary` | `brand` scale (50–950) | Primary actions, links, focus rings |
| `neutral` | `neutral` scale (50–950) | Text, borders, surfaces, dark-fill controls |
| `success` / `warning` / `error` | Nuxt UI defaults | Status, validation, destructive actions |

Don't override `success`/`warning`/`error` unless the brand explicitly needs it — Nuxt UI's defaults are already accessible and recognizable.

## Typography

`font-display` (Inter Tight) for headings, `font-sans` (Inter, Nuxt UI's default) for everything else.

| Class | Size | Use |
|---|---|---|
| `font-display text-7xl font-semibold tracking-tight` | ~72px | Hero headlines only |
| `font-display text-5xl font-semibold tracking-tight` | ~52px | Page-level hero |
| `font-display text-4xl font-semibold tracking-tight` | ~36px | Section headings |
| `font-display text-2xl font-medium` | 24px | Subheadings |
| `text-lg` | 18px | Long-form body |
| `text-base` | 16px | Standard body |
| `text-sm font-semibold` | 14px | Labels (Nuxt UI components set this internally) |
| `text-xs font-medium` | 12px | Metadata, fine print |

Never drop below `text-xs` (12px). Never use a font outside Inter / Inter Tight.

## Radius & elevation

`rounded-sm` (5px) for buttons/fields, `rounded-md` (6px) for cards/panels/modals, `rounded-lg`/`rounded-xl` (8/10px) for large feature modules, `rounded-full` for avatars/dots. Depth stays restrained — prefer a border or surface-color step over a shadow; when needed, Nuxt UI's default `shadow-sm`/`shadow-md`/`shadow-lg` are fine as-is.

> **Recalibrado (23-08-2026, dos pasadas):** la escala original (8/14/20/28) venía de un sistema pensado para layouts espaciosos y se veía como píldora en los controles compactos (~36px) de este back-office — ver `apps/web/app/assets/css/tokens.css` para el detalle. Bajada una vez a 8/10/12/14, y una segunda vez más a 5/6/8/10. La jerarquía sm < md < lg < xl se mantiene, con pasos ya mínimos.

## Component recipes (Nuxt UI)

**Buttons**
```html
<UButton color="primary" variant="solid">Guardar</UButton>
<UButton color="neutral" variant="outline">Cancelar</UButton>
<UButton color="primary" variant="link">Ver más</UButton>
<UButton color="error" variant="solid">Eliminar</UButton>
<UButton disabled>Disabled</UButton>
```

**Badges / status**
```html
<UBadge color="primary" variant="subtle">Nuevo</UBadge>
<UBadge color="success" variant="subtle">Al día</UBadge>
<UBadge color="error" variant="subtle">En mora</UBadge>
```

**Form fields**
```html
<UFormField label="Correo" error="Ingresa un correo válido.">
  <UInput v-model="email" color="error" />
</UFormField>
<USelect v-model="torre" :items="['Torre A', 'Torre B', 'Torre C']" />
<UCheckbox v-model="notify" label="Notificar por correo" />
<URadioGroup v-model="tipo" :items="['Apartamento', 'Local comercial', 'Parqueadero']" />
```

**Cards / tables / navigation**
```html
<UCard :ui="{ rounded: 'rounded-md' }"> ... </UCard>
<UTable :data="rows" :columns="columns" />
<UTabs :items="tabs" />
<UModal v-model:open="open"> ... </UModal>
<UAvatar text="JS" />
<UDropdownMenu :items="menuItems" />
```

Layout (sidebar, topbar, grids) stays plain Tailwind utility classes (`flex`, `grid`, `gap-*`, `p-*`) — Nuxt UI doesn't own layout, only components.

> **Verificado contra `@nuxt/ui@4.10.0` instalado en este proyecto (23-08-2026):** la versión original de esta receta traía `UTable :rows` y `UModal v-model="open"` — ambos desactualizados, ya corregidos arriba (`UTable` usa `data`/`columns`; `UModal` expone `open`/`update:open`, se enlaza con `v-model:open`, confirmado en el tipo `DialogRootProps` de `reka-ui`). El resto de las recetas (Button, Badge, FormField, Select, Checkbox, RadioGroup, Avatar, DropdownMenu) sí coincide con la versión instalada.
>
> **Excepciones ya establecidas en este proyecto — no reintroducir el componente crudo:**
> - **Tablas**: nunca `<UTable>` directo — usar `<UiTabla>` (`apps/web/app/components/ui/UiTabla.vue`), el wrapper que ya usan las 36 tablas de la app.
> - **Selects buscables / catálogos largos**: nunca `<USelectMenu>` — usar `<UiSelectorBuscable>` (`apps/web/app/components/ui/UiSelectorBuscable.vue`), construido a propósito porque `USelectMenu` no tiene theming propio en este repo (ver su comentario de cabecera). `<USelect>` crudo sigue bien para listas cortas sin necesidad de búsqueda.

## Accessibility

- Prefer Nuxt UI components: they already manage focus-visible rings and ARIA roles correctly. Don't strip that with `focus:outline-none` or custom resets.
- If you must build a custom interactive element Nuxt UI doesn't cover, give it a real `<button>`, a visible focus ring using the `primary` color, and an `aria-label` when icon-only.
- Minimum interactive target: 32px on desktop, 44px on touch-facing views.
- Use the `disabled` prop, not just a dimmed style.

## Do & don't

**Do** — reach for a `U*` component first; drive all color through `primary`/`neutral`/semantic props; keep the accent scarce; match radius to component class.
**Don't** — hardcode hex/oklch in markup; add a second accent hue; rebuild a component Nuxt UI already provides; strip built-in focus/ARIA behavior.

## `ficha-inmueble.css` (drawers, ficha de inmueble, comprobante público)

Ese árbol (`.ficha-inmueble`, `apps/web/app/assets/css/ficha-inmueble.css`) ya no tiene paleta ni tipografía propias (unificado 23-08-2026) — sigue teniendo sus propios *nombres* de variable (`--sello`/`--oro`/`--ladrillo`/`--gris`/`--ink`/`--paper`...) porque ~180 usos en ese archivo y en los componentes de ficha/drawers los referencian por nombre, pero cada uno apunta al token equivalente de acá: `--sello`→`success`, `--oro`→`warning`, `--ladrillo`→`error`, `--ink`/`--paper`/`--gris`/`--line`→escala `neutral`, `--font-sans`/`--font-mono`→`font-sans` (Inter), `--font-serif`→`font-display` (Inter Tight). Regla al agregar código nuevo ahí: usa esas variables locales igual que siempre (`var(--sello)`, `var(--ink)`...) para el *estado* — pero si lo que estás construyendo es una **interacción** (botón primario, pestaña activa, enlace, anillo de foco, opción resaltada de un combobox), usa `var(--color-brand-*)` directo, no `var(--sello)` — "sello" es un estado (certificado/activo), no un rol de interacción, aunque en el mockup original compartieran el mismo verde por casualidad.

## Fuera de alcance a propósito

Este doc gobierna la *interfaz* (componentes, formularios, navegación). No gobierna:
- **Dataviz** (gráficas de `components/cartera/*Chart.vue`, `pages/cartera/index.vue`): necesitan una paleta categórica de varios tonos distinguibles (ej. escalones de mora), no el acento único — usa la skill `dataviz` para eso, no `primary`/`brand`.
- **Syntax highlighting** (`utils/ael-codemirror.ts`, tema del editor de fórmulas AEL): los colores de tokens de código (keywords, strings...) son una convención propia de editores de código, no de marca.

## `gray-*` de Tailwind vs `neutral-*`

Antes de este unificado, la app usaba masivamente las clases `gray-*` por defecto de Tailwind (904 usos en 66 archivos, verificado 23-08-2026) en vez de la escala `neutral-*` de acá. No se migran retroactivamente (mismo criterio costo/beneficio que D-24 en DECISIONES.md — el resultado visual es casi idéntico, `neutral-500` `#6b6b70` vs `gray-500` `#6b7280`). **Hacia adelante sí aplica**: código nuevo no debe introducir `gray-*` — usa `neutral-*`, o mejor, las clases semánticas de Nuxt UI (`text-muted`, `text-dimmed`, `border-default`, etc.) cuando el componente las expone. Hecho cumplir por `tests/governance/design-system-coverage.test.ts` (D-26, DECISIONES.md).
