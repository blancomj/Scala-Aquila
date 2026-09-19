# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

AQUILA — SaaS multi-tenant para administración de propiedad horizontal (PH), con un motor de
liquidación formulado mediante AEL, un lenguaje de reglas de negocio propio. pnpm monorepo,
TypeScript strict, Nuxt 4 SSR + Supabase (Postgres/RLS + Edge Functions en Deno).

Read the governance docs before making non-trivial changes, in this order (precedence is defined
in `PLAN_MAESTRO_IMPLEMENTACION.md` §0.1):

| Document | Contents |
|---|---|
| `PLAN_MAESTRO_IMPLEMENTACION.md` | **Execution contract.** Closed decisions (AD-xx), domain schema, phases. Read §9 (Definition of Done, absolute prohibitions) before any commit. |
| `PROMPT_MAESTRO_FASE1.md` | Identity: auth, tenants, RBAC, RLS |
| `DECISIONES.md` | Decisions made during implementation (D-xx) |
| `ANALISIS_DOCUMENTACION_AEL.md` | Audit of the canonical corpus |
| `paso0/INFORME_PASO_0.md` | Pre-validation: pilot rules and golden case |
| `Docs/01–24` | Canonical corpus, ~110k lines — normative reference. Too large for one context window; work from the master plan, which points to specific sections when needed. |

Precedence when sources conflict (`PLAN_MAESTRO_IMPLEMENTACION.md` §0.1): this document's closed
decisions > `PROMPT_MAESTRO_FASE1.md` > canonical docs 01–20 > docs 21/22/24 (governance) > existing
code > existing tests > agent inference. Docs 01 §57 and 01 §62 roadmaps are superseded by plan §5.

## Commands

```bash
pnpm install              # Node >=22, pnpm >=11 required
cp .env.example .env      # fill in real values — .env.example must stay empty (CI enforces this)
pnpm verify                # build + typecheck + lint + test — MUST be green before any commit
```

| Command | What it does |
|---|---|
| `pnpm verify` | build + typecheck + lint + test (the full gate) |
| `pnpm build` | builds all packages (must run before typecheck/test — `@aquila/shared` and `@aquila/liquidation-engine` resolve via `dist/`) |
| `pnpm typecheck` | `tsc --noEmit` at root + `pnpm -r typecheck` (runs `nuxt typecheck` in apps/web) |
| `pnpm lint` | eslint at root + `pnpm --filter @aquila/web lint` (apps/web has its own Nuxt/Vue eslint config) |
| `pnpm lint:fix` | eslint --fix |
| `pnpm format` / `format:check` | prettier |
| `pnpm test` | `vitest run` (unit + integration) |
| `pnpm test:watch` | vitest watch mode |
| `pnpm test:coverage` | vitest with coverage thresholds enforced |
| `pnpm test:edge` | Deno tests + coverage for `supabase/functions/_shared/` (Vitest cannot instrument Deno) |
| `pnpm test:e2e` | Playwright, against a real Supabase project |
| `pnpm db:push` / `db:push:dry` / `db:push:prod` | apply Supabase migrations (dry-run / prod variants) |
| `pnpm db:types` | regenerate `apps/web/app/types/database.types.ts` from the live schema — never hand-edit generated types |
| `pnpm dev:login` | local dev helper for auth |

**Never run `supabase db reset`, `supabase stop`, or `supabase start` without asking the user
first and getting explicit confirmation for that specific run.** These wipe or recreate the local
Postgres/auth data — including tenants, users, and test scenarios the user built by hand in the
local Supabase stack, which are not recoverable. This applies to every agent/session working in
this repo, not just the one that decides it's needed. `pnpm db:push` (local, no `:prod`) is
additive — it applies new migrations without touching existing rows — and does NOT need this
confirmation. A `PreToolUse` hook in `.claude/settings.json` intercepts `supabase db reset`/
`stop`/`start` and forces a confirmation prompt; this rule is the reason it exists; do not remove
or weaken it without the user's explicit request.

**Single test file**: `pnpm exec vitest run path/to/file.test.ts` (or `pnpm exec vitest path/to/file.test.ts` to watch).

**RLS/integration tests hit a real remote Supabase project** (see D-08 in `DECISIONES.md`) — they
need `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL` in `.env`,
and Vitest runs with `fileParallelism: false` so concurrent runs don't collide on shared fixtures.

## Architecture — three independent layers

```
┌────────────────────────┐   ┌────────────────────────┐
│  A · financial-kernel  │   │  B · ael-language      │
│  Money · rounding      │   │      ael-runtime       │
│  allocation · residual │   │  lexer · types · eval  │
└───────────┬────────────┘   └───────────┬────────────┘
            │   independent of each other │
            └─────────────┬──────────────┘
                          ▼
              ┌────────────────────────┐
              │  C · orquestación      │
              │  liquidation-engine    │
              │  snapshot · graph      │
              │  result · trace        │
              └────────────────────────┘
```

```
packages/
  ael-core/           TypedValue · Decimal · Money · Quantity · Unit · diagnostics
  financial-kernel/   RoundingPolicy · allocation · reconciliation
  ael-language/       lexer · parser · AST · analyzer
  ael-runtime/        DAG evaluator over ael-language's AST — NOT a VM (AD-21: AEL v0 is an
                       expression evaluator; no compiler/IR/bytecode unless a real business case
                       demands it — see AD-23)
  liquidation-engine/ orchestration layer (C) — consumes A and B
  payment-gateways/   payment gateway integrations
  shared/             cross-cutting utilities consumed by apps/web
apps/
  web/                Nuxt 4 SSR (D-15: Nuxt 4, not 3, despite older docs)
supabase/
  migrations/         ~220+ migrations — RLS-first (every table gets ENABLE + FORCE RLS in the
                       SAME migration that creates it)
  functions/          Deno Edge Functions, one directory per function + `_shared/`
Docs/                 canonical corpus 01–24
paso0/                pilot rules and golden case GC-001
```

Boundaries above are **enforced by `eslint.config.js`**, not just convention:

- No `parseFloat`/`Number.parseFloat` anywhere under `packages/**` or `apps/**` (money paths must
  use `Decimal`).
- `ael-core` and `financial-kernel` cannot import `pg`, `postgres`, `@supabase/*`, `vue`, `nuxt`,
  `axios`, or `node:http*` — the core has zero infrastructure dependencies.
- `ael-language` and `ael-runtime` (layer B) cannot import `decimal.js`/`big.js`/`bignumber.js`
  directly — all monetary arithmetic is delegated to `financial-kernel`.
- Inside `financial-kernel`, only `financial-operation-service.ts` (and the `money.ts`/`decimal.ts`
  it wraps) may import `decimal.js` directly; `allocation.ts` must go through the FOS.
- `liquidation-engine`'s core (graph/executor/result/hash/liquidar) is pure and cannot import
  `@supabase/*` or `@aquila/shared` — only the explicitly listed `*-supabase.ts` files (the
  "Snapshot Builder" and its siblings, one per subdomain: cartera, cuenta-corriente,
  prueba-formula, etc.) are allowed to talk to Supabase.
- `apps/web/**` is excluded from the root eslint config — it has its own (`@nuxt/eslint`,
  vue-eslint-parser), run via `pnpm --filter @aquila/web lint`.

`apps/web` middleware chain (Nuxt route middleware, `apps/web/app/middleware/`):
`auth.global → tenant → rbac → platform` — currently only `auth.global` is wired up; `tenant` and
`rbac` land with the tenancy/authorization phases.

## Domain model essentials

- `tenant` = a single copropiedad (property). There is no "administradora" entity in the model —
  the RLS isolation boundary is the copropiedad itself (AD-24).
- The unit of liquidation is **tenant + periodo** (AD-25).
- `propietarios`/residentes are domain data, not auth principals — no login, no own RLS (AD-26).
- Subscriptions are billed per copropiedad, matching the tenant boundary exactly (AD-27).

## UI conventions

- **Título + descripción larga → colapsable.** Cuando un título de página o
  de sección lleva un párrafo explicativo debajo que ocupa más de una línea,
  o una sola línea que supera 1/4 del ancho de su contenedor, usar
  `UiTituloDescripcion` (`apps/web/app/components/ui/UiTituloDescripcion.vue`)
  en vez de un `<h1>`/`<h2>` + `<p>` sueltos. Mide el ancho real del texto en
  runtime (no un umbral de caracteres) y decide sola si mostrar el chevron —
  arranca siempre colapsada cuando aplica. Slots `#titulo` (conserva el tag y
  las clases que ya tenía el heading) y `#descripcion` (soporta markup como
  `<strong>`). Prop opcional `clase-descripcion` para no perder el tamaño/color
  que ya tuviera el párrafo. No aplica a mensajes de estado vacío genéricos
  ("todavía no hay X registrado") — solo a texto que explica qué es o para
  qué sirve la pantalla.
- **Selectores de catálogo: `USelect` vs `UiSelectorBuscable`.** `USelect`
  para enumeraciones cortas y fijas (estados, tipos con pocas opciones,
  banderas sí/no). `UiSelectorBuscable`
  (`apps/web/app/components/ui/UiSelectorBuscable.vue`) para catálogos de
  copropiedad que pueden tener varias decenas de opciones o rutas largas
  (inmuebles, terceros, cuentas del plan de cuentas, agrupaciones,
  documentos) — combobox propio con filtro local, sin depender de
  `USelectMenu` (sin theming propio en este repo). No se necesita búsqueda
  remota/debounced: por AD-24 el tenant es una sola copropiedad, así que
  todo catálogo está acotado al tamaño real de un edificio. No convertir
  selectores de enumeraciones fijas a `UiSelectorBuscable` solo por
  uniformidad — evaluar caso por caso si el catálogo realmente es largo.
- **Ancho de `USelect`.** El tema de Nuxt UI v4 no trae `w-full` en el slot
  `base` de `USelect` (a diferencia de `UInput`, que sí lo trae de fábrica),
  así que un `USelect` nuevo se ve angosto (ajustado al placeholder/valor) si
  no se le da ancho explícito. **No arreglar esto con un override global en
  `app.config.ts`** — un `select.slots.base` con `w-full` ya se probó y se
  revirtió (08-09-2026): infla selects dentro de celdas de tabla u otros
  contenedores que no están pensados para ancho completo, perdiendo la
  estructura de esa pantalla. El ancho se decide por sitio, según el
  contenedor real: dentro de un `<UFormField>`/grid de formulario o de un
  `UiDrawer` (que ya acota el ancho disponible), usar `class="w-full"` para
  que se comporte como el `UInput` vecino; dentro de una barra de filtros
  horizontal (`flex items-center gap-X`) junto a otros controles angostos,
  usar un ancho fijo (`w-40`/`w-48`/`w-56`) igual que sus hermanos; dentro de
  una celda de tabla (`<td>`), usar un ancho fijo acorde al contenido de esa
  columna (nunca `w-full`, estiraría la columna entera).
- **Panel de filtros reutilizable (`UiPanelFiltros` + `UiChipsFiltros` +
  `useFiltros`).** Evaluado contra VecindApp/Vecitienda (2026-09-18) y
  generalizado como convención transversal — usar en cualquier listado que
  necesite más de ~4-5 dimensiones de filtro, o al menos una selección
  múltiple sobre catálogo, o se quede sin espacio horizontal para selects en
  línea. Para 2-4 filtros simples que caben en una fila (`inmuebles/index.vue`)
  la barra de `USelect`/`UInput` reactivos en línea sigue siendo la opción por
  defecto — no migrar esas pantallas solo por uniformidad. Con más filtros que
  eso, `mantenimiento/activos/index.vue` es el ejemplo de referencia del
  patrón híbrido: hasta 3 fijos en línea + el resto en el panel (ver el punto
  siguiente).
  - `apps/web/app/composables/useFiltros.ts` separa el estado **borrador**
    (editable dentro del panel) del estado **aplicado** (el único que dispara
    la consulta): nada cambia hasta `aplicar()`. `schema: CampoFiltro[]`
    describe cada campo (`boolean` / `select` / `multiselect` / `rango` /
    `texto`) de forma declarativa — el mismo componente sirve para cualquier
    módulo sin reimplementar el drawer. Las funciones puras (`generarChips`,
    `hayFiltrosActivos`, `etiquetaValorFiltro`, `esValorInicial`) están
    separadas de la parte reactiva (que usa `ref`/`computed` auto-importados
    de Nuxt) para poder probarlas sin contexto de app — mismo criterio que
    `aplicarConfiguracionMenu` en `useMenuPersonalizado.ts`.
  - **Hasta 3 filtros "fijos" fuera del panel** (evaluado con el usuario en la
    migración de `mantenimiento/activos/index.vue`, 2026-09-18): los 2-3
    campos más usados de un listado pueden quedarse en su `USelect`/`UInput`
    de siempre, visibles en la barra, con el comportamiento instantáneo que
    tenían antes de adoptar este patrón — el panel absorbe solo el resto.
    `useFiltros().actualizarInmediato(clave, valor)` escribe ese campo en
    `borrador` Y `aplicados` a la vez (sin pasar por `aplicar()`), así que
    abrir el panel después no muestra un valor viejo para esos campos fijos,
    y aplicar algo del panel no los pisa. `quitar()` es ahora un caso
    particular de `actualizarInmediato` (reponer el valor inicial). El schema
    del panel simplemente no incluye esos campos — no generan chip en
    `UiChipsFiltros` porque ya son visibles en su propio control, un chip
    sería redundante.
  - `UiPanelFiltros.vue` (genérico sobre `TFiltros`) renderiza el schema
    dentro de un `UiDrawer` — drawer lateral en desktop, pantalla completa en
    mobile, gratis por el CSS que ya trae `UiDrawer`. Un campo `select` sigue
    siendo de **un solo valor** — usa `USelect` o, si declara
    `buscable: true`, `UiSelectorBuscable` (mismo criterio de catálogo largo
    que el punto anterior).
  - **`multiselect` con render adaptativo según cantidad de opciones**
    (ajuste 2026-09-18): con menos de 4 opciones (`UMBRAL_CHECKBOX` en
    `UiPanelFiltros.vue`) se pinta como grupo de `UCheckbox` — todas visibles,
    sin buscador, porque con 2-3 opciones el buscador es puro overhead; con 4
    o más usa el buscador + chips "seleccionadas"/"disponibles" (calcado de
    VecindApp), resuelto directamente en este componente — no se extendió
    `UiSelectorBuscable` con un modo multi para no arriesgar sus 20+ usos
    existentes de un solo valor. El umbral se evalúa en vivo sobre
    `campo.opciones.length`, así que un catálogo por tenant (ubicaciones,
    fabricantes) puede cambiar de widget solo con que la data cambie — no hay
    que declarar nada distinto en el schema. Para que un campo permita elegir
    varios se declara `tipo: 'multiselect'`; `select` nunca se autoconvierte.
  - `UiChipsFiltros.vue` vive **fuera** del drawer, pegado al listado: un chip
    removible por cada filtro que se aparta de su valor inicial más el
    contador de resultados. Quitar un chip dispara `useFiltros().quitar()`
    directamente (sin reabrir el panel) — mismo comportamiento observado en
    VecindApp.
  - A diferencia de VecindApp, un campo `texto` del schema entra al mismo
    ciclo borrador/aplicado que los demás (chip propio, lo limpia
    `limpiarTodo()`) — ahí el buscador de texto libre quedaba fuera de ese
    ciclo (no generaba chip, "Limpiar filtros" no lo tocaba, Enter no
    disparaba la búsqueda); es un defecto de esa UI, no una pieza a replicar.

## Absolute prohibitions (PLAN §9.2 — no exceptions)

```
✗ float / number / parseFloat in any monetary code path        (partly ESLint-enforced)
✗ epsilon comparisons in reconciliation
✗ adjusting a result just to make a test pass
✗ modifying a golden case to accommodate an implementation
✗ monetary arithmetic outside financial-kernel                  (ESLint-enforced)
✗ declaring something DONE without evidence
✗ inventing tables, roles, permissions, formulas, or policies not closed in the plan
✗ a `CREATE TYPE ... AS ENUM` without a `COMMENT ON TYPE` justifying why it gates logic/state
  transitions — descriptive vocabulary belongs in `lista_tipos`, not a new enum (D-24)
```

Definition of Done for any unit of work (PLAN §9.1) additionally requires: authorization enforced
in both UI and RLS; migrations carry `ENABLE + FORCE RLS` in the same migration that creates the
table; types regenerated via `pnpm db:types`, never hand-written; unit + RLS + integration tests
green; `tsc --noEmit` / eslint / `supabase db lint` at zero errors; coverage ≥80% global.

## Coverage thresholds (vitest.config.ts)

80% global (lines/functions/branches/statements). **100%** required for
`packages/financial-kernel/src/**`, `packages/ael-runtime/src/**`, and
`apps/web/app/types/permissions.ts`.

## Security (SEC-02)

Only `NUXT_PUBLIC_*` runtime config keys and `SUPABASE_ANON_KEY` may reach the browser —
`SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_DB_URL` are server/Edge-Function only, never in
`runtimeConfig.public`. `.env.example` is versioned and must stay valueless (CI fails otherwise);
real values go in `.env`, which is gitignored. CI also scans every versioned file for JWT and
Brevo/Supabase key patterns.

## Workflow cycle

`READ → ANALYZE → PLAN → IMPACT → IMPLEMENT → TEST → VERIFY → DOCUMENT → REPORT → COMMIT`
