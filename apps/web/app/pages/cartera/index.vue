<script setup lang="ts">
// Dashboard de Cartera (CAR F9 §23.1/§23.2/§23.3, parte). Solo la
// pestaña Dashboard por ahora (decisión del usuario, 2026-08-17) — las
// demás pestañas del módulo (Cartera, Expedientes, Cobranza, Acuerdos,
// Jurídico, Reportes) se agregan cuando les toque, no como rutas vacías.
//
// Todo lo que se ve con datos reales sale de cartera-dashboard (fecha de
// corte única, sin depender de que exista un snapshot congelado —
// incluye porEtapa [5 etapas reales de cartera_etapas/F6] y topInmuebles
// [ranking calculado en TS sobre las mismas filas, sin consulta extra]),
// cartera-evolucion (serie mensual sobre posiciones_cartera_snapshot,
// F3/F8 — un mes sin snapshot se dibuja como hueco, nunca 0 inventado),
// cartera-recaudo (reutiliza fn_indicadores_gestion directo, sin el gate
// de snapshot de cartera-indicadores), cartera-alertas (obligaciones
// >90d a nivel de cargo, promesas por vencer en 3 días, cuotas de
// acuerdo vencidas — "Casos próximos a remisión jurídica" se deriva de
// dashboard.porEtapa[prejuridica], no pide otra vez la base de datos) y
// cartera-actividad-reciente (feed de alta de pago/promesa/acuerdo/caso
// jurídico, fn_actividad_reciente_cartera 20260823170000). La única
// pieza sin backend hoy (cobertura de provisión — sin concepto de
// provisión contable en el esquema, decisión explícita del usuario) se
// marca "Próximamente" inline.
//
// Imports explícitos — el auto-import de Nuxt no recogió estos
// componentes en el dev server de esta sesión tras crearlos/renombrarlos
// (CarteraEvolucionChart: EvolucionCarteraChart.vue → EvolucionChart.vue;
// CarteraBarrasEtapa: componente nuevo); el resto de la carpeta sí se
// auto-importa con normalidad (CarteraDonutAntiguedad). Se pueden quitar
// una vez confirmado que un reinicio limpio del dev server los resuelve
// solo.
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

/**
 * fecha_desde para "recaudo del mes" — primer día del mes de fechaCorte,
 * salvo que fechaCorte YA sea el día 1 (cartera-recaudo exige fecha_desde
 * estrictamente anterior a fecha_hasta): en ese caso se usa el primer
 * día del mes anterior, para no romper con un rango de 0 días.
 */
function fechaDesdeRecaudo(fechaCorteISO: string): string {
  const corte = new Date(`${fechaCorteISO}T00:00:00Z`)
  const primerDiaMesActual = new Date(Date.UTC(corte.getUTCFullYear(), corte.getUTCMonth(), 1))
  const base = primerDiaMesActual.getTime() === corte.getTime() ? new Date(Date.UTC(corte.getUTCFullYear(), corte.getUTCMonth() - 1, 1)) : primerDiaMesActual
  return base.toISOString().slice(0, 10)
}

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  errorCarga.value = null
  try {
    await Promise.all([
      carteraStore.cargarDashboard(tenantId, fechaCorte.value),
      carteraStore.cargarEvolucion(tenantId, fechaCorte.value),
      carteraStore.cargarAlertas(tenantId, fechaCorte.value),
      carteraStore.cargarRecaudo(tenantId, fechaDesdeRecaudo(fechaCorte.value), fechaCorte.value),
      carteraStore.cargarActividadReciente(tenantId),
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


function formatoPct(valor: number): string {
  return `${valor.toFixed(1)}%`
}

// null = indeterminado (denominador cero, ej. sin acciones ejecutadas en
// el período) — nunca se muestra como "0%", eso implicaría "cero
// efectividad" cuando en realidad no hubo base para medir.
function formatoPctONull(valor: number | null | undefined): string {
  return valor === null || valor === undefined ? '—' : formatoPct(valor)
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

// null = indeterminado (sin inmuebles en mora) — nunca "0 días".
const diasPromedioMora = computed(() => {
  const dias = carteraStore.dashboard?.diasPromedioMora
  return dias === null || dias === undefined ? '—' : `${dias.toFixed(0)} días`
})

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

const topInmuebles = computed(() => carteraStore.dashboard?.topInmuebles ?? [])
const columnasTop = [
  { clave: 'codigo', etiqueta: 'Inmueble' },
  { clave: 'deudaVencida', etiqueta: 'Cartera vencida', alinear: 'derecha' as const },
  { clave: 'diasMoraMaximo', etiqueta: 'Días de mora', alinear: 'derecha' as const },
]

// "Casos próximos a remisión jurídica" — se deriva de dashboard.porEtapa
// (prejuridica), ya cargado para "Cartera por etapa de cobranza"; no
// pide otra vez la base de datos (REC-CAR-004).
const casosProximosRemision = computed(() => {
  const prejuridica = (carteraStore.dashboard?.porEtapa ?? []).find((e) => e.etapa === 'prejuridica')
  return { cantidad: prejuridica?.cantidadInmuebles ?? 0, monto: Number(prejuridica?.monto ?? 0) }
})

// CAR §23.5 (frontend) — un ícono/etiqueta por tipo de evento de gestión
// registrado (fn_actividad_reciente_cartera, 20260823170000).
const ETIQUETAS_EVENTO: Record<string, { label: string; icono: string; color: string }> = {
  pago: { label: 'Pago registrado', icono: 'i-lucide-circle-dollar-sign', color: 'text-green-600 dark:text-green-400' },
  promesa: { label: 'Promesa de pago', icono: 'i-lucide-handshake', color: 'text-amber-600 dark:text-amber-400' },
  acuerdo: { label: 'Acuerdo de pago', icono: 'i-lucide-file-signature', color: 'text-blue-600 dark:text-blue-400' },
  caso_juridico: { label: 'Caso jurídico', icono: 'i-lucide-gavel', color: 'text-purple-600 dark:text-purple-400' },
}

const actividadReciente = computed(() =>
  carteraStore.actividadReciente.map((e) => ({
    ...e,
    label: ETIQUETAS_EVENTO[e.tipo]?.label ?? e.tipo,
    icono: ETIQUETAS_EVENTO[e.tipo]?.icono ?? 'i-lucide-activity',
    color: ETIQUETAS_EVENTO[e.tipo]?.color ?? 'text-gray-500',
  })),
)

const alertas = computed(() => {
  const a = carteraStore.alertas
  return [
    {
      label: 'Obligaciones > 90 días',
      cantidad: a?.obligacionesMayor90Cantidad ?? 0,
      monto: Number(a?.obligacionesMayor90Monto ?? 0),
      icono: 'i-lucide-circle-alert',
      color: 'text-red-600 dark:text-red-400',
    },
    {
      label: 'Promesas por vencer en 3 días',
      cantidad: a?.promesasPorVencerCantidad ?? 0,
      monto: Number(a?.promesasPorVencerMonto ?? 0),
      icono: 'i-lucide-clock',
      color: 'text-amber-600 dark:text-amber-400',
    },
    {
      label: 'Cuotas de acuerdo vencidas',
      cantidad: a?.cuotasAcuerdoVencidasCantidad ?? 0,
      monto: Number(a?.cuotasAcuerdoVencidasMonto ?? 0),
      icono: 'i-lucide-file-warning',
      color: 'text-orange-600 dark:text-orange-400',
    },
    {
      label: 'Casos próximos a remisión jurídica',
      cantidad: casosProximosRemision.value.cantidad,
      monto: casosProximosRemision.value.monto,
      icono: 'i-lucide-gavel',
      color: 'text-purple-600 dark:text-purple-400',
    },
    {
      label: 'Cargos sin fecha de vencimiento',
      cantidad: a?.obligacionesSinVencimientoCantidad ?? 0,
      monto: Number(a?.obligacionesSinVencimientoMonto ?? 0),
      icono: 'i-lucide-calendar-x',
      color: 'text-slate-600 dark:text-slate-400',
    },
  ]
})
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

    <div v-else-if="carteraStore.loading && !tarjetas" class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div
        v-for="i in 4"
        :key="i"
        class="flex items-start justify-between gap-3 rounded-lg border border-gray-200 p-4 dark:border-gray-800"
      >
        <div class="space-y-2">
          <USkeleton class="h-4 w-24" />
          <USkeleton class="h-7 w-32" />
          <USkeleton class="h-3 w-16" />
        </div>
        <USkeleton class="h-10 w-10 shrink-0 rounded-full" />
      </div>
    </div>

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
            <template v-if="carteraStore.recaudo">
              <p class="text-2xl font-semibold">{{ formatoMoneda(carteraStore.recaudo.montoRecaudado) }}</p>
              <p class="mt-1 text-xs text-gray-400">
                Desde {{ carteraStore.recaudo.fechaDesde }}
              </p>
            </template>
            <USkeleton v-else class="h-7 w-32" />
          </div>
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400">
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
            <li class="flex items-center justify-between">
              <span class="text-gray-500">Efectividad de cobranza (mes)</span>
              <span v-if="carteraStore.recaudo" class="font-semibold">
                {{ formatoPctONull(carteraStore.recaudo.collectionEffectiveness) }}
              </span>
              <USkeleton v-else class="h-4 w-12" />
            </li>
            <li class="flex items-center justify-between">
              <span class="text-gray-500">Días promedio de mora</span>
              <span class="font-semibold">{{ diasPromedioMora }}</span>
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
        <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <h2 class="mb-4 text-sm font-semibold">Cartera por inmueble (Top 10)</h2>
          <UiTabla :columnas="columnasTop" :filas="topInmuebles" :clave-fila="(f) => f.inmuebleId" vacio="Sin inmuebles con cartera vencida.">
            <template #celda-deudaVencida="{ fila }">{{ formatoMoneda(fila.deudaVencida) }}</template>
            <template #celda-diasMoraMaximo="{ fila }">{{ fila.diasMoraMaximo }}</template>
          </UiTabla>
        </div>
        <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <h2 class="mb-4 text-sm font-semibold">Evolución de cartera vencida (6 meses)</h2>
          <CarteraEvolucionChart :puntos="carteraStore.evolucion" :formato-moneda="formatoMoneda" />
        </div>
      </div>

      <!-- Alertas + actividad -->
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <h2 class="mb-4 text-sm font-semibold">Alertas y pendientes</h2>
          <ul class="space-y-3">
            <li v-for="a in alertas" :key="a.label" class="flex items-center gap-3 text-sm">
              <UIcon :name="a.icono" :class="['h-5 w-5 shrink-0', a.color]" />
              <span class="flex-1 text-gray-600 dark:text-gray-300">{{ a.label }}</span>
              <span class="text-right">
                <span class="font-semibold">{{ a.cantidad }}</span>
                <span class="ml-2 text-xs text-gray-400">{{ formatoMoneda(a.monto) }}</span>
              </span>
            </li>
          </ul>
        </div>
        <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <h2 class="mb-4 text-sm font-semibold">Actividad reciente en cartera</h2>
          <p v-if="actividadReciente.length === 0" class="text-sm text-gray-400">Sin actividad reciente registrada.</p>
          <ul v-else class="space-y-3">
            <li v-for="(a, i) in actividadReciente" :key="`${a.tipo}-${a.inmuebleId}-${a.fecha}-${i}`" class="flex items-center gap-3 text-sm">
              <UIcon :name="a.icono" :class="['h-5 w-5 shrink-0', a.color]" />
              <span class="flex-1 text-gray-600 dark:text-gray-300">
                {{ a.label }} · {{ a.codigo }}
              </span>
              <span class="text-right">
                <span class="font-semibold">{{ formatoMoneda(a.monto) }}</span>
                <span class="ml-2 text-xs text-gray-400">{{ a.fecha }}</span>
              </span>
            </li>
          </ul>
        </div>
      </div>
    </template>
  </div>
</template>
