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
    <table v-if="cuentaStore.cargosAbiertos.length > 0">
      <thead><tr><th>Categoría</th><th class="num">Pendiente</th><th>Desde</th></tr></thead>
      <tbody>
        <tr v-for="c in cuentaStore.cargosAbiertos" :key="c.id ?? undefined">
          <td><span class="badge" :class="c.categoria === 'interes' ? 'badge--ladrillo' : 'badge--gris'">{{ c.categoria }}</span></td>
          <td class="num mono">$ {{ Number(c.monto_pendiente).toLocaleString('es-CO') }}</td>
          <td class="mono">{{ c.created_at?.slice(0, 10) }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else class="empty-state">Sin cargos pendientes.</p>

    <div class="section-title"><h2>Pagos recientes</h2></div>
    <table v-if="cuentaStore.pagos.length > 0">
      <thead><tr><th>Fecha</th><th class="num">Monto</th><th>Referencia</th></tr></thead>
      <tbody>
        <tr v-for="p in cuentaStore.pagos" :key="p.id">
          <td class="mono">{{ p.fecha_pago }}</td>
          <td class="num mono">$ {{ Number(p.monto).toLocaleString('es-CO') }}</td>
          <td class="mono">{{ p.referencia ?? '—' }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else class="empty-state">Sin pagos registrados.</p>

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
