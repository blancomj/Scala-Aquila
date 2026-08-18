<script setup lang="ts">
/**
 * Dona de "cartera por antigüedad" — sin librería de gráficos en el
 * proyecto (no precedente), se construye con conic-gradient puro en vez
 * de calcular arcos SVG a mano. Reagrupa los 8 tramos fijos de
 * cartera-dashboard (§23.2) en 5 buckets visuales — el tramo AL_DIA
 * queda fuera por definición (monto siempre 0, esta dona mide
 * distribución de MORA, no balance corriente).
 */
interface Bucket {
  label: string
  monto: number
  color: string
}

const props = defineProps<{
  buckets: Bucket[]
  formatoMoneda: (valor: number) => string
  totalLabel: string
}>()

const total = computed(() => props.buckets.reduce((acc, b) => acc + b.monto, 0))

const gradiente = computed(() => {
  if (total.value <= 0) return 'conic-gradient(#e5e7eb 0% 100%)'
  let acumulado = 0
  const segmentos: string[] = []
  for (const b of props.buckets) {
    if (b.monto <= 0) continue
    const desde = (acumulado / total.value) * 100
    acumulado += b.monto
    const hasta = (acumulado / total.value) * 100
    segmentos.push(`${b.color} ${desde}% ${hasta}%`)
  }
  return segmentos.length > 0 ? `conic-gradient(${segmentos.join(', ')})` : 'conic-gradient(#e5e7eb 0% 100%)'
})

function pct(monto: number): string {
  if (total.value <= 0) return '0%'
  return `${((monto / total.value) * 100).toFixed(1)}%`
}
</script>

<template>
  <div class="flex flex-col items-center gap-6 sm:flex-row">
    <div class="relative h-40 w-40 shrink-0 rounded-full" :style="{ background: gradiente }">
      <div
        class="absolute inset-4 flex flex-col items-center justify-center rounded-full bg-white text-center dark:bg-gray-900"
      >
        <p class="text-sm font-semibold">{{ formatoMoneda(total) }}</p>
        <p class="text-xs text-gray-500">{{ totalLabel }}</p>
      </div>
    </div>
    <ul class="w-full space-y-1.5 text-sm">
      <li v-for="b in buckets" :key="b.label" class="flex items-center justify-between gap-4">
        <span class="flex items-center gap-2">
          <span class="h-2.5 w-2.5 shrink-0 rounded-full" :style="{ backgroundColor: b.color }" />
          {{ b.label }}
        </span>
        <span class="flex items-center gap-3 text-gray-500">
          <span>{{ formatoMoneda(b.monto) }}</span>
          <span class="w-12 text-right">{{ pct(b.monto) }}</span>
        </span>
      </li>
    </ul>
  </div>
</template>
