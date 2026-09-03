/**
 * F0 (revisión del constructor visual AEL) — puente mínimo de auto-imports
 * de Nuxt para poder montar componentes `.vue` con Vitest sin levantar Nuxt
 * entero (`@nuxt/test-utils`, que arranca un servidor por suite).
 *
 * Los SFC de `apps/web/app/components/**` usan `computed`/`inject`/`provide`
 * sin importarlos: Nuxt los inyecta como globales vía unimport. Fuera de
 * Nuxt esas referencias son variables libres y el `setup()` revienta con
 * ReferenceError. Acá se replican solo las APIs de Vue que efectivamente
 * usan esos componentes — no todo el catálogo de unimport, que incluiría
 * composables de Nuxt (useState, useRoute...) cuyo comportamiento sí
 * depende del runtime y que un test unitario no debería fingir.
 *
 * `setupFiles` de Vitest 2 es global (no admite glob), así que la guarda de
 * `window` mantiene el archivo inerte para todo lo que corre en el entorno
 * `node` — los tests de `packages/`, `tests/` y `apps/web/app/utils/` no ven
 * ningún global nuevo y no pueden empezar a depender de él por accidente.
 * Solo los tests bajo `apps/web/app/components/**` corren en happy-dom
 * (`environmentMatchGlob` en vitest.config.ts) y reciben estos globales.
 */
import {
  computed,
  inject,
  nextTick,
  onBeforeUnmount,
  onMounted,
  provide,
  ref,
  watch,
  watchEffect,
} from 'vue'

// El tsconfig raíz no incluye la lib DOM (este monorepo compila para node),
// así que `window` no existe como nombre global para TypeScript — se consulta
// a través de globalThis con un tipo local en vez de arrastrar lib.dom.
const enNavegador = typeof (globalThis as { window?: unknown }).window !== 'undefined'

if (enNavegador) {
  Object.assign(globalThis, {
    computed,
    inject,
    nextTick,
    onBeforeUnmount,
    onMounted,
    provide,
    ref,
    watch,
    watchEffect,
  })
}
