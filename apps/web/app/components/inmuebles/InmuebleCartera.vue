<script setup lang="ts">
// Tab Cartera — saldo, cargos pendientes, pagos recientes
// (PROMPT_FICHA_INMUEBLE.md §1.1 I5). Reutiliza cuentaCorriente.ts tal
// cual, sin lógica nueva — solo lectura filtrada por inmueble + el
// formulario de registrar pago que ya existía en cuenta-corriente/pagos.vue.
const props = defineProps<{ inmuebleId: string }>()

const tenantStore = useTenantStore()
const cuentaStore = useCuentaCorrienteStore()

const monto = ref<number | null>(null)
const fechaPago = ref(new Date().toISOString().slice(0, 10))
const referencia = ref('')
const registrando = ref(false)
const error = ref<string | null>(null)

const saldoTotal = computed(() =>
  cuentaStore.cargosAbiertos.reduce((acc, c) => acc + Number(c.monto_pendiente), 0),
)
const saldoCapital = computed(() =>
  cuentaStore.cargosAbiertos
    .filter((c) => c.categoria === 'capital')
    .reduce((acc, c) => acc + Number(c.monto_pendiente), 0),
)
const saldoInteres = computed(() =>
  cuentaStore.cargosAbiertos
    .filter((c) => c.categoria === 'interes')
    .reduce((acc, c) => acc + Number(c.monto_pendiente), 0),
)

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await Promise.all([
    cuentaStore.cargarCargosAbiertos(tenantId, props.inmuebleId),
    cuentaStore.cargarPagos(tenantId, props.inmuebleId),
  ])
}

async function registrarPago(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !monto.value || !fechaPago.value) return
  error.value = null
  registrando.value = true
  try {
    await cuentaStore.registrarPago({
      inmuebleId: props.inmuebleId,
      tenantId,
      monto: monto.value,
      fechaPago: fechaPago.value,
      referencia: referencia.value.trim() || undefined,
    })
    monto.value = null
    referencia.value = ''
  } catch (excepcion) {
    error.value = excepcion instanceof Error ? excepcion.message : 'No se pudo registrar el pago.'
  } finally {
    registrando.value = false
  }
}

watchEffect(cargar)
</script>

<template>
  <div>
    <div class="stat-row">
      <div class="stat">
        <p class="stat-label">Saldo total pendiente</p>
        <p class="stat-value big" :class="{ 'is-alert': saldoTotal > 0 }">$ {{ saldoTotal.toLocaleString('es-CO') }}</p>
      </div>
      <div class="stat">
        <p class="stat-label">Capital</p>
        <p class="stat-value">$ {{ saldoCapital.toLocaleString('es-CO') }}</p>
      </div>
      <div class="stat">
        <p class="stat-label">Interés de mora</p>
        <p class="stat-value">$ {{ saldoInteres.toLocaleString('es-CO') }}</p>
      </div>
    </div>

    <div class="section-title" style="margin-top: 0"><h2>Cargos pendientes</h2></div>
    <UiTabla
      variante="ficha"
      :columnas="[
        { clave: 'categoria', etiqueta: 'Categoría' },
        { clave: 'pendiente', etiqueta: 'Pendiente', alinear: 'derecha', claseCelda: 'mono' },
        { clave: 'desde', etiqueta: 'Desde', claseCelda: 'mono' },
      ]"
      :filas="cuentaStore.cargosAbiertos"
      :clave-fila="(c, i) => c.id ?? i"
      vacio="Sin cargos pendientes."
    >
      <template #celda-categoria="{ fila }">
        <span class="badge" :class="fila.categoria === 'interes' ? 'badge--ladrillo' : 'badge--gris'">{{ fila.categoria }}</span>
      </template>
      <template #celda-pendiente="{ fila }">$ {{ Number(fila.monto_pendiente).toLocaleString('es-CO') }}</template>
      <template #celda-desde="{ fila }">{{ fila.created_at?.slice(0, 10) }}</template>
    </UiTabla>

    <div class="section-title"><h2>Pagos recientes</h2></div>
    <UiTabla
      variante="ficha"
      :columnas="[
        { clave: 'fecha', etiqueta: 'Fecha', claseCelda: 'mono' },
        { clave: 'monto', etiqueta: 'Monto', alinear: 'derecha', claseCelda: 'mono' },
        { clave: 'referencia', etiqueta: 'Referencia', claseCelda: 'mono' },
      ]"
      :filas="cuentaStore.pagos"
      :clave-fila="(p) => p.id"
      vacio="Sin pagos registrados."
    >
      <template #celda-fecha="{ fila }">{{ fila.fecha_pago }}</template>
      <template #celda-monto="{ fila }">$ {{ Number(fila.monto).toLocaleString('es-CO') }}</template>
      <template #celda-referencia="{ fila }">{{ fila.referencia ?? '—' }}</template>
    </UiTabla>

    <div class="section-title"><h2>Registrar pago</h2></div>
    <div class="form-grid">
      <div class="field">
        <label for="pago-monto">Monto</label>
        <input id="pago-monto" v-model.number="monto" type="number" min="0" step="0.01" placeholder="420000">
      </div>
      <div class="field">
        <label for="pago-fecha">Fecha de pago</label>
        <input id="pago-fecha" v-model="fechaPago" type="date">
      </div>
      <div class="field span-2">
        <label for="pago-ref">Referencia (opcional)</label>
        <input id="pago-ref" v-model="referencia" type="text" placeholder="Transferencia · 88213">
      </div>
    </div>
    <p v-if="error" class="note" style="color: var(--ladrillo-text)">{{ error }}</p>
    <button type="button" class="btn btn--primary" style="margin-top: 12px" :disabled="registrando || !monto" @click="registrarPago">
      {{ registrando ? 'Registrando…' : 'Registrar pago' }}
    </button>
  </div>
</template>
