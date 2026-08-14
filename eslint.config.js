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
      // Utilidades de Node ejecutadas directamente, fuera de todo tsconfig.
      'scripts/**/*.mjs',
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

  {
    files: ['**/*.test.ts', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  // ── Excepción única y documentada: schema `any` en el cliente de fixtures ──
  // El proyecto es DB-first (el esquema en Postgres manda; los tipos se
  // generan de él, nunca al revés — Fase I §3.3). Esto NO es un tipo de BD
  // escrito a mano: es la ausencia deliberada de tipado hasta que D-11 se
  // resuelva (pnpm db:types requiere Docker/Podman, no disponible bajo D-08).
  // Se retira en cuanto @aquila/shared exista con tipos generados reales.
  {
    files: ['tests/rls/helpers.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
)
