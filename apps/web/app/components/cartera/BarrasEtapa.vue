<script setup lang="ts">
/**
 * "Cartera por etapa de cobranza" — barras horizontales estáticas
 * (Tailwind puro, sin ApexCharts: no hay ejes/tooltips que justifiquen
 * la librería aquí, mismo criterio que la dona de antigüedad).
 */
interface Barra {
  etapa: string
  label: string
  monto: number
  pct: number
  color: string
}

defineProps<{
  barras: Barra[]
  formatoMoneda: (valor: number) => string
}>()
</script>

<template>
  <ul class="space-y-3">
    <li v-for="b in barras" :key="b.etapa" class="text-sm">
      <div class="mb-1 flex items-center justify-between gap-4">
        <span class="text-gray-600 dark:text-gray-300">{{ b.label }}</span>
        <span class="shrink-0 text-gray-500">{{ formatoMoneda(b.monto) }} · {{ b.pct.toFixed(1) }}%</span>
      </div>
      <div class="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
        <div
          class="h-2 rounded-full transition-all"
          :style="{ width: `${String(Math.min(b.pct, 100))}%`, backgroundColor: b.color }"
        />
      </div>
    </li>
  </ul>
</template>
