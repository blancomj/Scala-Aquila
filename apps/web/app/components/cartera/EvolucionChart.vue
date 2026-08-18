<script setup lang="ts">
// Evolución de cartera vencida (dashboard) — ApexCharts (decisión del
// usuario, 2026-08-17: primera librería de gráficos del proyecto,
// justificada para series temporales con ejes/tooltips; la dona de
// antigüedad sigue con conic-gradient puro, no necesita reemplazo).
// Cliente-only: ApexCharts depende de window/document, no renderiza en
// SSR (mismo motivo que cualquier librería basada en el DOM del browser).
import { defineAsyncComponent } from 'vue'

const VueApexCharts = defineAsyncComponent(() => import('vue3-apexcharts'))

export interface PuntoEvolucionDTO {
  mes: string
  fechaSnapshot: string | null
  deudaVencida: string | null
}

const props = defineProps<{
  puntos: PuntoEvolucionDTO[]
  formatoMoneda: (valor: number) => string
}>()

const hayDatos = computed(() => props.puntos.some((p) => p.deudaVencida !== null))

const categorias = computed(() =>
  props.puntos.map((p) => {
    const [anio, mes] = p.mes.split('-').map(Number)
    return new Date(anio ?? 2026, (mes ?? 1) - 1, 1).toLocaleDateString('es-CO', { month: 'short' })
  }),
)

const serie = computed(() => [
  {
    name: 'Cartera vencida',
    data: props.puntos.map((p) => (p.deudaVencida === null ? null : Number(p.deudaVencida))),
  },
])

function formatoAbreviado(valor: number): string {
  if (Math.abs(valor) >= 1_000_000) return `$${(valor / 1_000_000).toFixed(1)}M`
  if (Math.abs(valor) >= 1_000) return `$${(valor / 1_000).toFixed(0)}K`
  return `$${valor}`
}

const opciones = computed(() => ({
  chart: { toolbar: { show: false }, zoom: { enabled: false }, fontFamily: 'inherit' },
  stroke: { curve: 'smooth' as const, width: 3 },
  colors: ['#ef4444'],
  xaxis: { categories: categorias.value },
  yaxis: { labels: { formatter: formatoAbreviado } },
  dataLabels: { enabled: false },
  markers: { size: 4 },
  grid: { strokeDashArray: 4 },
  tooltip: { y: { formatter: (v: number) => props.formatoMoneda(v) } },
}))
</script>

<template>
  <ClientOnly>
    <VueApexCharts v-if="hayDatos" type="line" height="260" :options="opciones" :series="serie" />
    <p v-else class="flex h-64 items-center justify-center text-center text-sm text-gray-400">
      Sin snapshots históricos suficientes todavía — se llena a medida que corre JOB_CARTERA_DIARIA.
    </p>
    <template #fallback>
      <div class="h-64 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
    </template>
  </ClientOnly>
</template>
