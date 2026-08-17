<script setup lang="ts">
// Tab Novedades activas — filtro por estado, aprobar/rechazar
// (PROMPT_FICHA_INMUEBLE.md §1.1 I6). Reutiliza cuentaCorriente.ts
// (cargarNovedades ahora acepta inmuebleId?, crearNovedad/aprobarNovedad/
// rechazarNovedad ya existían) — sin invocar la Edge Function por su cuenta.
import type { Database } from '@aquila/shared'

type NovedadTipo = Database['public']['Enums']['novedad_tipo_t']
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

const TIPOS: readonly NovedadTipo[] = ['CHARGE', 'DISCOUNT', 'ADJUSTMENT', 'REFUND', 'CREDIT', 'DEBIT']

const mostrarForm = ref(false)
const tipo = ref<NovedadTipo>('CHARGE')
const montoNovedad = ref<number | null>(null)
const descripcion = ref('')
const fechaEfectiva = ref(new Date().toISOString().slice(0, 10))
const motivoRechazo = ref<Record<string, string>>({})
const procesando = ref<string | null>(null)
const error = ref<string | null>(null)

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await cuentaStore.cargarNovedades(tenantId, props.inmuebleId)
}

async function crear(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !montoNovedad.value || !descripcion.value.trim()) return
  error.value = null
  try {
    await cuentaStore.crearNovedad({
      tenantId,
      inmuebleId: props.inmuebleId,
      tipo: tipo.value,
      monto: montoNovedad.value,
      descripcion: descripcion.value.trim(),
      fechaEfectiva: fechaEfectiva.value,
    })
    mostrarForm.value = false
    montoNovedad.value = null
    descripcion.value = ''
  } catch (excepcion) {
    error.value = excepcion instanceof Error ? excepcion.message : 'No se pudo crear la novedad.'
  }
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
      <button type="button" class="btn btn--primary" style="font-size: 12.5px; padding: 7px 14px" @click="mostrarForm = true">
        Nueva novedad
      </button>
    </div>

    <UiDrawer
      :abierto="mostrarForm"
      titulo="Nueva novedad"
      subtitulo="Cargo, descuento o ajuste sobre este inmueble."
      @cerrar="mostrarForm = false"
    >
      <div class="form-grid">
        <div class="field">
          <label for="nov-tipo">Tipo</label>
          <select id="nov-tipo" v-model="tipo">
            <option v-for="t in TIPOS" :key="t" :value="t">{{ t }}</option>
          </select>
        </div>
        <div class="field">
          <label for="nov-monto">Monto</label>
          <input id="nov-monto" v-model.number="montoNovedad" type="number" step="0.01" placeholder="45000">
        </div>
        <div class="field span-2">
          <label for="nov-desc">Descripción</label>
          <input id="nov-desc" v-model="descripcion" type="text" placeholder="Corrección por cobro doble de parqueadero">
        </div>
        <div class="field">
          <label for="nov-fecha">Fecha efectiva</label>
          <input id="nov-fecha" v-model="fechaEfectiva" type="date">
        </div>
      </div>
      <p v-if="error" class="note" style="color: var(--ladrillo-text)">{{ error }}</p>
      <template #foot>
        <button type="button" class="btn btn--ghost" @click="mostrarForm = false">Cancelar</button>
        <button type="button" class="btn btn--primary" @click="crear">Crear novedad</button>
      </template>
    </UiDrawer>

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
