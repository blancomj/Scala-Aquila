import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

/**
 * Umbrales de cobertura: PLAN_MAESTRO_IMPLEMENTACION.md §9.1 / PROMPT_MAESTRO_FASE1.md §12.3
 *   ≥80% global · 100% en kernel financiero, evaluador AEL y types/permissions.ts.
 *   Las Edge Functions (Deno) no las instrumenta Vitest — cobertura propia vía
 *   `pnpm test:edge` (deno coverage) sobre supabase/functions/_shared/*.ts.
 *
 * Tests de componente (D-33): `@vitejs/plugin-vue` compila los SFC y el
 * alias `~` replica el de Nuxt 4 (srcDir = app/). El entorno por defecto
 * sigue siendo `node` para TODO — packages, tests RLS y
 * apps/web/app/utils no cambian de entorno. Los tests que montan un
 * componente piden DOM archivo por archivo con el docblock
 * `// @vitest-environment happy-dom` en su primera línea.
 *
 * Se descartó `environmentMatchGlob` (que era el plan) porque compara el
 * patrón contra la ruta absoluta del archivo y en Windows esa ruta lleva
 * `\`: ningún glob con `/` matchea, y el test corre en `node` en silencio
 * — falla con "document is not defined" sin explicar por qué. El
 * docblock consigue el mismo alcance acotado sin depender del separador.
 */
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./apps/web/app', import.meta.url)),
      '@': fileURLToPath(new URL('./apps/web/app', import.meta.url)),
    },
  },
  test: {
    include: [
      'packages/**/*.{test,spec}.ts',
      'tests/**/*.{test,spec}.ts',
      'apps/web/app/**/*.{test,spec}.ts',
    ],
    setupFiles: ['tests/setup/nuxt-auto-imports.ts'],
    // Los tests RLS golpean un proyecto Supabase remoto (D-08): en serie,
    // para que dos runs paralelos no se pisen los fixtures.
    fileParallelism: false,
    // tests/e2e/**: specs de Playwright, no de Vitest — tienen su propio
    // test runner (pnpm test:e2e) y su propio config (playwright.config.ts).
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['packages/*/src/**/*.ts', 'apps/web/app/types/permissions.ts'],
      exclude: ['**/*.test.ts', '**/*.spec.ts', '**/index.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
        'packages/financial-kernel/src/**/*.ts': {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        'packages/ael-runtime/src/**/*.ts': {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        'apps/web/app/types/permissions.ts': {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
      },
    },
  },
})
