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
      <NuxtLink
        :to="`/novedades/nueva?inmuebleId=${inmuebleId}`"
        class="btn btn--primary"
        style="font-size: 12.5px; padding: 7px 14px"
      >
        Nueva novedad
      </NuxtLink>
    </div>

    <p v-if="error" class="note" style="color: var(--ladrillo-text)">{{ error }}</p>

    <div class="chips">
      <button type="button" class="chip" :class="{ 'is-active': filtroEstado === 'todas' }" @click="filtroEstado = 'todas'">Todas</button>
      <button type="button" class="chip" :class="{ 'is-active': filtroEstado === 'pendiente' }" @click="filtroEstado = 'pendiente'">Pendientes</button>
      <button type="button" class="chip" :class="{ 'is-active': filtroEstado === 'aprobada' }" @click="filtroEstado = 'aprobada'">Aprobadas</button>
      <button type="button" class="chip" :class="{ 'is-active': filtroEstado === 'rechazada' }" @click="filtroEstado = 'rechazada'">Rechazadas</button>
    </div>

    <UiTabla
      variante="ficha"
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
      <template #celda-tipo="{ fila }"><span class="badge badge--gris">{{ fila.tipo }}</span></template>
      <template #celda-monto="{ fila }">$ {{ Number(fila.monto).toLocaleString('es-CO') }}</template>
      <template #celda-descripcion="{ fila }">{{ fila.descripcion }}</template>
      <template #celda-fechaEfectiva="{ fila }">{{ fila.fecha_efectiva }}</template>
      <template #celda-estado="{ fila }">
        <span
          class="badge"
          :class="fila.estado === 'aprobada' ? 'badge--sello' : fila.estado === 'rechazada' ? 'badge--ladrillo' : 'badge--oro'"
        >
          {{ fila.estado }}
        </span>
      </template>
      <template #celda-acciones="{ fila }">
        <div v-if="fila.estado === 'pendiente'" class="row-actions" style="align-items: center">
          <input
            v-model="motivoRechazo[fila.id]"
            type="text"
            placeholder="Motivo de rechazo"
            style="width: 130px; font-size: 12px; padding: 5px 8px"
          >
          <button type="button" class="icon-btn-sm approve" :disabled="procesando === fila.id" @click="aprobar(fila.id)">✓</button>
          <button type="button" class="icon-btn-sm reject" :disabled="procesando === fila.id" @click="rechazar(fila.id)">✕</button>
        </div>
      </template>
    </UiTabla>
  </div>
</template>
