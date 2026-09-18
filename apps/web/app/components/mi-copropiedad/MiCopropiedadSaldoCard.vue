<script setup lang="ts">
// EXT-07 §6.4 — tarjeta de saldo reutilizada por "Mis asuntos" (compacta, `detalle=false`, sin
// slot de acciones — toda la tarjeta es un enlace a Finanzas) y por `finanzas/index.vue`
// (detalle completo + botón "Pagar ahora" vía el slot `#acciones`, que la página decide mostrar
// según `pago_habilitado`). Puramente presentacional: no llama Edge Functions ni decide el monto
// a pagar — eso es responsabilidad de quien la usa (regla de oro, PROMPT_MI_COPROPIEDAD_FASE1.md §1).
import type { CuentaResumen } from '~/utils/actor-externo-api'

withDefaults(
  defineProps<{
    resumen: CuentaResumen | null
    cargando?: boolean
    detalle?: boolean
  }>(),
  { cargando: false, detalle: true },
)

const expandido = ref(false)

const ETIQUETA_ESTADO: Record<'vencido' | 'pendiente', string> = {
  vencido: 'Vencido',
  pendiente: 'Pendiente',
}
</script>

<template>
  <div class="rounded-xl border border-default bg-elevated p-4">
    <p class="text-xs text-gray-500 dark:text-gray-400">Saldo pendiente</p>

    <div v-if="cargando" class="mt-1.5 h-8 w-32 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />

    <template v-else-if="resumen">
      <p
        class="text-2xl font-semibold"
        :class="
          resumen.saldo_total > 0
            ? 'text-primary-700 dark:text-primary-400'
            : 'text-gray-900 dark:text-white'
        "
      >
        {{ formatoMoneda(resumen.saldo_total) }}
      </p>
      <p v-if="resumen.saldo_total <= 0" class="mt-1 text-xs text-gray-500 dark:text-gray-400">
        Estás al día.
      </p>

      <template v-if="detalle && resumen.obligaciones.length > 0">
        <button
          type="button"
          class="mt-2 text-xs font-medium text-primary-600 dark:text-primary-400"
          @click="expandido = !expandido"
        >
          {{ expandido ? 'Ocultar detalle' : '¿Por qué debo esto?' }}
        </button>
        <ul v-if="expandido" class="mt-2 divide-y divide-default">
          <li
            v-for="(o, i) in resumen.obligaciones"
            :key="i"
            class="flex items-center justify-between gap-2 py-1.5 text-xs"
          >
            <span class="text-gray-600 dark:text-gray-300">{{ o.concepto }} · {{ o.periodo }}</span>
            <span class="flex shrink-0 items-center gap-1.5">
              <span
                v-if="o.estado === 'vencido'"
                class="text-xs font-semibold uppercase text-red-600 dark:text-red-400"
              >{{ ETIQUETA_ESTADO[o.estado] }}</span>
              <span class="font-medium tabular-nums">{{ formatoMoneda(o.monto_pendiente) }}</span>
            </span>
          </li>
        </ul>
      </template>

      <div v-if="$slots.acciones" class="mt-3">
        <slot name="acciones" />
      </div>
    </template>

    <p v-else class="mt-1 text-sm text-gray-500 dark:text-gray-400">No se pudo cargar el saldo.</p>
  </div>
</template>
