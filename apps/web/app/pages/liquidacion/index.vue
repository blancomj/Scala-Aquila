<script setup lang="ts">
// F6 — el administrador liquida un periodo desde la UI (PLAN §5). Lista los
// periodos del tenant, marca cuáles ya tienen liquidación, y dispara
// liquidar-periodo para los que no. Creación de periodos: PLAN_DATOS_REALES.md
// §3.1.5 — antes solo existían los que sembró un seed/test. No incluye un
// detalle línea por línea de la liquidación — el resumen (total + conteo)
// alcanza para este primer corte.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:create' })

const tenantStore = useTenantStore()
const liquidacionStore = useLiquidacionStore()

const nuevoAnio = ref<number | null>(null)
const nuevoMes = ref<number | null>(null)
const nuevaFechaVencimiento = ref('')
const creandoPeriodo = ref(false)
const errorPeriodo = ref<string | null>(null)

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

async function crearPeriodo(): Promise<void> {
  errorPeriodo.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || nuevoAnio.value === null || nuevoMes.value === null) return

  creandoPeriodo.value = true
  try {
    await liquidacionStore.crearPeriodo({
      tenantId,
      anio: nuevoAnio.value,
      mes: nuevoMes.value,
      fechaVencimiento: nuevaFechaVencimiento.value || undefined,
    })
    nuevoAnio.value = null
    nuevoMes.value = null
    nuevaFechaVencimiento.value = ''
  } catch (excepcion) {
    errorPeriodo.value = mensajeError(excepcion, 'No se pudo crear el periodo.')
  } finally {
    creandoPeriodo.value = false
  }
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
    error.value = mensajeError(excepcion, 'No se pudo liquidar el periodo.')
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
    <UiTabla
      v-else
      :columnas="[
        { clave: 'periodo', etiqueta: 'Periodo' },
        { clave: 'estado', etiqueta: 'Estado' },
        { clave: 'liquidacion', etiqueta: 'Liquidación' },
        { clave: 'acciones', etiqueta: '' },
      ]"
      :filas="liquidacionStore.periodos"
      :clave-fila="(periodo) => periodo.id"
    >
      <template #celda-periodo="{ fila }">{{ fila.anio }}-{{ String(fila.mes).padStart(2, '0') }}</template>
      <template #celda-estado="{ fila }"><span class="text-gray-500">{{ fila.estado }}</span></template>
      <template #celda-liquidacion="{ fila }">
        <span class="text-gray-500">
          <template v-if="liquidacionPorPeriodo.get(fila.id)">
            {{ formatoMoneda(liquidacionPorPeriodo.get(fila.id)!.tenant_total) }}
          </template>
          <template v-else>—</template>
        </span>
      </template>
      <template #celda-acciones="{ fila }">
        <UButton
          v-if="!liquidacionPorPeriodo.get(fila.id)"
          size="xs"
          variant="soft"
          :loading="liquidandoId === fila.id"
          @click="liquidar(fila.id)"
        >
          Liquidar
        </UButton>
      </template>
    </UiTabla>

    <div>
      <h2 class="text-lg font-semibold mb-2">Crear periodo</h2>
      <form class="space-y-4 max-w-sm" @submit.prevent="crearPeriodo">
        <UFormField label="Año" name="anio">
          <UInput v-model.number="nuevoAnio" type="number" min="2000" class="w-full" />
        </UFormField>

        <UFormField label="Mes" name="mes">
          <select
            v-model.number="nuevoMes"
            class="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5"
          >
            <option :value="null" disabled>— Elegir —</option>
            <option v-for="m in 12" :key="m" :value="m">{{ m }}</option>
          </select>
        </UFormField>

        <UFormField label="Fecha de vencimiento (opcional)" name="fecha_vencimiento">
          <UInput v-model="nuevaFechaVencimiento" type="date" class="w-full" />
        </UFormField>

        <UAlert v-if="errorPeriodo" color="error" variant="soft" :title="errorPeriodo" />

        <UButton type="submit" :loading="creandoPeriodo">Crear periodo</UButton>
      </form>
    </div>
  </div>
</template>
