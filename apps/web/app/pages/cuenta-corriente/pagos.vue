<script setup lang="ts">
// Motor de cuenta corriente (E5/E6) — registrar un pago (imputación
// automática vía registrar-pago) y disparar el cálculo de interés de mora
// (calcular-intereses). Ambas son escrituras privilegiadas (service_role),
// agent-only.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:create' })

const tenantStore = useTenantStore()
const cuentaStore = useCuentaCorrienteStore()

const inmuebleSeleccionadoId = ref<string | null>(null)

const etiquetaCategoria: Record<string, string> = {
  capital: 'Capital',
  interes: 'Interés',
  otro: 'Otro',
}
const cargoPorId = computed(() => new Map(cuentaStore.cargosAbiertos.map((c) => [c.id, c])))

await useAsyncData('cuenta-corriente-pagos-base', async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return null
  await cuentaStore.cargarInmuebles(tenantId)
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
    const tenantId = tenantStore.activeTenant?.id
    if (!id || !tenantId) return
    await cuentaStore.cargarCargosAbiertos(tenantId, id)
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

// ── registrar pago ────────────────────────────────────────────────────
const monto = ref<number | null>(null)
const fechaPago = ref(new Date().toISOString().slice(0, 10))
const referencia = ref('')
const registrando = ref(false)
const errorPago = ref<string | null>(null)
const resultadoPago = ref<Awaited<ReturnType<typeof cuentaStore.registrarPago>> | null>(null)

async function registrarPago(): Promise<void> {
  errorPago.value = null
  resultadoPago.value = null
  const tenantId = tenantStore.activeTenant?.id
  const inmuebleId = inmuebleSeleccionadoId.value
  if (!tenantId || !inmuebleId || monto.value === null) return

  registrando.value = true
  try {
    resultadoPago.value = await cuentaStore.registrarPago({
      inmuebleId,
      tenantId,
      monto: monto.value,
      fechaPago: fechaPago.value,
      referencia: referencia.value || undefined,
    })
    monto.value = null
    referencia.value = ''
  } catch (excepcion) {
    errorPago.value =
      excepcion instanceof Error ? excepcion.message : 'No se pudo registrar el pago.'
  } finally {
    registrando.value = false
  }
}

// ── calcular intereses ────────────────────────────────────────────────
const fechaReferencia = ref(new Date().toISOString().slice(0, 10))
const calculando = ref(false)
const errorIntereses = ref<string | null>(null)
const resultadoIntereses = ref<Awaited<ReturnType<typeof cuentaStore.calcularIntereses>> | null>(
  null,
)
const inmueblePorId = computed(() => new Map(cuentaStore.inmuebles.map((i) => [i.id, i.codigo])))

async function calcularIntereses(): Promise<void> {
  errorIntereses.value = null
  resultadoIntereses.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return

  calculando.value = true
  try {
    resultadoIntereses.value = await cuentaStore.calcularIntereses({
      tenantId,
      fechaReferencia: fechaReferencia.value,
    })
    if (inmuebleSeleccionadoId.value) {
      await cuentaStore.cargarCargosAbiertos(tenantId, inmuebleSeleccionadoId.value)
    }
  } catch (excepcion) {
    errorIntereses.value =
      excepcion instanceof Error ? excepcion.message : 'No se pudo calcular el interés de mora.'
  } finally {
    calculando.value = false
  }
}
</script>

<template>
  <div class="space-y-8">
    <div>
      <h1 class="text-xl font-semibold mb-2">Pagos e intereses de mora</h1>
      <p class="text-sm text-gray-500">
        Registrar un pago aplica la estrategia de imputación configurada en la política vigente
        (deuda más antigua o periodo actual). Calcular intereses es idempotente entre corridas.
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

      <div>
        <h2 class="text-lg font-semibold mb-2">Registrar pago</h2>
        <form class="space-y-4 max-w-sm" @submit.prevent="registrarPago">
          <UFormField label="Monto" name="monto">
            <UInput
              v-model.number="monto"
              type="number"
              min="0.01"
              step="0.01"
              required
              class="w-full"
            />
          </UFormField>
          <UFormField label="Fecha de pago" name="fecha_pago">
            <UInput v-model="fechaPago" type="date" required class="w-full" />
          </UFormField>
          <UFormField label="Referencia" name="referencia">
            <UInput v-model="referencia" class="w-full" />
          </UFormField>
          <UAlert v-if="errorPago" color="error" variant="soft" :title="errorPago" />
          <UButton type="submit" :loading="registrando">Registrar</UButton>
        </form>

        <div v-if="resultadoPago" class="mt-4 text-sm space-y-2">
          <p>
            Aplicado: <span class="font-medium">{{ formatoMoneda(resultadoPago.aplicado) }}</span>
            <span v-if="Number(resultadoPago.no_aplicado) > 0" class="text-amber-500">
              — crédito a favor: {{ formatoMoneda(resultadoPago.no_aplicado) }}
            </span>
          </p>
          <table class="w-full">
            <thead>
              <tr class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-800">
                <th class="py-1 font-medium">Cargo</th>
                <th class="py-1 font-medium">Monto aplicado</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="aplicacion in resultadoPago.aplicaciones"
                :key="aplicacion.cargo_id"
                class="border-b border-gray-100 dark:border-gray-900"
              >
                <td class="py-1.5 text-gray-500">
                  {{
                    cargoPorId.get(aplicacion.cargo_id)?.categoria
                      ? etiquetaCategoria[cargoPorId.get(aplicacion.cargo_id)!.categoria!]
                      : aplicacion.cargo_id
                  }}
                </td>
                <td class="py-1.5">{{ formatoMoneda(aplicacion.monto) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 class="text-lg font-semibold mb-2">Calcular intereses de mora</h2>
        <form class="flex items-end gap-4" @submit.prevent="calcularIntereses">
          <UFormField label="Fecha de referencia" name="fecha_referencia">
            <UInput v-model="fechaReferencia" type="date" required class="w-48" />
          </UFormField>
          <UButton type="submit" :loading="calculando">Calcular</UButton>
        </form>
        <UAlert
          v-if="errorIntereses"
          color="error"
          variant="soft"
          :title="errorIntereses"
          class="mt-2"
        />

        <template v-if="resultadoIntereses">
          <p v-if="resultadoIntereses.length === 0" class="text-gray-500 text-sm mt-2">
            Ningún inmueble generó interés de mora para esta fecha.
          </p>
          <table v-else class="w-full text-sm mt-2">
            <thead>
              <tr class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-800">
                <th class="py-1 font-medium">Inmueble</th>
                <th class="py-1 font-medium">Monto generado</th>
                <th class="py-1 font-medium">Tope aplicado</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="fila in resultadoIntereses"
                :key="fila.inmueble_id"
                class="border-b border-gray-100 dark:border-gray-900"
              >
                <td class="py-1.5">
                  {{ inmueblePorId.get(fila.inmueble_id) ?? fila.inmueble_id }}
                </td>
                <td class="py-1.5">{{ formatoMoneda(fila.monto_generado) }}</td>
                <td class="py-1.5 text-gray-500">{{ fila.tope_aplicado ? 'Sí' : 'No' }}</td>
              </tr>
            </tbody>
          </table>
        </template>
      </div>
    </template>
  </div>
</template>
