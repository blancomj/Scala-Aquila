<script setup lang="ts">
// Dashboard de Cartera (CAR F9 §23.1/§23.2/§23.3, parte). Solo la
// pestaña Dashboard por ahora (decisión del usuario, 2026-08-17) — las
// demás pestañas del módulo (Cartera, Expedientes, Cobranza, Acuerdos,
// Jurídico, Reportes) se agregan cuando les toque, no como rutas vacías.
//
// Todo lo que se ve con datos reales sale de cartera-dashboard (fecha de
// corte única, sin depender de que exista un snapshot congelado —
// incluye porEtapa, 5 etapas reales de cartera_etapas/F6) y de cartera-
// evolucion (serie mensual sobre posiciones_cartera_snapshot, F3/F8 — un
// mes sin snapshot se dibuja como hueco en la línea, nunca como 0
// inventado). Las piezas sin backend hoy (recaudo del mes, efectividad
// de cobranza, Top 10 por inmueble, alertas y pendientes, actividad
// reciente, cobertura de provisión, días promedio de mora, deltas "vs.
// mes anterior") se marcan "Próximamente" — ver
// CarteraProximamentePlaceholder.vue.
//
// Imports explícitos — el auto-import de Nuxt no recogió estos
// componentes en el dev server de esta sesión tras crearlos/renombrarlos
// (CarteraEvolucionChart: EvolucionCarteraChart.vue → EvolucionChart.vue;
// CarteraBarrasEtapa: componente nuevo); el resto de la carpeta sí se
// auto-importa con normalidad (CarteraDonutAntiguedad,
// CarteraProximamentePlaceholder). Se pueden quitar una vez confirmado
// que un reinicio limpio del dev server los resuelve solo.
import CarteraEvolucionChart from '~/components/cartera/EvolucionChart.vue'
import CarteraBarrasEtapa from '~/components/cartera/BarrasEtapa.vue'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const tenantStore = useTenantStore()
const carteraStore = useCarteraStore()

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}

const fechaCorte = ref(hoyISO())
const errorCarga = ref<string | null>(null)

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  errorCarga.value = null
  try {
    await Promise.all([
      carteraStore.cargarDashboard(tenantId, fechaCorte.value),
      carteraStore.cargarEvolucion(tenantId, fechaCorte.value),
    ])
  } catch (e) {
    errorCarga.value = e instanceof Error ? e.message : 'No se pudo cargar el dashboard de cartera.'
  }
}

await useAsyncData('cartera-dashboard-inicial', async () => {
  await cargar()
  return null
})

watch(fechaCorte, cargar)

function formatoMoneda(valor: string | number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(valor))
}

function formatoPct(valor: number): string {
  return `${valor.toFixed(1)}%`
}

const tarjetas = computed(() => carteraStore.dashboard?.tarjetas ?? null)
const antiguedad = computed(() => carteraStore.dashboard?.antiguedad ?? [])

const pctVencida = computed(() => {
  if (!tarjetas.value) return 0
  const total = Number(tarjetas.value.carteraTotal)
  return total > 0 ? (Number(tarjetas.value.carteraVencida) / total) * 100 : 0
})

const pctMayor90 = computed(() => {
  if (!tarjetas.value) return 0
  const total = Number(tarjetas.value.carteraTotal)
  return total > 0 ? (Number(tarjetas.value.carteraMayor90) / total) * 100 : 0
})

const pctMayor180 = computed(() => {
  if (!tarjetas.value) return 0
  const vencida = Number(tarjetas.value.carteraVencida)
  return vencida > 0 ? (Number(tarjetas.value.carteraMayor180) / vencida) * 100 : 0
})

const inmueblesEnMora = computed(() =>
  antiguedad.value.filter((t) => t.codigo !== 'AL_DIA').reduce((acc, t) => acc + t.cantidadInmuebles, 0),
)

// CAR §23.2 — los 8 tramos fijos reagrupados en 5 buckets visuales (mismo
// criterio que el diseño de referencia), AL_DIA excluido (monto=0 por
// definición, esta dona mide distribución de MORA).
const BUCKETS_ANTIGUEDAD: readonly { label: string; codigos: string[]; color: string }[] = [
  { label: '0-30 días', codigos: ['MORA_TEMPRANA'], color: '#3b82f6' },
  { label: '31-60 días', codigos: ['MORA_INICIAL'], color: '#eab308' },
  { label: '61-90 días', codigos: ['MORA_MEDIA'], color: '#f97316' },
  { label: '91-180 días', codigos: ['MORA_AVANZADA', 'MORA_CRITICA'], color: '#ef4444' },
  { label: '180+ días', codigos: ['ALTO_RIESGO', 'CRITICA'], color: '#a855f7' },
]

const bucketsAntiguedad = computed(() => {
  const porCodigo = new Map(antiguedad.value.map((t) => [t.codigo, t]))
  return BUCKETS_ANTIGUEDAD.map((b) => ({
    label: b.label,
    color: b.color,
    monto: b.codigos.reduce((acc, c) => acc + Number(porCodigo.get(c)?.monto ?? 0), 0),
  }))
})

const indicadoresClave = computed(() => [
  { label: 'Índice de cartera vencida (ICV)', valor: formatoPct(pctVencida.value) },
  { label: '% cartera > 180 días', valor: formatoPct(pctMayor180.value) },
  { label: 'Inmuebles en mora', valor: String(inmueblesEnMora.value) },
])

// CAR §11 — las 5 etapas REALES de cartera_etapas/F6, en el orden de la
// máquina de estados (no alfabético). Colores como gradiente de
// severidad (azul = sano, rojo oscuro = ya en vía judicial).
const ETIQUETAS_ETAPA: Record<string, { label: string; color: string }> = {
  preventiva: { label: 'Preventiva', color: '#3b82f6' },
  administrativa: { label: 'Administrativa', color: '#eab308' },
  prejuridica: { label: 'Prejurídica', color: '#f97316' },
  juridica: { label: 'Jurídica', color: '#ef4444' },
  judicial: { label: 'Judicial', color: '#991b1b' },
}

const barrasEtapa = computed(() =>
  (carteraStore.dashboard?.porEtapa ?? []).map((e) => ({
    etapa: e.etapa,
    label: ETIQUETAS_ETAPA[e.etapa]?.label ?? e.etapa,
    color: ETIQUETAS_ETAPA[e.etapa]?.color ?? '#9ca3af',
    monto: Number(e.monto),
    pct: e.pctDelTotal,
  })),
)
</script>

<template>
  <div class="space-y-8">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold mb-1">Dashboard de Cartera</h1>
        <p class="text-sm text-gray-500">Vista general del estado de la cartera a la fecha de corte.</p>
      </div>
      <UFormField label="Corte de análisis">
        <UInput v-model="fechaCorte" type="date" class="w-48" />
      </UFormField>
    </div>

    <UAlert v-if="errorCarga" color="error" variant="soft" :title="errorCarga" />

    <div v-else-if="carteraStore.loading && !tarjetas" class="text-sm text-gray-500">Cargando…</div>

    <template v-else-if="tarjetas">
      <!-- Tarjetas principales -->
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div class="flex items-start justify-between gap-3 rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <div>
            <p class="text-sm text-gray-500">Cartera total</p>
            <p class="text-2xl font-semibold">{{ formatoMoneda(tarjetas.carteraTotal) }}</p>
            <p class="mt-1 text-xs text-gray-400">100% del total</p>
          </div>
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
            <UIcon name="i-lucide-wallet" class="h-5 w-5" />
          </span>
        </div>
        <div class="flex items-start justify-between gap-3 rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <div>
            <p class="text-sm text-gray-500">Cartera vencida</p>
            <p class="text-2xl font-semibold">{{ formatoMoneda(tarjetas.carteraVencida) }}</p>
            <p class="mt-1 text-xs text-gray-400">{{ formatoPct(pctVencida) }} del total</p>
          </div>
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
            <UIcon name="i-lucide-clock" class="h-5 w-5" />
          </span>
        </div>
        <div class="flex items-start justify-between gap-3 rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <div>
            <p class="text-sm text-gray-500">Cartera &gt; 90 días</p>
            <p class="text-2xl font-semibold">{{ formatoMoneda(tarjetas.carteraMayor90) }}</p>
            <p class="mt-1 text-xs text-gray-400">{{ formatoPct(pctMayor90) }} del total</p>
          </div>
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400">
            <UIcon name="i-lucide-triangle-alert" class="h-5 w-5" />
          </span>
        </div>
        <div class="flex items-start justify-between gap-3 rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <div>
            <p class="text-sm text-gray-500">Recaudo del mes</p>
            <p class="text-lg font-medium text-gray-400">Próximamente</p>
          </div>
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500">
            <UIcon name="i-lucide-circle-dollar-sign" class="h-5 w-5" />
          </span>
        </div>
      </div>

      <!-- Antigüedad + indicadores -->
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-800 lg:col-span-2">
          <h2 class="mb-4 text-sm font-semibold">Cartera por antigüedad (aging)</h2>
          <CarteraDonutAntiguedad
            :buckets="bucketsAntiguedad"
            :formato-moneda="formatoMoneda"
            total-label="Cartera vencida"
          />
        </div>
        <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <h2 class="mb-4 text-sm font-semibold">Indicadores clave</h2>
          <ul class="space-y-3 text-sm">
            <li v-for="ind in indicadoresClave" :key="ind.label" class="flex items-center justify-between">
              <span class="text-gray-500">{{ ind.label }}</span>
              <span class="font-semibold">{{ ind.valor }}</span>
            </li>
            <li class="flex items-center justify-between text-gray-400">
              <span>Efectividad de cobranza (mes)</span>
              <span class="text-xs italic">Próximamente</span>
            </li>
            <li class="flex items-center justify-between text-gray-400">
              <span>Días promedio de mora</span>
              <span class="text-xs italic">Próximamente</span>
            </li>
            <li class="flex items-center justify-between text-gray-400">
              <span>Cobertura de provisión</span>
              <span class="text-xs italic">Próximamente</span>
            </li>
          </ul>
        </div>
      </div>

      <!-- Etapa de cobranza -->
      <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
        <h2 class="mb-4 text-sm font-semibold">Cartera por etapa de cobranza</h2>
        <CarteraBarrasEtapa :barras="barrasEtapa" :formato-moneda="formatoMoneda" />
      </div>

      <!-- Top 10 + evolución -->
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CarteraProximamentePlaceholder titulo="Cartera por inmueble (Top 10)" />
        <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <h2 class="mb-4 text-sm font-semibold">Evolución de cartera vencida (6 meses)</h2>
          <CarteraEvolucionChart :puntos="carteraStore.evolucion" :formato-moneda="formatoMoneda" />
        </div>
      </div>

      <!-- Alertas + actividad -->
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CarteraProximamentePlaceholder titulo="Alertas y pendientes" />
        <CarteraProximamentePlaceholder titulo="Actividad reciente en cartera" />
      </div>
    </template>
  </div>
</template>
