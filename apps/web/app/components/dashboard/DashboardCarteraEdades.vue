<script setup lang="ts">
// Puente de mando §6.1 — figura 1: cartera vencida por edad. Barras
// horizontales, un tramo por fila, en orden de edad creciente — nunca una
// torta (no compara tramos ni deja leer el orden). `TramoAntiguedadDTO[]`
// tal cual viene de cartera-dashboard, sin reagrupar en el cliente: la
// clasificación en tramos es lógica de negocio que ya vive en
// packages/liquidation-engine.
//
// Color: rampa secuencial de un solo tono (ámbar, tokens.css
// --chart-cartera-edad-1..5) — la oscuridad codifica severidad, no
// categoría. Los dos pasos más claros quedan bajo 3:1 de contraste, por eso
// la etiqueta (monto + cantidad de inmuebles) es SIEMPRE visible en cada
// fila, no un tooltip.
import type { TramoAntiguedadDTO } from '~/stores/cartera'

const props = defineProps<{ tramos: TramoAntiguedadDTO[] }>()

const RAMPA = [
  'var(--chart-cartera-edad-1)',
  'var(--chart-cartera-edad-2)',
  'var(--chart-cartera-edad-3)',
  'var(--chart-cartera-edad-4)',
  'var(--chart-cartera-edad-5)',
] as const

function colorTramo(indice: number): string {
  // Si algún día hay menos/más de 5 tramos, se reparte proporcionalmente
  // sobre la misma rampa de 5 pasos en vez de asumir el conteo exacto.
  const posicion = props.tramos.length <= 1
    ? 0
    : Math.round((indice / (props.tramos.length - 1)) * (RAMPA.length - 1))
  return RAMPA[Math.min(posicion, RAMPA.length - 1)] ?? RAMPA[0]
}

const etiquetaAccesible = computed(() => {
  const partes = props.tramos.map(
    (t) => `${t.codigo}: ${formatoMoneda(t.monto)} en ${String(t.cantidadInmuebles)} inmueble${t.cantidadInmuebles === 1 ? '' : 's'} (${t.pctDelTotal.toFixed(1)}% del total)`,
  )
  return `Cartera vencida por edad — ${partes.join('; ')}`
})
</script>

<template>
  <div role="img" :aria-label="etiquetaAccesible" class="space-y-2">
    <div
      v-for="(tramo, indice) in tramos"
      :key="tramo.codigo"
      class="grid gap-x-2 gap-y-0.5"
      style="grid-template-columns: 6.6em minmax(0, 1fr) 7.2em; grid-template-areas: 'tramo barra monto' 'tramo detalle monto'"
    >
      <span class="truncate self-center text-sm text-muted" style="grid-area: tramo" :title="tramo.codigo">
        {{ tramo.codigo }}
      </span>
      <span class="h-[18px] min-w-0 self-center overflow-hidden rounded-sm bg-neutral-100 dark:bg-neutral-800" style="grid-area: barra">
        <span
          class="block h-full rounded-sm"
          :style="{ width: `${String(Math.max(tramo.pctDelTotal, 1))}%`, backgroundColor: colorTramo(indice) }"
        />
      </span>
      <span class="self-center text-right text-sm tabular-nums text-highlighted" style="grid-area: monto">
        {{ formatoMoneda(tramo.monto) }}
      </span>
      <span class="text-xs text-dimmed" style="grid-area: detalle">
        {{ tramo.cantidadInmuebles }} inmueble{{ tramo.cantidadInmuebles === 1 ? '' : 's' }}
      </span>
    </div>
  </div>
</template>
