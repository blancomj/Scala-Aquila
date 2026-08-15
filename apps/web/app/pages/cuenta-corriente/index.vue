<script setup lang="ts">
// Motor de cuenta corriente (E1-E8) — estado de cuenta por inmueble.
// Puramente de lectura (v_cargo_saldo + pagos, ambas RLS agent+auditor) —
// por eso el permiso de la página es 'data:read' y no 'data:create' como el
// resto de F6: un auditor debe poder ver el saldo sin poder escribir nada.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const tenantStore = useTenantStore()
const cuentaStore = useCuentaCorrienteStore()
const conceptoStore = useConceptoStore()
const liquidacionStore = useLiquidacionStore()

const error = ref<string | null>(null)
const inmuebleSeleccionadoId = ref<string | null>(null)

const conceptoPorId = computed(() => new Map(conceptoStore.conceptos.map((c) => [c.id, c.codigo])))
const periodoPorId = computed(
  () =>
    new Map(
      liquidacionStore.periodos.map((p) => [p.id, `${p.anio}-${String(p.mes).padStart(2, '0')}`]),
    ),
)

const etiquetaCategoria: Record<string, string> = {
  capital: 'Capital',
  interes: 'Interés',
  otro: 'Otro',
}

const totalPendiente = computed(() =>
  cuentaStore.cargosAbiertos.reduce((acc, c) => acc + Number(c.monto_pendiente ?? 0), 0),
)

await useAsyncData('cuenta-corriente-base', async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return null
  await Promise.all([
    cuentaStore.cargarInmuebles(tenantId),
    conceptoStore.cargarConceptos(tenantId),
    liquidacionStore.cargarPeriodos(tenantId),
  ])
  return null
})

watch(
  () => cuentaStore.inmuebles,
  (lista) => {
    if (!inmuebleSeleccionadoId.value && lista.length > 0) {
      inmuebleSeleccionadoId.value = lista[0]!.id
    }
  },
  { immediate: true },
)

watch(
  inmuebleSeleccionadoId,
  async (id) => {
    error.value = null
    const tenantId = tenantStore.activeTenant?.id
    if (!id || !tenantId) return
    try {
      await Promise.all([
        cuentaStore.cargarCargosAbiertos(tenantId, id),
        cuentaStore.cargarPagos(tenantId, id),
      ])
    } catch (excepcion) {
      error.value = excepcion instanceof Error ? excepcion.message : 'No se pudo cargar la cuenta.'
    }
  },
  { immediate: true },
)

function formatoMoneda(valor: string | number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(valor))
}

function origenLegible(cargo: { concepto_id: string | null; categoria: string | null }): string {
  if (cargo.concepto_id) return conceptoPorId.value.get(cargo.concepto_id) ?? cargo.concepto_id
  return cargo.categoria ? (etiquetaCategoria[cargo.categoria] ?? cargo.categoria) : '—'
}
</script>

<template>
  <div class="space-y-8">
    <div>
      <h1 class="text-xl font-semibold mb-2">Cuenta corriente</h1>
      <p class="text-sm text-gray-500">
        Estado de cuenta por inmueble — cargos pendientes e historial de pagos del ledger
        (`cargos`/`pagos`/`pago_aplicaciones`).
      </p>
    </div>

    <p v-if="cuentaStore.inmuebles.length === 0" class="text-gray-500 text-sm">
      Esta copropiedad todavía no tiene inmuebles registrados.
    </p>

    <template v-else>
      <UFormField label="Inmueble" name="inmueble">
        <select
          v-model="inmuebleSeleccionadoId"
          class="rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5 text-sm"
        >
          <option v-for="i in cuentaStore.inmuebles" :key="i.id" :value="i.id">
            {{ i.codigo }}
          </option>
        </select>
      </UFormField>

      <UAlert v-if="error" color="error" variant="soft" :title="error" />

      <div>
        <div class="flex items-center justify-between mb-2">
          <h2 class="text-lg font-semibold">Cargos pendientes</h2>
          <p class="text-sm text-gray-500">Total: {{ formatoMoneda(totalPendiente) }}</p>
        </div>
        <p v-if="cuentaStore.cargosAbiertos.length === 0" class="text-gray-500 text-sm">
          Sin saldo pendiente.
        </p>
        <table v-else class="w-full text-sm">
          <thead>
            <tr class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-800">
              <th class="py-1 font-medium">Categoría</th>
              <th class="py-1 font-medium">Concepto / origen</th>
              <th class="py-1 font-medium">Periodo</th>
              <th class="py-1 font-medium">Pendiente</th>
              <th class="py-1 font-medium">Creado</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="cargo in cuentaStore.cargosAbiertos"
              :key="cargo.id ?? undefined"
              class="border-b border-gray-100 dark:border-gray-900"
            >
              <td class="py-1.5">
                {{
                  cargo.categoria ? (etiquetaCategoria[cargo.categoria] ?? cargo.categoria) : '—'
                }}
              </td>
              <td class="py-1.5 text-gray-500">{{ origenLegible(cargo) }}</td>
              <td class="py-1.5 text-gray-500">
                {{ cargo.periodo_id ? (periodoPorId.get(cargo.periodo_id) ?? '—') : '—' }}
              </td>
              <td class="py-1.5">{{ formatoMoneda(cargo.monto_pendiente ?? 0) }}</td>
              <td class="py-1.5 text-gray-500">
                {{
                  cargo.created_at ? new Date(cargo.created_at).toLocaleDateString('es-CO') : '—'
                }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div>
        <h2 class="text-lg font-semibold mb-2">Pagos recientes</h2>
        <p v-if="cuentaStore.pagos.length === 0" class="text-gray-500 text-sm">
          Sin pagos registrados todavía.
        </p>
        <table v-else class="w-full text-sm">
          <thead>
            <tr class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-800">
              <th class="py-1 font-medium">Fecha</th>
              <th class="py-1 font-medium">Monto</th>
              <th class="py-1 font-medium">Referencia</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="pago in cuentaStore.pagos"
              :key="pago.id"
              class="border-b border-gray-100 dark:border-gray-900"
            >
              <td class="py-1.5">{{ pago.fecha_pago }}</td>
              <td class="py-1.5">{{ formatoMoneda(pago.monto) }}</td>
              <td class="py-1.5 text-gray-500">{{ pago.referencia ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
