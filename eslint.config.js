import js from '@eslint/js'
import tseslint from 'typescript-eslint'

/**
 * Reglas de frontera derivadas de PLAN_MAESTRO_IMPLEMENTACION.md §9.2
 * y de las reglas de dependencia de Docs/01 §7.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.nuxt/**',
      '**/.output/**',
      '**/coverage/**',
      // apps/web tiene su propia config (@nuxt/eslint, vue-eslint-parser) —
      // se lintea con `pnpm --filter @aquila/web lint`, no con esta config.
      'apps/web/**',
      // Edge Functions corren en Deno, fuera de todo tsconfig de este
      // workspace pnpm — su propio deno.json por función define su alcance.
      'supabase/functions/**',
      // Utilidades de Node ejecutadas directamente, fuera de todo tsconfig.
      'scripts/**/*.mjs',
      // Generado por `supabase gen types` (Fase I §3.3): no se edita ni se
      // lintea a mano. Se regenera con `pnpm db:types`.
      '**/database.generated.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          // Solo los .js de configuración quedan fuera de todo tsconfig.
          // Los .ts de la raíz ya los cubre ./tsconfig.json.
          allowDefaultProject: ['*.js'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Los archivos de configuración .js no necesitan linting con tipos.
  {
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },

  // ── Prohibición global: punto flotante en rutas monetarias (19 §19) ──
  {
    files: ['packages/**/*.ts', 'apps/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'parseFloat', message: 'Prohibido en rutas monetarias (19 §19). Usa Decimal.' },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Number',
          property: 'parseFloat',
          message: 'Prohibido en rutas monetarias (19 §19). Usa Decimal.',
        },
      ],
    },
  },

  // ── ael-core y financial-kernel: sin infraestructura (01 §7) ──
  {
    files: ['packages/ael-core/**/*.ts', 'packages/financial-kernel/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['pg', 'postgres', '@supabase/*', 'vue', 'nuxt', 'axios', 'node:http*'],
              message:
                '01 §7: el núcleo no puede depender de PostgreSQL, Supabase, Vue, Nuxt ni HTTP.',
            },
          ],
        },
      ],
    },
  },

  // ── Capa B nunca implementa aritmética monetaria (PLAN §3, regla de frontera) ──
  {
    files: ['packages/ael-language/**/*.ts', 'packages/ael-runtime/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['decimal.js', 'big.js', 'bignumber.js'],
              message:
                'PLAN §3: la Capa B delega toda aritmética monetaria en financial-kernel. No uses librerías decimales directamente (19 §96).',
            },
          ],
        },
      ],
    },
  },

  // ── allocation.ts nunca toca la librería decimal directamente (19 §96) ──
  // Solo financial-operation-service.ts (y money.ts/decimal.ts, que este
  // último usa internamente) puede instanciar decimal.js. allocation.ts
  // opera exclusivamente a través de las funciones exportadas por el FOS.
  {
    files: ['packages/financial-kernel/src/allocation.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'decimal.js',
              message: '19 §96 NO DIRECT DECIMAL LIBRARY: usa financial-operation-service.ts.',
            },
          ],
          patterns: [
            {
              group: ['./decimal.js', './decimal'],
              message: '19 §96 NO DIRECT DECIMAL LIBRARY: usa financial-operation-service.ts.',
            },
          ],
        },
      ],
    },
  },

  // ── liquidation-engine: el núcleo puro no toca Supabase (D-14) ─────────
  // Solo snapshot-supabase.ts (el "Snapshot Builder", Docs/17 §27-29) puede
  // hablar con la base de datos. graph/executor/result/hash/liquidar son
  // funciones puras sobre un DataSnapshot ya construido — mismo principio
  // que ael-language/ael-runtime nunca tocan decimal.js directamente.
  {
    files: ['packages/liquidation-engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@supabase/*', '@aquila/shared'],
              message:
                'D-14: el núcleo de liquidation-engine es puro — solo snapshot-supabase.ts habla con Supabase.',
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      'packages/liquidation-engine/src/snapshot-supabase.ts',
      'packages/liquidation-engine/src/persistencia-supabase.ts',
      'packages/liquidation-engine/src/cuenta-corriente-supabase.ts',
      'packages/liquidation-engine/src/prueba-formula-supabase.ts',
      'packages/liquidation-engine/src/cartera-supabase.ts',
      'packages/liquidation-engine/src/cartera-cobranza-supabase.ts',
      'packages/liquidation-engine/src/cartera-juridico-supabase.ts',
      'packages/liquidation-engine/src/cartera-job-supabase.ts',
      'packages/liquidation-engine/src/cartera-dashboard-supabase.ts',
      'packages/liquidation-engine/src/cartera-indicadores-supabase.ts',
      'packages/liquidation-engine/src/cartera-panel-acciones-supabase.ts',
      'packages/liquidation-engine/src/cartera-evolucion-supabase.ts',
    ],
    rules: {
      'no-restricted-imports': 'off',
    },
  },

  {
    files: ['**/*.test.ts', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
)
