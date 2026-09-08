<script setup lang="ts">
// Indicadores de cobranza y jurídicos (CAR §23.3, bloque 25 del roadmap).
// El backend ya existía completo (cartera-indicadores, 20260823110000 +
// 20260823120000) — esta pantalla es la única pieza que faltaba. Roll
// Rate y Cure Rate exigen snapshot congelado (F8/JOB_CARTERA_DIARIA) en
// AMBAS fechas — sin eso la función responde 422 SNAPSHOT_NO_DISPONIBLE,
// que aquí se muestra como una alerta explicativa en vez de reventar la
// pantalla (no se inventa un 0%/100% para rellenar el hueco).
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const tenantStore = useTenantStore()
const carteraStore = useCarteraStore()

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}

// fecha_desde por defecto: primer día del mes de fecha_hasta, salvo que
// fecha_hasta YA sea el día 1 (la función exige fecha_desde < fecha_hasta
// estricto) — en ese caso, primer día del mes anterior. Mismo criterio
// que fechaDesdeRecaudo en cartera/index.vue (REC-CAR-004, no se
// reimplementa dos veces en el mismo módulo salvo que difieran).
function primerDiaDelMesPrevio(fechaHastaISO: string): string {
  const hasta = new Date(`${fechaHastaISO}T00:00:00Z`)
  const primerDiaMesActual = new Date(Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth(), 1))
  const base =
    primerDiaMesActual.getTime() === hasta.getTime()
      ? new Date(Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth() - 1, 1))
      : primerDiaMesActual
  return base.toISOString().slice(0, 10)
}

const fechaHasta = ref(hoyISO())
const fechaDesde = ref(primerDiaDelMesPrevio(fechaHasta.value))

const cargando = ref(false)
const errorCarga = ref<string | null>(null)
const codigoError = ref<string | null>(null)

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  errorCarga.value = null
  codigoError.value = null
  if (fechaDesde.value >= fechaHasta.value) {
    errorCarga.value = 'La fecha "Desde" debe ser anterior a "Hasta".'
    return
  }
  cargando.value = true
  try {
    await carteraStore.cargarIndicadores(tenantId, fechaDesde.value, fechaHasta.value)
  } catch (e) {
    errorCarga.value = mensajeError(e, 'No se pudieron cargar los indicadores de cartera.')
    codigoError.value = e && typeof e === 'object' && 'code' in e ? String((e as { code?: string }).code) : null
  } finally {
    cargando.value = false
  }
}

await useAsyncData('cartera-indicadores-inicial', async () => {
  await cargar()
  return null
})

function formatoPctONull(valor: number | null | undefined): string {
  return valor === null || valor === undefined ? '—' : `${valor.toFixed(1)}%`
}

function formatoDiasONull(valor: number | null | undefined): string {
  return valor === null || valor === undefined ? '—' : `${valor.toFixed(1)} días`
}

function formatoRatioONull(valor: number | null | undefined): string {
  return valor === null || valor === undefined ? '—' : valor.toFixed(2)
}

const indicadoresGestion = computed(() => {
  const i = carteraStore.indicadores
  return [
    { label: '% cartera vencida (Overdue Portfolio)', valor: formatoPctONull(i?.overduePortfolioPct) },
    { label: 'Cure Rate', valor: formatoPctONull(i?.cureRate) },
    { label: 'Recovery Rate', valor: formatoPctONull(i?.recoveryRate) },
    { label: 'Efectividad de cobranza', valor: formatoPctONull(i?.collectionEffectiveness) },
    { label: 'Cumplimiento de promesas de pago', valor: formatoPctONull(i?.promiseFulfillmentRate) },
    { label: 'Cumplimiento de acuerdos de pago', valor: formatoPctONull(i?.agreementFulfillmentRate) },
  ]
})

const indicadoresLegales = computed(() => {
  const i = carteraStore.indicadores
  return [
    { label: 'Tasa de remisión a jurídico (Legal Referral)', valor: formatoPctONull(i?.legalReferralRate) },
    { label: 'Recuperación en casos jurídicos (Legal Recovery)', valor: formatoPctONull(i?.legalRecoveryRate) },
    { label: 'Días promedio de recuperación', valor: formatoDiasONull(i?.averageDaysToRecovery) },
    { label: 'Costo por recaudar (parcial — ver nota)', valor: formatoRatioONull(i?.costToCollect) },
  ]
})

const rollRateFilas = computed(() => carteraStore.indicadores?.rollRatePorTramo ?? [])
const columnasRollRate = [
  { clave: 'tramoCodigo', etiqueta: 'Tramo' },
  { clave: 'tramoSiguienteCodigo', etiqueta: 'Siguiente tramo' },
  { clave: 'rollRate', etiqueta: 'Roll Rate', alinear: 'derecha' as const },
]
</script>

<template>
  <div class="space-y-8">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold mb-1">Indicadores de cobranza y jurídicos</h1>
        <p class="text-sm text-neutral-500">CAR §23.3 — métricas del período seleccionado.</p>
      </div>
      <div class="flex items-end gap-3">
        <UFormField label="Desde">
          <UInput v-model="fechaDesde" type="date" class="w-44" @change="cargar" />
        </UFormField>
        <UFormField label="Hasta">
          <UInput v-model="fechaHasta" type="date" class="w-44" @change="cargar" />
        </UFormField>
      </div>
    </div>

    <UAlert
      v-if="errorCarga && codigoError === 'SNAPSHOT_NO_DISPONIBLE'"
      color="warning"
      variant="soft"
      title="Falta el snapshot de cartera para una de las fechas"
      :description="errorCarga"
    />
    <UAlert v-else-if="errorCarga" color="error" variant="soft" :title="errorCarga" />

    <div v-if="cargando && !carteraStore.indicadores" class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div v-for="i in 6" :key="i" class="space-y-2 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
        <USkeleton class="h-4 w-32" />
        <USkeleton class="h-7 w-20" />
      </div>
    </div>

    <template v-else-if="carteraStore.indicadores">
      <div>
        <h2 class="mb-3 text-sm font-semibold">Gestión de cartera</h2>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div
            v-for="ind in indicadoresGestion"
            :key="ind.label"
            class="rounded-md border border-neutral-200 p-4 dark:border-neutral-800"
          >
            <p class="text-sm text-neutral-500">{{ ind.label }}</p>
            <p class="mt-1 text-2xl font-semibold">{{ ind.valor }}</p>
          </div>
        </div>
      </div>

      <div>
        <h2 class="mb-3 text-sm font-semibold">Gestión jurídica</h2>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div
            v-for="ind in indicadoresLegales"
            :key="ind.label"
            class="rounded-md border border-neutral-200 p-4 dark:border-neutral-800"
          >
            <p class="text-sm text-neutral-500">{{ ind.label }}</p>
            <p class="mt-1 text-2xl font-semibold">{{ ind.valor }}</p>
          </div>
        </div>
        <p class="mt-2 text-xs text-neutral-400">
          Costo por recaudar es parcial: solo incluye costas judiciales, no el costo de acciones de
          cobranza administrativas (SMS, llamadas, cartas) — no hay columna de costo para eso hoy.
        </p>
      </div>

      <div v-if="rollRateFilas.length > 0" class="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 class="mb-4 text-sm font-semibold">Roll Rate por tramo de mora</h2>
        <UiTabla
          :columnas="columnasRollRate"
          :filas="rollRateFilas"
          :clave-fila="(f) => f.tramoCodigo"
          vacio="Sin tramos con deuda en el período."
        >
          <template #celda-tramoSiguienteCodigo="{ fila }">{{ fila.tramoSiguienteCodigo ?? '— (último tramo)' }}</template>
          <template #celda-rollRate="{ fila }">{{ formatoPctONull(fila.rollRate) }}</template>
        </UiTabla>
      </div>
    </template>
  </div>
</template>
