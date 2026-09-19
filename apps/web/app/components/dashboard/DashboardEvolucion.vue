<script setup lang="ts">
// Puente de mando §3.3 (Opción A, sin backend nuevo) + §6.2 — figura 2:
// "Cómo viene la cartera vencida", serie mensual de `cargarEvolucion()`
// (`deudaVencida` por mes), en pesos. Gráfico de puntos con línea y escala
// acotada — NO columnas: los valores viven en un rango estrecho y una
// escala 0..max los aplastaría a todos casi iguales, pero truncar el eje de
// una BARRA sería deshonesto (en una barra el largo es la magnitud). En un
// gráfico de puntos una escala acotada y rotulada es legítima.
import type { PuntoEvolucionDTO } from '~/stores/cartera'

const props = defineProps<{ puntos: PuntoEvolucionDTO[] }>()

const ANCHO = 620
const ALTO = 196
const PAD_IZQ = 64
const PAD_DER = 16
const PAD_ARR = 22
const PAD_ABAJO = 28

interface PuntoValido {
  indice: number
  mes: string
  valor: number
}

const validos = computed<PuntoValido[]>(() =>
  props.puntos
    .map((p, indice) => ({ indice, mes: p.mes, valor: p.deudaVencida === null ? null : Number(p.deudaVencida) }))
    .filter((p): p is { indice: number; mes: string; valor: number } => p.valor !== null),
)

function numeroAgradable(valor: number): number {
  if (valor <= 0) return 1
  const exponente = Math.floor(Math.log10(valor))
  const base = Math.pow(10, exponente)
  const fraccion = valor / base
  const pasoAgradable = fraccion <= 1 ? 1 : fraccion <= 2 ? 2 : fraccion <= 5 ? 5 : 10
  return pasoAgradable * base
}

const escala = computed(() => {
  const valores = validos.value.map((p) => p.valor)
  if (valores.length === 0) return { min: 0, max: 1, paso: 1 }
  const rawMin = Math.min(...valores)
  const rawMax = Math.max(...valores)
  if (rawMin === rawMax) {
    const paso = numeroAgradable(rawMax * 0.1 || 1)
    return { min: Math.max(0, rawMin - paso), max: rawMax + paso, paso }
  }
  const paso = numeroAgradable((rawMax - rawMin) / 3)
  const min = Math.max(0, Math.floor(rawMin / paso) * paso)
  const max = Math.ceil(rawMax / paso) * paso
  return { min, max: max > min ? max : min + paso, paso }
})

const promedio = computed(() => {
  const valores = validos.value.map((p) => p.valor)
  return valores.length > 0 ? valores.reduce((a, b) => a + b, 0) / valores.length : 0
})

function x(indice: number): number {
  const n = props.puntos.length
  if (n <= 1) return PAD_IZQ
  return PAD_IZQ + (indice / (n - 1)) * (ANCHO - PAD_IZQ - PAD_DER)
}

function y(valor: number): number {
  const { min, max } = escala.value
  const rango = max - min || 1
  const t = (valor - min) / rango
  return ALTO - PAD_ABAJO - t * (ALTO - PAD_ARR - PAD_ABAJO)
}

const lineaPuntos = computed(() => validos.value.map((p) => `${String(x(p.indice))},${String(y(p.valor))}`).join(' '))

const rotulosY = computed(() => {
  const { min, max } = escala.value
  const medio = (min + max) / 2
  return [max, medio, min].map((v) => ({ valor: v, y: y(v) }))
})

const indiceMaximo = computed(() => {
  if (validos.value.length === 0) return null
  return validos.value.reduce((mejor, p) => (p.valor > mejor.valor ? p : mejor), validos.value[0]!).indice
})
const indiceActual = computed(() => (validos.value.length > 0 ? validos.value[validos.value.length - 1]!.indice : null))
const indicePrimero = computed(() => (validos.value.length > 0 ? validos.value[0]!.indice : null))

function esEtiquetable(indice: number): boolean {
  return indice === indiceMaximo.value || indice === indiceActual.value || indice === indicePrimero.value
}

const etiquetaAccesible = computed(() => {
  const partes = props.puntos.map(
    (p) => `${p.mes}: ${p.deudaVencida === null ? 'sin dato' : formatoMoneda(p.deudaVencida)}`,
  )
  return `Cómo viene la cartera vencida, evolución mensual — ${partes.join('; ')}`
})
</script>

<template>
  <p v-if="validos.length === 0" class="text-sm text-muted">Sin datos de cartera vencida para mostrar todavía.</p>
  <svg
    v-else
    :viewBox="`0 0 ${ANCHO} ${ALTO}`"
    role="img"
    :aria-label="etiquetaAccesible"
    class="w-full"
    style="max-height: 220px"
  >
    <!-- Rejilla recesiva -->
    <g aria-hidden="true">
      <line
        v-for="r in rotulosY"
        :key="r.valor"
        :x1="PAD_IZQ"
        :x2="ANCHO - PAD_DER"
        :y1="r.y"
        :y2="r.y"
        class="stroke-neutral-200 dark:stroke-neutral-800"
        stroke-width="1"
      />
      <text
        v-for="r in rotulosY"
        :key="`t-${r.valor}`"
        :x="PAD_IZQ - 8"
        :y="r.y"
        text-anchor="end"
        dominant-baseline="middle"
        class="fill-dimmed font-sans"
        font-size="10"
      >
        {{ formatoMoneda(r.valor) }}
      </text>
    </g>

    <!-- Línea de referencia: promedio del periodo -->
    <g v-if="validos.length > 0" aria-hidden="true">
      <line
        :x1="PAD_IZQ"
        :x2="ANCHO - PAD_DER"
        :y1="y(promedio)"
        :y2="y(promedio)"
        class="stroke-neutral-400 dark:stroke-neutral-600"
        stroke-width="1"
        stroke-dasharray="4 3"
      />
      <text :x="ANCHO - PAD_DER" :y="y(promedio) - 4" text-anchor="end" class="fill-dimmed" font-size="10">
        Promedio: {{ formatoMoneda(promedio) }}
      </text>
    </g>

    <!-- Trazo -->
    <polyline
      v-if="validos.length > 1"
      :points="lineaPuntos"
      fill="none"
      class="stroke-primary"
      stroke-width="2"
      stroke-linejoin="round"
    />

    <!-- Puntos + etiquetas selectivas -->
    <g v-for="p in validos" :key="p.indice">
      <circle
        :cx="x(p.indice)"
        :cy="y(p.valor)"
        :r="p.indice === indiceActual ? 6.5 : 5"
        :class="p.indice === indiceActual ? 'fill-primary' : 'fill-default'"
        class="stroke-primary"
        stroke-width="2"
      />
      <text
        v-if="esEtiquetable(p.indice)"
        :x="x(p.indice)"
        :y="y(p.valor) - 12"
        text-anchor="middle"
        class="fill-highlighted font-display"
        font-size="11"
        font-weight="600"
      >
        {{ formatoMoneda(p.valor) }}
      </text>
    </g>

    <!-- Eje de meses -->
    <g aria-hidden="true">
      <text
        v-for="p in puntos"
        :key="`m-${p.mes}`"
        :x="x(puntos.indexOf(p))"
        :y="ALTO - 8"
        text-anchor="middle"
        class="fill-dimmed"
        font-size="10"
      >
        {{ p.mes }}
      </text>
    </g>

    <!-- Capa de hover -->
    <g>
      <rect
        v-for="(p, indice) in puntos"
        :key="`hover-${p.mes}`"
        :x="x(indice) - (ANCHO - PAD_IZQ - PAD_DER) / (Math.max(puntos.length, 1) * 2)"
        :y="PAD_ARR"
        :width="(ANCHO - PAD_IZQ - PAD_DER) / Math.max(puntos.length, 1)"
        :height="ALTO - PAD_ARR - PAD_ABAJO"
        fill="transparent"
        :data-tip="`${p.mes}: ${p.deudaVencida === null ? 'sin dato' : formatoMoneda(p.deudaVencida)}`"
      >
        <title>{{ p.mes }}: {{ p.deudaVencida === null ? 'Sin dato' : formatoMoneda(p.deudaVencida) }}</title>
      </rect>
    </g>
  </svg>
</template>
