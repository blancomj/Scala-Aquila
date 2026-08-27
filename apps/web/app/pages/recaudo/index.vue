<script setup lang="ts">
// Módulo de recaudo (RC-5) — listado tenant-wide de pagos con su recibo de
// caja, filtros por fecha/inmueble/forma de pago, totales por forma de
// pago, y las acciones Ver recibo / Reenviar / Anular.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:create' })

const tenantStore = useTenantStore()
const recaudoStore = useRecaudoStore()
const cuentaStore = useCuentaCorrienteStore()
const toast = useToast()

const desde = ref('')
const hasta = ref('')
const inmuebleId = ref<string | null>(null)
const formaPagoCodigo = ref<string | null>(null)

const opcionesInmueble = computed(() =>
  cuentaStore.inmuebles.map((i) => ({ valor: i.id, etiqueta: i.codigo })),
)
const opcionesFormaPago = computed(() => [
  { value: null, label: 'Todas' },
  ...cuentaStore.formasPago.map((f) => ({ value: f.codigo, label: f.nombre })),
])

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await recaudoStore.cargarRecaudo(tenantId, {
    desde: desde.value || undefined,
    hasta: hasta.value || undefined,
    inmuebleId: inmuebleId.value ?? undefined,
    formaPagoCodigo: formaPagoCodigo.value ?? undefined,
  })
}

await useAsyncData('recaudo-base', async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return null
  await Promise.all([
    cuentaStore.cargarInmuebles(tenantId),
    cuentaStore.cargarFormasPago(tenantId),
  ])
  await cargar()
  return null
})

// Solo pagos reales (no reversas) cuentan en los totales — una reversa ya
// está representada restando implícitamente cuando se lee "recaudo neto",
// pero mostrarla como fila separada en la tabla es lo honesto (ver abajo).
const pagosReales = computed(() => recaudoStore.pagos.filter((p) => !p.es_reversa))

const totalGeneral = computed(() => pagosReales.value.reduce((acc, p) => acc + p.monto, 0))
const totalesPorForma = computed(() => {
  const mapa = new Map<string, number>()
  for (const p of pagosReales.value) {
    const clave = p.forma_pago_nombre ?? 'Sin forma de pago'
    mapa.set(clave, (mapa.get(clave) ?? 0) + p.monto)
  }
  return [...mapa.entries()].sort((a, b) => b[1] - a[1])
})

function irARecibo(reciboId: string): void {
  navigateTo(`/recibo-caja/${reciboId}`, { open: { target: '_blank' } })
}

const reenviando = ref<string | null>(null)
async function reenviar(reciboId: string): Promise<void> {
  reenviando.value = reciboId
  try {
    const resultado = await recaudoStore.reenviarRecibo(reciboId)
    toast.add({
      title: resultado.enviados.length > 0 ? `Reenviado a ${resultado.enviados.length} destinatario(s).` : 'Sin destinatarios con correo — copia el enlace desde el recibo.',
      color: resultado.enviados.length > 0 ? 'success' : 'warning',
    })
  } catch (excepcion) {
    toast.add({ title: mensajeError(excepcion, 'No se pudo reenviar el recibo.'), color: 'error' })
  } finally {
    reenviando.value = null
  }
}

// ── anular ───────────────────────────────────────────────────────────
const modalAnularAbierto = ref(false)
const pagoAnulando = ref<(typeof recaudoStore.pagos)[number] | null>(null)
const motivoAnulacion = ref('')
const anulando = ref(false)
const errorAnulacion = ref<string | null>(null)

function abrirAnular(pago: (typeof recaudoStore.pagos)[number]): void {
  pagoAnulando.value = pago
  motivoAnulacion.value = ''
  errorAnulacion.value = null
  modalAnularAbierto.value = true
}

async function confirmarAnular(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !pagoAnulando.value || !motivoAnulacion.value.trim()) return
  errorAnulacion.value = null
  anulando.value = true
  try {
    await cuentaStore.anularPago({
      pagoId: pagoAnulando.value.id,
      motivo: motivoAnulacion.value.trim(),
      tenantId,
      inmuebleId: pagoAnulando.value.inmueble_id,
    })
    modalAnularAbierto.value = false
    toast.add({ title: 'Pago anulado.', color: 'success' })
    await cargar()
  } catch (excepcion) {
    errorAnulacion.value = mensajeError(excepcion, 'No se pudo anular el pago.')
  } finally {
    anulando.value = false
  }
}

// ── registrar pago ──────────────────────────────────────────────────
// Único punto de registro de toda la app (2026-08-27) — antes existía
// también en /estado-cuenta/pagos.vue (retirada) y en la ficha del
// inmueble (que sigue teniendo su propio modal, con inmuebleId fijo).
const modalPagoAbierto = ref(false)

async function alRegistrarPago(): Promise<void> {
  modalPagoAbierto.value = false
  toast.add({ title: 'Pago registrado.', color: 'success' })
  await cargar()
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <h1 class="text-xl font-semibold mb-1">Recaudo</h1>
        <p class="text-sm text-neutral-500 max-w-2xl">
          Pagos registrados en toda la copropiedad, con su recibo de caja. Una anulación queda
          como una reversa (nunca se borra) e inserta una fila propia con monto negativo.
        </p>
      </div>
      <UButton icon="i-lucide-plus" @click="modalPagoAbierto = true">Registrar pago</UButton>
    </div>

    <div class="flex flex-wrap items-end gap-4">
      <UFormField label="Desde" name="desde">
        <UInput v-model="desde" type="date" class="w-40" @change="cargar" />
      </UFormField>
      <UFormField label="Hasta" name="hasta">
        <UInput v-model="hasta" type="date" class="w-40" @change="cargar" />
      </UFormField>
      <UFormField label="Inmueble" name="inmueble" class="w-52">
        <UiSelectorBuscable
          :model-value="inmuebleId"
          :opciones="opcionesInmueble"
          placeholder="Todos"
          @update:model-value="(v) => { inmuebleId = v as string | null; cargar() }"
        />
      </UFormField>
      <UFormField label="Forma de pago" name="forma_pago" class="w-48">
        <USelect
          :model-value="formaPagoCodigo"
          :items="opcionesFormaPago"
          @update:model-value="(v) => { formaPagoCodigo = v as string | null; cargar() }"
        />
      </UFormField>
    </div>

    <div class="stat-row">
      <div class="stat">
        <p class="stat-label">Total recaudado</p>
        <p class="stat-value big">{{ formatoMoneda(totalGeneral) }}</p>
      </div>
      <div v-for="[nombre, monto] in totalesPorForma" :key="nombre" class="stat">
        <p class="stat-label">{{ nombre }}</p>
        <p class="stat-value">{{ formatoMoneda(monto) }}</p>
      </div>
    </div>

    <UiTabla
      :columnas="[
        { clave: 'fecha_pago', etiqueta: 'Fecha', claseCelda: 'mono' },
        { clave: 'inmueble_codigo', etiqueta: 'Inmueble' },
        { clave: 'monto', etiqueta: 'Monto', alinear: 'derecha', claseCelda: 'mono' },
        { clave: 'forma_pago_nombre', etiqueta: 'Forma de pago' },
        { clave: 'recibo_folio', etiqueta: 'Recibo' },
        { clave: 'estado', etiqueta: 'Estado' },
        { clave: 'acciones', etiqueta: '' },
      ]"
      :filas="recaudoStore.pagos"
      :clave-fila="(p) => p.id"
      :cargando="recaudoStore.loading"
      vacio="Sin pagos en el rango seleccionado."
    >
      <template #celda-monto="{ fila }">
        <span :class="{ 'text-error-600': fila.es_reversa }">{{ formatoMoneda(fila.monto) }}</span>
      </template>
      <template #celda-recibo_folio="{ fila }">
        <span v-if="fila.recibo_folio" class="font-mono text-xs">{{ fila.recibo_folio }}</span>
        <span v-else class="text-neutral-400 text-xs">—</span>
      </template>
      <template #celda-estado="{ fila }">
        <UBadge v-if="fila.es_reversa" color="error" variant="subtle" size="sm">Reversa</UBadge>
        <UBadge v-else-if="fila.esta_anulado" color="warning" variant="subtle" size="sm">Anulado</UBadge>
        <UBadge v-else color="success" variant="subtle" size="sm">Vigente</UBadge>
      </template>
      <template #celda-acciones="{ fila }">
        <div class="flex justify-end gap-1">
          <UButton
            v-if="fila.recibo_id"
            size="xs"
            variant="ghost"
            icon="i-lucide-file-text"
            title="Ver recibo"
            @click="irARecibo(fila.recibo_id)"
          />
          <UButton
            v-if="fila.recibo_id"
            size="xs"
            variant="ghost"
            icon="i-lucide-send"
            title="Reenviar recibo por correo"
            :loading="reenviando === fila.recibo_id"
            @click="reenviar(fila.recibo_id)"
          />
          <UButton
            v-if="!fila.es_reversa && !fila.esta_anulado"
            size="xs"
            variant="ghost"
            color="error"
            icon="i-lucide-ban"
            title="Anular pago"
            @click="abrirAnular(fila)"
          />
        </div>
      </template>
    </UiTabla>

    <UModal
      :open="modalAnularAbierto"
      title="Anular pago"
      @update:open="(abierto) => { if (!abierto) modalAnularAbierto = false }"
    >
      <template #body>
        <div class="space-y-4 text-sm">
          <p v-if="pagoAnulando" class="text-neutral-600">
            Vas a anular el pago de <strong>{{ formatoMoneda(pagoAnulando.monto) }}</strong> del
            inmueble <strong>{{ pagoAnulando.inmueble_codigo }}</strong> ({{ pagoAnulando.fecha_pago }}).
            Se registrará como una reversa — el pago original no se borra.
          </p>
          <UFormField label="Motivo" name="motivo" required>
            <UTextarea v-model="motivoAnulacion" :rows="2" autoresize placeholder="ej. Cheque devuelto por el banco" class="w-full" />
          </UFormField>
          <UAlert v-if="errorAnulacion" color="error" variant="soft" :title="errorAnulacion" />
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="modalAnularAbierto = false">Cancelar</UButton>
          <UButton color="error" :loading="anulando" :disabled="!motivoAnulacion.trim()" @click="confirmarAnular">
            Anular pago
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal
      :open="modalPagoAbierto"
      title="Registrar pago"
      @update:open="(abierto) => { if (!abierto) modalPagoAbierto = false }"
    >
      <template #body>
        <PagosRegistrarPagoForm @registrado="alRegistrarPago" />
      </template>
    </UModal>
  </div>
</template>

<style scoped>
.stat-row {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
}
.stat {
  min-width: 140px;
}
.stat-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-neutral-400);
  margin-bottom: 2px;
}
.stat-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-neutral-800);
}
.stat-value.big {
  font-size: 22px;
  color: var(--color-brand-700);
}
</style>
