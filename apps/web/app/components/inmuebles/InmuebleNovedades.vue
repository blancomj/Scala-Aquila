<script setup lang="ts">
// Tab Novedades activas — filtro por estado, aprobar/rechazar
// (PROMPT_FICHA_INMUEBLE.md §1.1 I6). Reutiliza cuentaCorriente.ts. La
// creación vive en /novedades/nueva (NovedadesEditor.vue) — antes este tab
// tenía su propio drawer de creación con un formulario más viejo y limitado
// (sin motivo, repetición ni periodo); se quitó para no tener dos caminos
// distintos para crear lo mismo.
import type { Database } from '@aquila/shared'

type NovedadEstado = Database['public']['Enums']['novedad_estado_t']

const props = defineProps<{ inmuebleId: string }>()

const tenantStore = useTenantStore()
const cuentaStore = useCuentaCorrienteStore()

const filtroEstado = ref<'todas' | NovedadEstado>('todas')
const novedadesFiltradas = computed(() =>
  filtroEstado.value === 'todas'
    ? cuentaStore.novedades
    : cuentaStore.novedades.filter((n) => n.estado === filtroEstado.value),
)

const motivoRechazo = ref<Record<string, string>>({})
const procesando = ref<string | null>(null)
const error = ref<string | null>(null)

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await cuentaStore.cargarNovedades(tenantId, props.inmuebleId)
}

async function aprobar(id: string): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  procesando.value = id
  try {
    await cuentaStore.aprobarNovedad(id, tenantId)
  } finally {
    procesando.value = null
  }
}

async function rechazar(id: string): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  const motivo = motivoRechazo.value[id]?.trim()
  if (!tenantId || !motivo) {
    error.value = 'Escribe un motivo de rechazo.'
    return
  }
  procesando.value = id
  try {
    await cuentaStore.rechazarNovedad(id, motivo, tenantId)
    motivoRechazo.value[id] = ''
  } finally {
    procesando.value = null
  }
}

watchEffect(cargar)
</script>

<template>
  <div>
    <div class="panel-head">
      <div>
        <h2>Novedades activas</h2>
        <p class="panel-sub">Solicitudes de cargo, descuento o ajuste sobre este inmueble.</p>
      </div>
      <UButton :to="`/novedades/nueva?inmuebleId=${inmuebleId}`" size="sm">Nueva novedad</UButton>
    </div>

    <UAlert v-if="error" color="error" variant="soft" :title="error" class="mb-3" />

    <UFieldGroup size="xs" class="mb-3">
      <UButton
        :color="filtroEstado === 'todas' ? 'primary' : 'neutral'"
        :variant="filtroEstado === 'todas' ? 'solid' : 'outline'"
        @click="filtroEstado = 'todas'"
      >
        Todas
      </UButton>
      <UButton
        :color="filtroEstado === 'pendiente' ? 'primary' : 'neutral'"
        :variant="filtroEstado === 'pendiente' ? 'solid' : 'outline'"
        @click="filtroEstado = 'pendiente'"
      >
        Pendientes
      </UButton>
      <UButton
        :color="filtroEstado === 'aprobada' ? 'primary' : 'neutral'"
        :variant="filtroEstado === 'aprobada' ? 'solid' : 'outline'"
        @click="filtroEstado = 'aprobada'"
      >
        Aprobadas
      </UButton>
      <UButton
        :color="filtroEstado === 'rechazada' ? 'primary' : 'neutral'"
        :variant="filtroEstado === 'rechazada' ? 'solid' : 'outline'"
        @click="filtroEstado = 'rechazada'"
      >
        Rechazadas
      </UButton>
    </UFieldGroup>

    <UiTabla
      :columnas="[
        { clave: 'tipo', etiqueta: 'Tipo' },
        { clave: 'monto', etiqueta: 'Monto', alinear: 'derecha', claseCelda: 'mono' },
        { clave: 'descripcion', etiqueta: 'Descripción' },
        { clave: 'fechaEfectiva', etiqueta: 'Fecha efectiva', claseCelda: 'mono' },
        { clave: 'estado', etiqueta: 'Estado' },
        { clave: 'acciones', etiqueta: '' },
      ]"
      :filas="novedadesFiltradas"
      :clave-fila="(n) => n.id"
      vacio="Sin novedades para este filtro."
    >
      <template #celda-tipo="{ fila }"><UBadge color="neutral" variant="subtle">{{ fila.tipo }}</UBadge></template>
      <template #celda-monto="{ fila }">$ {{ Number(fila.monto).toLocaleString('es-CO') }}</template>
      <template #celda-descripcion="{ fila }">{{ fila.descripcion }}</template>
      <template #celda-fechaEfectiva="{ fila }">{{ fila.fecha_efectiva }}</template>
      <template #celda-estado="{ fila }">
        <UBadge
          :color="fila.estado === 'aprobada' ? 'success' : fila.estado === 'rechazada' ? 'error' : 'warning'"
          variant="subtle"
        >
          {{ fila.estado }}
        </UBadge>
      </template>
      <template #celda-acciones="{ fila }">
        <div v-if="fila.estado === 'pendiente'" class="flex items-center gap-1.5">
          <UInput
            v-model="motivoRechazo[fila.id]"
            type="text"
            placeholder="Motivo de rechazo"
            size="xs"
            class="w-32"
          />
          <UButton
            color="success"
            variant="soft"
            size="xs"
            icon="i-lucide-check"
            :disabled="procesando === fila.id"
            @click="aprobar(fila.id)"
          >
            Aprobar
          </UButton>
          <UButton
            color="error"
            variant="soft"
            size="xs"
            icon="i-lucide-x"
            :disabled="procesando === fila.id"
            @click="rechazar(fila.id)"
          >
            Rechazar
          </UButton>
        </div>
      </template>
    </UiTabla>
  </div>
</template>
