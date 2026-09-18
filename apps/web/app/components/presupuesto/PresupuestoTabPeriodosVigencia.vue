<script setup lang="ts">
// Pestaña "Periodos y Vigencia" — expone por primera vez en UI los campos
// de vigencia del presupuesto (ya existen en la tabla, nunca se
// mostraban).
//
// Relación periodo↔presupuesto: RESUELTO (E9, ver
// 20260823270000_presupuesto_ejecucion.sql) — deliberadamente sigue sin
// existir una FK periodo_id→presupuesto_id. presupuesto_cuenta_ejecucion()
// ya cruza ambos por año fiscal (periodos.anio = presupuestos.anio) y
// funciona correctamente: un presupuesto es siempre anual, y "el
// presupuesto vigente de este año" ya es unívoco por
// presupuestos_vigente_unico (un solo vigente por tenant+año). Una FK
// explícita no agregaría información — solo replicaría lo que el año ya
// determina — y complicaría el versionado (¿a qué versión del año
// engancha cada periodo cuando se crea una v2?). Esta pestaña ahora
// filtra por ese mismo criterio (año), en vez de listar todos los
// periodos del tenant sin relación visible con el presupuesto elegido.
const tenantStore = useTenantStore()
const presupuestoStore = usePresupuestoStore()
const liquidacionStore = useLiquidacionStore()

const cargando = ref(false)

onMounted(async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || liquidacionStore.periodos.length > 0) return
  cargando.value = true
  try {
    await liquidacionStore.cargarPeriodos(tenantId)
  } finally {
    cargando.value = false
  }
})

// Estado compartido con el resto de páginas de Presupuesto (Presupuesto, Control y
// validaciones) — el selector vive acá, junto a la vigencia que describe, en vez de en el
// encabezado de la página.
const presupuestoSeleccionadoId = useSeleccionPresupuesto()
const presupuestoSeleccionado = computed(
  () => presupuestoStore.presupuestos.find((p) => p.id === presupuestoSeleccionadoId.value) ?? null,
)

/** Mismo criterio que presupuesto_cuenta_ejecucion() (E9): el año fiscal del presupuesto es la
 * relación con periodos, no una FK. */
const periodosDelAnio = computed(() => {
  const anio = presupuestoSeleccionado.value?.anio
  if (anio === undefined) return []
  return liquidacionStore.periodos.filter((p) => p.anio === anio)
})

const COLOR_ESTADO_PERIODO: Record<string, 'success' | 'warning' | 'neutral' | 'error'> = {
  abierto: 'success',
  en_liquidacion: 'warning',
  cerrado: 'neutral',
  bloqueado: 'error',
}

const hoy = new Date()
function esPeriodoActual(fila: { anio: number; mes: number }): boolean {
  return fila.anio === hoy.getFullYear() && fila.mes === hoy.getMonth() + 1
}

const resumenPeriodos = computed(() => {
  const abiertos = periodosDelAnio.value.filter((p) => p.estado === 'abierto').length
  const cerrados = periodosDelAnio.value.filter((p) => p.estado === 'cerrado').length
  return { abiertos, cerrados }
})
</script>

<template>
  <div class="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 items-start">
    <div>
      <div class="flex items-center justify-between gap-2 mb-2">
        <h2 class="text-lg font-semibold">Vigencia del presupuesto</h2>
        <UBadge
          v-if="presupuestoSeleccionado"
          :color="COLOR_ESTADO_PRESUPUESTO[presupuestoSeleccionado.estado] ?? 'neutral'"
          variant="subtle"
        >
          {{ ETIQUETA_ESTADO_PRESUPUESTO[presupuestoSeleccionado.estado] ?? presupuestoSeleccionado.estado }}
        </UBadge>
      </div>
      <PresupuestoSelector
        v-if="presupuestoStore.presupuestos.length > 0"
        v-model="presupuestoSeleccionadoId"
        compacto
        class="mb-3"
      />
      <p v-if="!presupuestoSeleccionado" class="text-sm text-neutral-500">
        Selecciona un presupuesto para ver su vigencia.
      </p>
      <div v-else class="rounded-lg border border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-100 dark:divide-neutral-800">
        <div class="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
          <dt class="flex items-center gap-1.5 text-neutral-500">
            <UIcon name="i-lucide-calendar" class="size-4" /> Vigente desde
          </dt>
          <dd class="font-medium">{{ presupuestoSeleccionado.vigente_desde ?? '—' }}</dd>
        </div>
        <div class="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
          <dt class="flex items-center gap-1.5 text-neutral-500">
            <UIcon name="i-lucide-calendar-x" class="size-4" /> Vigente hasta
          </dt>
          <dd class="font-medium">{{ presupuestoSeleccionado.vigente_hasta ?? '—' }}</dd>
        </div>
        <div class="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
          <dt class="flex items-center gap-1.5 text-neutral-500">
            <UIcon name="i-lucide-check-circle-2" class="size-4" /> Fecha de aprobación
          </dt>
          <dd class="font-medium">{{ presupuestoSeleccionado.fecha_aprobacion ?? '—' }}</dd>
        </div>
        <div class="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
          <dt class="flex items-center gap-1.5 text-neutral-500">
            <UIcon name="i-lucide-file-text" class="size-4" /> Acta
          </dt>
          <dd class="font-medium text-right">{{ presupuestoSeleccionado.acta_asamblea ?? '—' }}</dd>
        </div>
      </div>
    </div>

    <div>
      <h2 class="text-lg font-semibold mb-2">Periodos de liquidación</h2>
      <p class="text-sm text-neutral-500 mb-2">
        Año fiscal {{ presupuestoSeleccionado?.anio ?? '—' }} ·
        {{ resumenPeriodos.abiertos }} abiertos · {{ resumenPeriodos.cerrados }} cerrados
      </p>
      <div class="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
        <UiTabla
          :columnas="[
            { clave: 'periodo', etiqueta: 'Periodo', claseCelda: 'mono' },
            { clave: 'estado', etiqueta: 'Estado' },
            { clave: 'vencimiento', etiqueta: 'Vencimiento', claseCelda: 'mono' },
          ]"
          :filas="periodosDelAnio"
          :clave-fila="(fila) => fila.id"
          :clase-fila="(fila) => (esPeriodoActual(fila) ? 'bg-neutral-50 dark:bg-neutral-900/50' : undefined)"
          vacio="Sin periodos para este año todavía."
        >
          <template v-if="cargando" #vacio>
            <div class="space-y-2">
              <USkeleton v-for="i in 5" :key="i" class="h-8 w-full" />
            </div>
          </template>
          <template #celda-periodo="{ fila }">
            <span class="inline-flex items-center gap-2">
              {{ fila.anio }}-{{ String(fila.mes).padStart(2, '0') }}
              <UBadge v-if="esPeriodoActual(fila)" color="primary" variant="subtle">Actual</UBadge>
            </span>
          </template>
          <template #celda-estado="{ fila }">
            <UBadge :color="COLOR_ESTADO_PERIODO[fila.estado] ?? 'neutral'" variant="subtle">
              {{ fila.estado }}
            </UBadge>
          </template>
          <template #celda-vencimiento="{ fila }">
            <span class="text-neutral-500">{{ fila.fecha_vencimiento ?? '—' }}</span>
          </template>
        </UiTabla>
      </div>
    </div>
  </div>
</template>
