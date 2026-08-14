import { defineConfig } from 'vitest/config'

/**
 * Umbrales de cobertura: PLAN_MAESTRO_IMPLEMENTACION.md §9.1
 *   ≥80% global · 100% en kernel financiero y evaluador AEL
 */
export default defineConfig({
  test: {
    include: ['packages/**/*.{test,spec}.ts', 'tests/**/*.{test,spec}.ts'],
    // Los tests RLS golpean un proyecto Supabase remoto (D-08): en serie,
    // para que dos runs paralelos no se pisen los fixtures.
    fileParallelism: false,
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['packages/*/src/**/*.ts'],
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
      },
    },
  },
})
