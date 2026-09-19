<script setup lang="ts">
// Puente de mando §6.3 — figura 3: recaudo por forma de pago, desde
// `vr_recaudos` (grano de pago, incluye anulaciones a propósito — el
// llamador ya sumó neto y agrupó). Barras horizontales, mismo idioma visual
// que la figura 1. Color: dos tonos de un mismo azul (lo que entra solo vs.
// lo que pasa por ventanilla) + un gris neutro para "sin forma registrada"
// — nunca un arcoíris categórico por forma de pago (el catálogo es
// abierto, `lista_tipos` familia FORMA_PAGO).
export interface FilaRecaudoForma {
  etiqueta: string
  monto: number
  rol: 'automatico' | 'ventanilla' | 'sin_forma'
}

const props = defineProps<{ filas: FilaRecaudoForma[] }>()

const COLOR: Record<FilaRecaudoForma['rol'], string> = {
  automatico: 'var(--chart-recaudo-automatico)',
  ventanilla: 'var(--chart-recaudo-ventanilla)',
  sin_forma: 'var(--chart-recaudo-sin-forma)',
}

const total = computed(() => props.filas.reduce((acc, f) => acc + f.monto, 0))
function pct(monto: number): number {
  return total.value > 0 ? (monto / total.value) * 100 : 0
}

const etiquetaAccesible = computed(() => {
  const partes = props.filas.map((f) => `${f.etiqueta}: ${formatoMoneda(f.monto)}`)
  return `Recaudo por forma de pago — ${partes.join('; ')}`
})
</script>

<template>
  <div class="space-y-3">
    <div role="img" :aria-label="etiquetaAccesible" class="space-y-2">
      <div
        v-for="fila in filas"
        :key="fila.etiqueta"
        class="grid items-center gap-2"
        style="grid-template-columns: 6.6em minmax(0, 1fr) 7.2em"
      >
        <span class="truncate text-sm text-muted" :title="fila.etiqueta">{{ fila.etiqueta }}</span>
        <span class="h-[18px] min-w-0 overflow-hidden rounded-sm bg-neutral-100 dark:bg-neutral-800">
          <span
            class="block h-full rounded-sm"
            :style="{ width: `${String(Math.max(pct(fila.monto), 1))}%`, backgroundColor: COLOR[fila.rol] }"
          />
        </span>
        <span class="text-right text-sm tabular-nums text-highlighted">{{ formatoMoneda(fila.monto) }}</span>
      </div>
    </div>

    <ul class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-hidden="true">
      <li class="flex items-center gap-1.5">
        <span class="size-2.5 rounded-full" :style="{ backgroundColor: COLOR.automatico }" />
        Entra solo
      </li>
      <li class="flex items-center gap-1.5">
        <span class="size-2.5 rounded-full" :style="{ backgroundColor: COLOR.ventanilla }" />
        Pasa por ventanilla
      </li>
      <li class="flex items-center gap-1.5">
        <span class="size-2.5 rounded-full" :style="{ backgroundColor: COLOR.sin_forma }" />
        Sin forma registrada
      </li>
    </ul>
  </div>
</template>
