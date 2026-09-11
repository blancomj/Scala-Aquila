<script setup lang="ts">
// MANT-8 · Indicadores y tendencias de mantenimiento (MANT_08_indicadores_tendencias.md §3.5).
// Todo indicador es una función de base de datos, ninguno persistido (§3.4) — esta página solo
// lee, nunca escribe. Cada tarjeta muestra su definición exacta en un UTooltip (exigencia del
// corte que el mockup no tenía) para que dos personas no lean el mismo número de forma distinta.
//
// "Comprometido"/"Disponible" (ver 20260932420000_mant8_indicadores_financieros.sql): el mockup
// del corte pedía las 4 cifras del módulo de Presupuesto, pero ese módulo solo tiene
// Presupuestado/Ejecutado — decisión aprobada con el usuario: Comprometido se muestra APARTE,
// etiquetado "estimado" (costo_estimado de OT abiertas, nunca una cifra presupuestal real);
// Disponible se omite (restaría una estimación de una cifra real).
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const tenantStore = useTenantStore()
const indicadoresStore = useMantenimientoIndicadoresStore()
const activosStore = useActivosStore()
const presupuestoStore = usePresupuestoStore()

const presupuestoSeleccionadoId = useSeleccionPresupuesto()

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}
function haceUnAnioISO(): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 1)
  return d.toISOString().slice(0, 10)
}

const fechaHasta = ref(hoyISO())
const fechaDesde = ref(haceUnAnioISO())

const cargando = ref(false)
const errorCarga = ref<string | null>(null)

async function cargarResumen(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  if (fechaDesde.value >= fechaHasta.value) {
    errorCarga.value = 'La fecha "Desde" debe ser anterior a "Hasta".'
    return
  }
  errorCarga.value = null
  cargando.value = true
  try {
    await indicadoresStore.cargarResumen({ tenantId, desde: fechaDesde.value, hasta: fechaHasta.value })
  } catch (e) {
    errorCarga.value = mensajeError(e, 'No se pudieron cargar los indicadores.')
  } finally {
    cargando.value = false
  }
}

await useAsyncData('mant8-indicadores-inicial', async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return null
  await Promise.all([
    activosStore.cargarActivos(tenantId),
    presupuestoStore.cargarPresupuestos(tenantId),
    presupuestoStore.cargarCuentas(tenantId),
    cargarResumen(),
  ])
  return null
})

// ── Pestañas ─────────────────────────────────────────────────────────
type Tab = 'resumen' | 'operacion' | 'mantenimiento' | 'financieros' | 'sla'
const TABS: ReadonlyArray<{ id: Tab; etiqueta: string }> = [
  { id: 'resumen', etiqueta: 'Resumen' },
  { id: 'operacion', etiqueta: 'Operación' },
  { id: 'mantenimiento', etiqueta: 'Mantenimiento' },
  { id: 'financieros', etiqueta: 'Financieros' },
  { id: 'sla', etiqueta: 'Cumplimiento / SLA' },
]
const tabActiva = ref<Tab>('resumen')

// ── Formato ──────────────────────────────────────────────────────────
function pct(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : `${v.toFixed(1)}%`
}
function horas(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : `${v.toFixed(1)} h`
}
function numero(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : String(v)
}

const opcionesActivo = computed(() =>
  activosStore.activos.map((a) => ({ valor: a.id, etiqueta: `${a.codigo} — ${a.nombre}` })),
)
const nombreActivo = computed(() => new Map(activosStore.activos.map((a) => [a.id, `${a.codigo} — ${a.nombre}`])))

// ── Operación / Mantenimiento: indicadores por activo (MTBF, disponibilidad, tendencia) ──
const activoSeleccionadoId = ref<string | null>(null)
const cargandoActivo = ref(false)
const errorActivo = ref<string | null>(null)

async function cargarIndicadoresActivo(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  const activoId = activoSeleccionadoId.value
  if (!tenantId || !activoId) return
  errorActivo.value = null
  cargandoActivo.value = true
  try {
    await Promise.all([
      indicadoresStore.cargarMtbf({ tenantId, activoId, desde: fechaDesde.value, hasta: fechaHasta.value }),
      indicadoresStore.cargarDisponibilidad({ tenantId, activoId, desde: fechaDesde.value, hasta: fechaHasta.value }),
      indicadoresStore.cargarTendencia({ tenantId, activoId, ventanas: ventanasTendencia.value, diasVentana: diasVentanaTendencia.value }),
    ])
  } catch (e) {
    errorActivo.value = mensajeError(e, 'No se pudieron cargar los indicadores del activo.')
  } finally {
    cargandoActivo.value = false
  }
}
watch(activoSeleccionadoId, cargarIndicadoresActivo)

const ventanasTendencia = ref(4)
const diasVentanaTendencia = ref(90)
watch([ventanasTendencia, diasVentanaTendencia], () => {
  if (activoSeleccionadoId.value) cargarIndicadoresActivo()
})

const TENDENCIA_ETIQUETA: Record<string, string> = {
  creciente: 'Creciente',
  decreciente: 'Decreciente',
  estable: 'Estable',
  datos_insuficientes: 'Datos insuficientes',
}
const TENDENCIA_COLOR: Record<string, 'error' | 'success' | 'neutral' | 'warning'> = {
  creciente: 'error',
  decreciente: 'success',
  estable: 'neutral',
  datos_insuficientes: 'warning',
}

// ── Mantenimiento: costo agrupado (mant_costos, ya cargado por cargarResumen) ──
const costoPorActivo = computed(() => {
  const mapa = new Map<string, number>()
  for (const fila of indicadoresStore.costos) {
    if (!fila.activo_id) continue
    mapa.set(fila.activo_id, (mapa.get(fila.activo_id) ?? 0) + Number(fila.monto))
  }
  return [...mapa.entries()]
    .map(([activoId, monto]) => ({ activoId, nombre: nombreActivo.value.get(activoId) ?? activoId, monto }))
    .sort((a, b) => b.monto - a.monto)
})

const costoTotal = computed(() => indicadoresStore.costos.reduce((acc, f) => acc + Number(f.monto), 0))

// ── Financieros ──────────────────────────────────────────────────────
const cuentaSeleccionadaId = ref<string | null>(null)
const opcionesCuenta = computed(() =>
  presupuestoStore.cuentas
    .filter((c) => c.es_hoja && c.activa && c.naturaleza === 'egreso')
    .map((c) => ({ valor: c.id, etiqueta: `${c.codigo} · ${c.nombre}` })),
)

const cargandoFinanciero = ref(false)
const errorFinanciero = ref<string | null>(null)

async function cargarFinanciero(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !presupuestoSeleccionadoId.value) return
  errorFinanciero.value = null
  cargandoFinanciero.value = true
  try {
    await indicadoresStore.cargarFinanciero({
      tenantId,
      presupuestoId: presupuestoSeleccionadoId.value,
      cuentaId: cuentaSeleccionadaId.value ?? undefined,
    })
  } catch (e) {
    errorFinanciero.value = mensajeError(e, 'No se pudo cargar el comparativo presupuestal.')
  } finally {
    cargandoFinanciero.value = false
  }
}
watch([presupuestoSeleccionadoId, cuentaSeleccionadaId], cargarFinanciero, { immediate: true })

const totalPresupuestado = computed(() =>
  indicadoresStore.financiero.reduce((acc, f) => acc + Number(f.presupuestado ?? 0), 0),
)
const totalEjecutado = computed(() =>
  indicadoresStore.financiero.reduce((acc, f) => acc + Number(f.ejecutado ?? 0), 0),
)
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <UiTituloDescripcion clase-descripcion="text-sm text-neutral-500 mt-1">
        <template #titulo>
          <h1 class="text-xl font-semibold">Indicadores de mantenimiento</h1>
        </template>
        <template #descripcion>
          Descripción de tendencias sobre los datos que ya existen — nunca predicción. Cada
          indicador declara su definición exacta (pasa el cursor sobre el ícono <UIcon name="i-lucide-info" class="inline size-3.5 align-text-top" />).
        </template>
      </UiTituloDescripcion>
      <div class="flex items-end gap-3">
        <UFormField label="Desde">
          <UInput v-model="fechaDesde" type="date" class="w-44" @change="cargarResumen" />
        </UFormField>
        <UFormField label="Hasta">
          <UInput v-model="fechaHasta" type="date" class="w-44" @change="cargarResumen" />
        </UFormField>
      </div>
    </div>

    <UAlert v-if="errorCarga" color="error" variant="soft" :title="errorCarga" />

    <nav class="flex gap-1 border-b border-neutral-200 dark:border-neutral-800 overflow-x-auto" role="tablist">
      <button
        v-for="tab in TABS"
        :key="tab.id"
        type="button"
        class="px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors"
        :class="
          tabActiva === tab.id
            ? 'border-primary text-primary font-medium'
            : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
        "
        @click="tabActiva = tab.id"
      >
        {{ tab.etiqueta }}
      </button>
    </nav>

    <div v-if="cargando" class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div v-for="i in 4" :key="i" class="space-y-2 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
        <USkeleton class="h-4 w-32" />
        <USkeleton class="h-7 w-20" />
      </div>
    </div>

    <!-- ══════════════════ Resumen ══════════════════ -->
    <template v-else-if="tabActiva === 'resumen'">
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div class="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <p class="flex items-center gap-1 text-sm text-neutral-500">
            MTTR
            <UTooltip text="Promedio de horas corridas entre el reporte de una incidencia y el cierre de la OT que la resolvió.">
              <UIcon name="i-lucide-info" class="size-3.5" />
            </UTooltip>
          </p>
          <p class="mt-1 text-2xl font-semibold">{{ horas(indicadoresStore.mttr?.mttr_horas) }}</p>
          <p class="text-xs text-neutral-400">{{ numero(indicadoresStore.mttr?.muestras) }} muestras</p>
        </div>
        <div class="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <p class="flex items-center gap-1 text-sm text-neutral-500">
            Cumplimiento del plan
            <UTooltip text="Programaciones que generaron OT sobre el total programado en el rango — excluye las omitidas por activo fuera de servicio.">
              <UIcon name="i-lucide-info" class="size-3.5" />
            </UTooltip>
          </p>
          <p class="mt-1 text-2xl font-semibold">{{ pct(indicadoresStore.cumplimientoPlan?.pct) }}</p>
          <p class="text-xs text-neutral-400">
            {{ numero(indicadoresStore.cumplimientoPlan?.ejecutadas) }} de {{ numero(indicadoresStore.cumplimientoPlan?.programadas) }}
          </p>
        </div>
        <div class="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <p class="flex items-center gap-1 text-sm text-neutral-500">
            OT cerradas a tiempo
            <UTooltip text="De las OT cerradas en el rango con fecha límite definida, proporción cerrada en o antes de esa fecha.">
              <UIcon name="i-lucide-info" class="size-3.5" />
            </UTooltip>
          </p>
          <p class="mt-1 text-2xl font-semibold">{{ pct(indicadoresStore.otATiempo?.pct) }}</p>
          <p class="text-xs text-neutral-400">
            {{ numero(indicadoresStore.otATiempo?.a_tiempo) }} de {{ numero(indicadoresStore.otATiempo?.cerradas) }}
          </p>
        </div>
        <div class="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <p class="flex items-center gap-1 text-sm text-neutral-500">
            Costo total de mantenimiento
            <UTooltip text="Suma de presupuesto_ejecucion.monto de todos los movimientos ligados a un activo (mant_costos) en el rango — cifra real del presupuesto.">
              <UIcon name="i-lucide-info" class="size-3.5" />
            </UTooltip>
          </p>
          <p class="mt-1 text-2xl font-semibold">{{ formatoMoneda(costoTotal) }}</p>
        </div>
        <div class="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <p class="flex items-center gap-1 text-sm text-neutral-500">
            Costo por m²
            <UTooltip text="Costo total de mantenimiento del rango dividido entre la suma de inmuebles.area_privada del tenant.">
              <UIcon name="i-lucide-info" class="size-3.5" />
            </UTooltip>
          </p>
          <p class="mt-1 text-2xl font-semibold">
            {{ indicadoresStore.costoM2?.costo_m2 !== null && indicadoresStore.costoM2?.costo_m2 !== undefined ? formatoMoneda(indicadoresStore.costoM2.costo_m2) : '—' }}
          </p>
        </div>
        <div class="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <p class="flex items-center gap-1 text-sm text-neutral-500">
            Hallazgos críticos abiertos
            <UTooltip text="Hallazgos de inspección con severidad crítico, en estado abierto o en_tratamiento.">
              <UIcon name="i-lucide-info" class="size-3.5" />
            </UTooltip>
          </p>
          <p class="mt-1 text-2xl font-semibold" :class="indicadoresStore.hallazgosCriticos.length > 0 ? 'text-error-500' : ''">
            {{ indicadoresStore.hallazgosCriticos.length }}
          </p>
        </div>
        <div class="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <p class="flex items-center gap-1 text-sm text-neutral-500">
            Habilitaciones vencidas
            <UTooltip text="Habilitaciones vencidas o próximas a vencer de terceros con al menos un contrato vigente.">
              <UIcon name="i-lucide-info" class="size-3.5" />
            </UTooltip>
          </p>
          <p class="mt-1 text-2xl font-semibold" :class="indicadoresStore.habilitacionesVencidas.length > 0 ? 'text-warning-500' : ''">
            {{ indicadoresStore.habilitacionesVencidas.length }}
          </p>
        </div>
        <div class="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <p class="flex items-center gap-1 text-sm text-neutral-500">
            Comprometido
            <UBadge size="xs" variant="subtle" color="warning">estimado</UBadge>
            <UTooltip text="Suma de costo_estimado de OT abiertas (no cerradas ni canceladas) — una estimación, NO una cifra presupuestal real. No forma parte de la comparación exacta contra Presupuesto.">
              <UIcon name="i-lucide-info" class="size-3.5" />
            </UTooltip>
          </p>
          <p class="mt-1 text-2xl font-semibold">{{ formatoMoneda(indicadoresStore.comprometidoEstimado?.comprometido_estimado ?? 0) }}</p>
        </div>
      </div>
    </template>

    <!-- ══════════════════ Operación ══════════════════ -->
    <template v-else-if="tabActiva === 'operacion'">
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div class="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <h3 class="mb-2 text-sm font-semibold">Proporción por tipo de mantenimiento</h3>
          <ul class="space-y-1 text-sm">
            <li v-for="fila in indicadoresStore.proporcionMantenimiento" :key="fila.tipo_id" class="flex justify-between">
              <span>{{ fila.tipo_nombre }}</span>
              <span class="tabular-nums font-medium">{{ fila.cantidad }}</span>
            </li>
            <li v-if="indicadoresStore.proporcionMantenimiento.length === 0" class="text-neutral-400">Sin OT en el rango.</li>
          </ul>
        </div>

        <div class="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <h3 class="mb-3 flex items-center gap-2 text-sm font-semibold">
            MTBF y disponibilidad por activo
            <UTooltip text="MTBF: promedio de horas entre fallas consecutivas de un activo. Disponibilidad: % del rango con el activo en_servicio, según su historial de estados.">
              <UIcon name="i-lucide-info" class="size-3.5" />
            </UTooltip>
          </h3>
          <UiSelectorBuscable
            v-model="activoSeleccionadoId"
            :opciones="opcionesActivo"
            placeholder="Selecciona un activo"
            class="mb-3"
          />
          <UAlert v-if="errorActivo" color="error" variant="soft" :title="errorActivo" class="mb-3" />
          <template v-if="activoSeleccionadoId">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <p class="text-xs text-neutral-500">MTBF</p>
                <p class="text-lg font-semibold">{{ horas(indicadoresStore.mtbf?.mtbf_horas) }}</p>
                <p class="text-xs text-neutral-400">{{ numero(indicadoresStore.mtbf?.fallas) }} fallas</p>
              </div>
              <div>
                <p class="text-xs text-neutral-500">Disponibilidad</p>
                <p class="text-lg font-semibold">{{ pct(indicadoresStore.disponibilidad?.disponibilidad_pct) }}</p>
              </div>
            </div>
          </template>
          <p v-else class="text-sm text-neutral-400">Selecciona un activo para ver su MTBF y disponibilidad.</p>
        </div>
      </div>
    </template>

    <!-- ══════════════════ Mantenimiento ══════════════════ -->
    <template v-else-if="tabActiva === 'mantenimiento'">
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div class="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <h3 class="mb-3 text-sm font-semibold">Costo por activo</h3>
          <ul class="space-y-1 text-sm max-h-96 overflow-y-auto">
            <li v-for="fila in costoPorActivo" :key="fila.activoId" class="flex justify-between gap-2">
              <span class="truncate">{{ fila.nombre }}</span>
              <span class="tabular-nums font-medium shrink-0">{{ formatoMoneda(fila.monto) }}</span>
            </li>
            <li v-if="costoPorActivo.length === 0" class="text-neutral-400">Sin costos ligados a un activo en el rango.</li>
          </ul>
        </div>

        <div class="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <h3 class="mb-3 flex items-center gap-2 text-sm font-semibold">
            Tendencia de fallas
            <UTooltip text="Compara cada ventana de días contra la ventana inmediatamente anterior — descripción de patrón, nunca predicción ni regresión.">
              <UIcon name="i-lucide-info" class="size-3.5" />
            </UTooltip>
          </h3>
          <div class="mb-3 flex items-end gap-2">
            <UFormField label="Ventanas" size="xs">
              <UInput v-model.number="ventanasTendencia" type="number" min="2" max="12" class="w-20" />
            </UFormField>
            <UFormField label="Días por ventana" size="xs">
              <UInput v-model.number="diasVentanaTendencia" type="number" min="7" class="w-24" />
            </UFormField>
          </div>
          <p v-if="!activoSeleccionadoId" class="text-sm text-neutral-400">
            Selecciona un activo en la pestaña "Operación" para ver su tendencia.
          </p>
          <ul v-else class="space-y-2 text-sm">
            <li v-for="fila in indicadoresStore.tendencia" :key="fila.ventana" class="flex items-center justify-between gap-2 border-b border-neutral-100 pb-1 last:border-0 dark:border-neutral-800">
              <span class="text-neutral-500">{{ fila.desde }} → {{ fila.hasta }}</span>
              <span class="tabular-nums">{{ fila.fallas }} fallas</span>
              <UBadge v-if="fila.tendencia" size="xs" variant="subtle" :color="TENDENCIA_COLOR[fila.tendencia] ?? 'neutral'">
                {{ TENDENCIA_ETIQUETA[fila.tendencia] ?? fila.tendencia }}
              </UBadge>
            </li>
          </ul>
        </div>
      </div>
    </template>

    <!-- ══════════════════ Financieros ══════════════════ -->
    <template v-else-if="tabActiva === 'financieros'">
      <div class="rounded-md border border-neutral-200 p-4 dark:border-neutral-800 space-y-4">
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <h3 class="text-sm font-semibold">Presupuestado vs. ejecutado</h3>
          <p class="text-xs text-neutral-500">
            Leído directamente del módulo de
            <NuxtLink to="/presupuesto#ejecucion-presupuestal" class="text-primary underline">Presupuesto</NuxtLink>
            — coincide exactamente, no es un cálculo propio.
          </p>
        </div>
        <div class="flex items-end gap-3 flex-wrap">
          <PresupuestoSelector v-if="presupuestoStore.presupuestos.length > 0" v-model="presupuestoSeleccionadoId" />
          <UiSelectorBuscable v-model="cuentaSeleccionadaId" :opciones="opcionesCuenta" placeholder="Todas las cuentas de egreso" class="w-72" />
        </div>
        <UAlert v-if="errorFinanciero" color="error" variant="soft" :title="errorFinanciero" />
        <div v-if="cargandoFinanciero" class="text-sm text-neutral-400">Cargando…</div>
        <template v-else>
          <div class="grid grid-cols-2 gap-4 sm:grid-cols-2">
            <div>
              <p class="text-xs text-neutral-500 uppercase tracking-wide">Presupuestado (anual)</p>
              <p class="text-lg font-semibold tabular-nums">{{ formatoMoneda(totalPresupuestado) }}</p>
            </div>
            <div>
              <p class="text-xs text-neutral-500 uppercase tracking-wide">Ejecutado</p>
              <p class="text-lg font-semibold tabular-nums">{{ formatoMoneda(totalEjecutado) }}</p>
            </div>
          </div>
          <ul class="space-y-1 text-sm max-h-72 overflow-y-auto">
            <li v-for="fila in indicadoresStore.financiero" :key="fila.cuenta_id" class="flex justify-between gap-2">
              <span class="truncate">{{ fila.cuenta_codigo }} · {{ fila.cuenta_nombre }}</span>
              <span class="tabular-nums shrink-0">{{ formatoMoneda(fila.ejecutado ?? 0) }} / {{ formatoMoneda(fila.presupuestado ?? 0) }}</span>
            </li>
            <li v-if="indicadoresStore.financiero.length === 0" class="text-neutral-400">Sin datos para el presupuesto seleccionado.</li>
          </ul>
        </template>
      </div>
    </template>

    <!-- ══════════════════ Cumplimiento / SLA ══════════════════ -->
    <template v-else-if="tabActiva === 'sla'">
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div class="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <h3 class="mb-3 flex items-center gap-2 text-sm font-semibold">
            Cumplimiento normativo
            <UTooltip text="Mismo cálculo que mant_estado_cumplimiento (MANT-2), agrupado por estado.">
              <UIcon name="i-lucide-info" class="size-3.5" />
            </UTooltip>
          </h3>
          <ul class="space-y-1 text-sm">
            <li v-for="fila in indicadoresStore.cumplimientoNormativo" :key="fila.estado" class="flex justify-between">
              <span class="capitalize">{{ fila.estado?.replace(/_/g, ' ') }}</span>
              <span class="tabular-nums font-medium">{{ fila.cantidad }}</span>
            </li>
            <li v-if="indicadoresStore.cumplimientoNormativo.length === 0" class="text-neutral-400">Sin requisitos aplicables.</li>
          </ul>
        </div>

        <div class="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <h3 class="mb-3 text-sm font-semibold">Hallazgos críticos abiertos</h3>
          <ul class="space-y-1 text-sm max-h-72 overflow-y-auto">
            <li v-for="h in indicadoresStore.hallazgosCriticos" :key="h.hallazgo_id" class="flex justify-between gap-2">
              <span class="truncate">{{ h.descripcion }}</span>
              <span class="tabular-nums shrink-0 text-neutral-500">{{ h.dias_abierto }} d</span>
            </li>
            <li v-if="indicadoresStore.hallazgosCriticos.length === 0" class="text-neutral-400">Sin hallazgos críticos abiertos.</li>
          </ul>
        </div>

        <div class="rounded-md border border-neutral-200 p-4 dark:border-neutral-800 lg:col-span-2">
          <h3 class="mb-3 text-sm font-semibold">Habilitaciones vencidas de contratistas activos</h3>
          <ul class="space-y-1 text-sm">
            <li v-for="h in indicadoresStore.habilitacionesVencidas" :key="h.habilitacion_id" class="flex justify-between gap-2">
              <span>{{ h.tercero_nombre }} — {{ h.tipo_nombre }}</span>
              <UBadge size="xs" variant="subtle" :color="h.estado === 'vencida' ? 'error' : 'warning'">
                {{ h.estado === 'vencida' ? 'Vencida' : 'Próxima a vencer' }} ({{ h.vigente_hasta }})
              </UBadge>
            </li>
            <li v-if="indicadoresStore.habilitacionesVencidas.length === 0" class="text-neutral-400">Sin habilitaciones vencidas.</li>
          </ul>
        </div>
      </div>
    </template>
  </div>
</template>
