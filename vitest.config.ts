import { defineConfig } from 'vitest/config'

/**
 * Umbrales de cobertura: PLAN_MAESTRO_IMPLEMENTACION.md §9.1 / PROMPT_MAESTRO_FASE1.md §12.3
 *   ≥80% global · 100% en kernel financiero, evaluador AEL y types/permissions.ts.
 *   Las Edge Functions (Deno) no las instrumenta Vitest — cobertura propia vía
 *   `pnpm test:edge` (deno coverage) sobre supabase/functions/_shared/*.ts.
 */
export default defineConfig({
  test: {
    include: [
      'packages/**/*.{test,spec}.ts',
      'tests/**/*.{test,spec}.ts',
      'apps/web/app/**/*.{test,spec}.ts',
    ],
    // Los tests RLS golpean un proyecto Supabase remoto (D-08): en serie,
    // para que dos runs paralelos no se pisen los fixtures.
    fileParallelism: false,
    exclude: ['**/node_modules/**', '**/dist/**'],
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
