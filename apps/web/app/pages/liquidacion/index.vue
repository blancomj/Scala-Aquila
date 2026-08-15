<script setup lang="ts">
// F6 — el administrador liquida un periodo desde la UI (PLAN §5). Lista los
// periodos del tenant, marca cuáles ya tienen liquidación, y dispara
// liquidar-periodo para los que no. No incluye creación de periodos (fuera
// de alcance; hoy solo existen los que sembró un seed/test) ni un detalle
// línea por línea de la liquidación — el resumen (total + conteo) alcanza
// para este primer corte.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:create' })

const tenantStore = useTenantStore()
const liquidacionStore = useLiquidacionStore()

const liquidandoId = ref<string | null>(null)
const error = ref<string | null>(null)
const ultimoResultado = ref<{
  periodoId: string
  tenantTotal: string
  lineasCount: number
  resultHash: string
} | null>(null)

await useAsyncData('liquidacion-periodos', async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return []
  const [periodos] = await Promise.all([
    liquidacionStore.cargarPeriodos(tenantId),
    liquidacionStore.cargarLiquidaciones(tenantId),
  ])
  return periodos
})

const liquidacionPorPeriodo = computed(() => {
  const mapa = new Map<string, (typeof liquidacionStore.liquidaciones)[number]>()
  for (const liquidacion of liquidacionStore.liquidaciones) {
    mapa.set(liquidacion.periodo_id, liquidacion)
  }
  return mapa
})

function formatoMoneda(valor: string | number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(valor))
}

async function liquidar(periodoId: string): Promise<void> {
  error.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return

  liquidandoId.value = periodoId
  try {
    const resultado = await liquidacionStore.liquidarPeriodo(periodoId, tenantId)
    ultimoResultado.value = {
      periodoId,
      tenantTotal: resultado.tenant_total,
      lineasCount: resultado.lineas.length,
      resultHash: resultado.result_hash,
    }
  } catch (excepcion) {
    error.value = excepcion instanceof Error ? excepcion.message : 'No se pudo liquidar el periodo.'
  } finally {
    liquidandoId.value = null
  }
}
</script>

<template>
  <div class="space-y-8">
    <div>
      <h1 class="text-xl font-semibold mb-2">Liquidación</h1>
      <p class="text-sm text-gray-500">
        Liquidar un periodo calcula y persiste el resultado — no se puede repetir ni deshacer.
      </p>
    </div>

    <UAlert
      v-if="ultimoResultado"
      color="success"
      variant="soft"
      :title="`Periodo liquidado: ${formatoMoneda(ultimoResultado.tenantTotal)} en ${ultimoResultado.lineasCount} líneas`"
      :description="`result_hash: ${ultimoResultado.resultHash}`"
    />
    <UAlert v-if="error" color="error" variant="soft" :title="error" />

    <p v-if="liquidacionStore.periodos.length === 0" class="text-gray-500 text-sm">
      Esta copropiedad todavía no tiene periodos registrados.
    </p>
    <table v-else class="w-full text-sm">
      <thead>
        <tr class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-800">
          <th class="py-1 font-medium">Periodo</th>
          <th class="py-1 font-medium">Estado</th>
          <th class="py-1 font-medium">Liquidación</th>
          <th class="py-1 font-medium" />
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="periodo in liquidacionStore.periodos"
          :key="periodo.id"
          class="border-b border-gray-100 dark:border-gray-900"
        >
          <td class="py-1.5">{{ periodo.anio }}-{{ String(periodo.mes).padStart(2, '0') }}</td>
          <td class="py-1.5 text-gray-500">{{ periodo.estado }}</td>
          <td class="py-1.5 text-gray-500">
            <template v-if="liquidacionPorPeriodo.get(periodo.id)">
              {{ formatoMoneda(liquidacionPorPeriodo.get(periodo.id)!.tenant_total) }}
            </template>
            <template v-else>—</template>
          </td>
          <td class="py-1.5">
            <UButton
              v-if="!liquidacionPorPeriodo.get(periodo.id)"
              size="xs"
              variant="soft"
              :loading="liquidandoId === periodo.id"
              @click="liquidar(periodo.id)"
            >
              Liquidar
            </UButton>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
