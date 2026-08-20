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
const opcionesInmueble = computed(() =>
  cuentaStore.inmuebles.map((i) => ({ valor: i.id, etiqueta: i.codigo })),
)

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
    errorPago.value = mensajeError(excepcion, 'No se pudo registrar el pago.')
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
    errorIntereses.value = mensajeError(excepcion, 'No se pudo calcular el interés de mora.')
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
        <UiSelectorBuscable v-model="inmuebleSeleccionadoId" :opciones="opcionesInmueble" />
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
          <UiTabla
            :columnas="[
              { clave: 'cargo', etiqueta: 'Cargo' },
              { clave: 'montoAplicado', etiqueta: 'Monto aplicado' },
            ]"
            :filas="resultadoPago.aplicaciones"
            :clave-fila="(aplicacion) => aplicacion.cargo_id"
            vacio="Sin aplicaciones."
          >
            <template #celda-cargo="{ fila }">
              <span class="text-gray-500">
                {{
                  cargoPorId.get(fila.cargo_id)?.categoria
                    ? etiquetaCategoria[cargoPorId.get(fila.cargo_id)!.categoria!]
                    : fila.cargo_id
                }}
              </span>
            </template>
            <template #celda-montoAplicado="{ fila }">{{ formatoMoneda(fila.monto) }}</template>
          </UiTabla>
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

        <UiTabla
          v-if="resultadoIntereses"
          class="mt-2"
          :columnas="[
            { clave: 'inmueble', etiqueta: 'Inmueble' },
            { clave: 'montoGenerado', etiqueta: 'Monto generado' },
            { clave: 'topeAplicado', etiqueta: 'Tope aplicado' },
          ]"
          :filas="resultadoIntereses"
          :clave-fila="(fila) => fila.inmueble_id"
          vacio="Ningún inmueble generó interés de mora para esta fecha."
        >
          <template #celda-inmueble="{ fila }">{{ inmueblePorId.get(fila.inmueble_id) ?? fila.inmueble_id }}</template>
          <template #celda-montoGenerado="{ fila }">{{ formatoMoneda(fila.monto_generado) }}</template>
          <template #celda-topeAplicado="{ fila }"><span class="text-gray-500">{{ fila.tope_aplicado ? 'Sí' : 'No' }}</span></template>
        </UiTabla>
      </div>
    </template>
  </div>
</template>
