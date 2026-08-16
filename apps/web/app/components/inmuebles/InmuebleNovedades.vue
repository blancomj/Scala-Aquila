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
      <button type="button" class="btn btn--primary" style="font-size: 12.5px; padding: 7px 14px" @click="mostrarForm = !mostrarForm">
        Nueva novedad
      </button>
    </div>

    <div v-if="mostrarForm" class="form-grid" style="margin-bottom: 1.5rem">
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
      <div class="field" style="align-self: flex-end">
        <button type="button" class="btn btn--primary" @click="crear">Crear novedad</button>
      </div>
    </div>
    <p v-if="error" class="note" style="color: var(--ladrillo-text)">{{ error }}</p>

    <div class="chips">
      <button type="button" class="chip" :class="{ 'is-active': filtroEstado === 'todas' }" @click="filtroEstado = 'todas'">Todas</button>
      <button type="button" class="chip" :class="{ 'is-active': filtroEstado === 'pendiente' }" @click="filtroEstado = 'pendiente'">Pendientes</button>
      <button type="button" class="chip" :class="{ 'is-active': filtroEstado === 'aprobada' }" @click="filtroEstado = 'aprobada'">Aprobadas</button>
      <button type="button" class="chip" :class="{ 'is-active': filtroEstado === 'rechazada' }" @click="filtroEstado = 'rechazada'">Rechazadas</button>
    </div>

    <table v-if="novedadesFiltradas.length > 0">
      <thead>
        <tr><th>Tipo</th><th class="num">Monto</th><th>Descripción</th><th>Fecha efectiva</th><th>Estado</th><th /></tr>
      </thead>
      <tbody>
        <tr v-for="n in novedadesFiltradas" :key="n.id">
          <td><span class="badge badge--gris">{{ n.tipo }}</span></td>
          <td class="num mono">$ {{ Number(n.monto).toLocaleString('es-CO') }}</td>
          <td>{{ n.descripcion }}</td>
          <td class="mono">{{ n.fecha_efectiva }}</td>
          <td>
            <span
              class="badge"
              :class="n.estado === 'aprobada' ? 'badge--sello' : n.estado === 'rechazada' ? 'badge--ladrillo' : 'badge--oro'"
            >
              {{ n.estado }}
            </span>
          </td>
          <td>
            <div v-if="n.estado === 'pendiente'" class="row-actions" style="align-items: center">
              <input
                v-model="motivoRechazo[n.id]"
                type="text"
                placeholder="Motivo de rechazo"
                style="width: 130px; font-size: 12px; padding: 5px 8px"
              >
              <button type="button" class="icon-btn-sm approve" :disabled="procesando === n.id" @click="aprobar(n.id)">✓</button>
              <button type="button" class="icon-btn-sm reject" :disabled="procesando === n.id" @click="rechazar(n.id)">✕</button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else class="empty-state">Sin novedades para este filtro.</p>
  </div>
</template>
