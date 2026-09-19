// @nuxt/eslint genera esta config en `nuxt prepare` a partir de nuxt.config.ts.
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  // El barrel raíz de @aquila/liquidation-engine ('.') re-exporta módulos
  // puros que importan node:crypto (hash.ts, cartera.ts, cartera-job.ts,
  // cartera-juridico.ts, conciliacion-parsers.ts) — válido en Node (tests,
  // Edge Functions), pero Vite no puede resolver node:crypto en el bundle
  // del navegador. Ya nos mordió una vez (dashboard/index.vue, 2026-09-19):
  // un import sin subpath rompe con un 500 en runtime, no en build/typecheck.
  // apps/web SIEMPRE debe importar por subpath (./graph, ./errors,
  // ./cartera-indicadores, etc.) — nunca el barrel completo.
  files: ['app/**/*.{ts,vue}'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: '@aquila/liquidation-engine',
            message:
              'El barrel raíz re-exporta módulos con node:crypto (hash.ts y otros), inválido en el bundle del navegador. Importa por subpath: @aquila/liquidation-engine/graph, /errors, /snapshot, /alcance, /prueba-formula, /cartera-indicadores, /cartera-indicadores-supabase.',
          },
        ],
      },
    ],
  },
})
