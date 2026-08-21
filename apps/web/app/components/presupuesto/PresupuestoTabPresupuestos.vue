<script setup lang="ts">
// Pestaña "Presupuestos" del rediseño de Presupuesto — tabla real +
// panel de detalle (antes era solo un combo de texto sin tabla, ver
// PLAN aprobado). Selecciona una fila actualiza el mismo
// presupuestoSeleccionadoId que usa el resto de las pestañas (v-model),
// no mantiene un estado de selección propio.
//
// Estado como badge de color + descripción (mockup "Libro Presupuestal"):
// "vigente" en gris plano no comunica nada por sí solo — ver
// utils/presupuesto-labels.ts. El panel de detalle ya no repite monto/fecha
// de aprobación que la propia tabla muestra al lado; solo aporta lo que la
// tabla no tiene (acta de asamblea + el aviso de inmutabilidad).
const props = defineProps<{ presupuestoId: string | null }>()
const emit = defineEmits<{ 'update:presupuestoId': [id: string] }>()

const tenantStore = useTenantStore()
const presupuestoStore = usePresupuestoStore()

const presupuestoSeleccionado = computed(
  () => presupuestoStore.presupuestos.find((p) => p.id === props.presupuestoId) ?? null,
)

const drawerAbierto = ref(false)
const errorActivar = ref<string | null>(null)

function formatoMoneda(valor: string | number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(valor))
}

function vigenciaTexto(desde: string | null, hasta: string | null): string {
  if (!desde && !hasta) return '—'
  return `${desde ?? '—'} – ${hasta ?? '—'}`
}

const activandoId = ref<string | null>(null)

async function activarPresupuesto(id: string): Promise<void> {
  errorActivar.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return

  activandoId.value = id
  try {
    await presupuestoStore.activarPresupuesto(id, tenantId)
    emit('update:presupuestoId', id)
  } catch (excepcion) {
    errorActivar.value = mensajeError(excepcion, 'No se pudo activar el presupuesto.')
  } finally {
    activandoId.value = null
  }
}

function onCreado(id: string): void {
  drawerAbierto.value = false
  emit('update:presupuestoId', id)
}
</script>

<template>
  <div class="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
    <div>
      <div class="flex items-center justify-between mb-2">
        <h2 class="text-lg font-semibold">Presupuestos</h2>
        <UButton size="xs" @click="drawerAbierto = true">Nuevo presupuesto</UButton>
      </div>

      <UiTabla
        :columnas="[
          { clave: 'anio', etiqueta: 'Año / Versión' },
          { clave: 'monto', etiqueta: 'Monto total', alinear: 'derecha' },
          { clave: 'estado', etiqueta: 'Estado' },
          { clave: 'vigencia', etiqueta: 'Vigencia' },
          { clave: 'aprobacion', etiqueta: 'Fecha aprobación' },
          { clave: 'acciones', etiqueta: '' },
        ]"
        :filas="presupuestoStore.presupuestos"
        :clave-fila="(fila) => fila.id"
        vacio="Ninguno."
      >
        <template #celda-anio="{ fila }">
          <button
            type="button"
            class="text-left hover:underline"
            :class="{ 'font-semibold': fila.id === presupuestoId }"
            @click="emit('update:presupuestoId', fila.id)"
          >
            {{ fila.anio }} — v{{ fila.version }}
          </button>
        </template>
        <template #celda-monto="{ fila }">
          <span class="tabular-nums">{{ formatoMoneda(fila.monto_total) }}</span>
        </template>
        <template #celda-estado="{ fila }">
          <UBadge :color="COLOR_ESTADO_PRESUPUESTO[fila.estado] ?? 'neutral'" variant="subtle">
            {{ ETIQUETA_ESTADO_PRESUPUESTO[fila.estado] ?? fila.estado }}
          </UBadge>
        </template>
        <template #celda-vigencia="{ fila }">
          <span class="text-gray-500">{{
            vigenciaTexto(fila.vigente_desde, fila.vigente_hasta)
          }}</span>
        </template>
        <template #celda-aprobacion="{ fila }">
          <span class="text-gray-500">{{ fila.fecha_aprobacion ?? '—' }}</span>
        </template>
        <template #celda-acciones="{ fila }">
          <UButton
            v-if="fila.estado === 'borrador'"
            size="xs"
            variant="soft"
            :loading="activandoId === fila.id"
            @click="activarPresupuesto(fila.id)"
          >
            Activar
          </UButton>
        </template>
      </UiTabla>

      <UAlert v-if="errorActivar" color="error" variant="soft" :title="errorActivar" class="mt-2" />
    </div>

    <div
      v-if="presupuestoSeleccionado"
      class="rounded-lg border border-gray-200 dark:border-gray-800 p-4"
    >
      <div class="flex items-start justify-between gap-2 mb-1">
        <p class="text-sm font-medium">
          {{ presupuestoSeleccionado.anio }} — v{{ presupuestoSeleccionado.version }}
        </p>
        <UBadge
          :color="COLOR_ESTADO_PRESUPUESTO[presupuestoSeleccionado.estado] ?? 'neutral'"
          variant="subtle"
        >
          {{ ETIQUETA_ESTADO_PRESUPUESTO[presupuestoSeleccionado.estado] ?? presupuestoSeleccionado.estado }}
        </UBadge>
      </div>
      <p class="text-xs text-gray-500 mb-3">
        {{ DESCRIPCION_ESTADO_PRESUPUESTO[presupuestoSeleccionado.estado] ?? '' }}
      </p>

      <dl class="space-y-2 text-sm">
        <div class="flex justify-between gap-2">
          <dt class="text-gray-500">Acta asamblea</dt>
          <dd>{{ presupuestoSeleccionado.acta_asamblea ?? '—' }}</dd>
        </div>
        <div class="flex justify-between gap-2">
          <dt class="text-gray-500">Vigencia</dt>
          <dd>{{ vigenciaTexto(presupuestoSeleccionado.vigente_desde, presupuestoSeleccionado.vigente_hasta) }}</dd>
        </div>
      </dl>
    </div>

    <PresupuestoCrearDrawer
      v-if="drawerAbierto"
      @cerrar="drawerAbierto = false"
      @creado="onCreado"
    />
  </div>
</template>
