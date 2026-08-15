<script setup lang="ts">
// GAP-19 — gestión de fuentes de financiación de un presupuesto (E-16 §9).
// Placeholder de UI mínimo, mismo criterio que usuarios/index.vue: alcanza
// para probar el flujo completo, no es el diseño final de la pantalla.
// No incluye creación de presupuestos/rubros (fuera de alcance de GAP-19,
// esa pantalla es otro incremento) — si el tenant no tiene ninguno todavía,
// se muestra un estado vacío.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:create' })

const tenantStore = useTenantStore()
const presupuestoStore = usePresupuestoStore()

const presupuestoSeleccionadoId = ref<string | null>(null)
const tipo = ref<
  'otros_ingresos' | 'cuota_extraordinaria' | 'fondo_imprevistos' | 'saldo_aplicable'
>('otros_ingresos')
const valorDisponible = ref<number | null>(null)
const valorAplicado = ref<number | null>(null)
const descripcion = ref('')
const cargando = ref(false)
const error = ref<string | null>(null)

const previsualizacion = ref<Awaited<
  ReturnType<typeof presupuestoStore.previsualizarDistribucion>
> | null>(null)
const previsualizando = ref(false)
const errorPrevisualizacion = ref<string | null>(null)

await useAsyncData('presupuestos', () => {
  const tenantId = tenantStore.activeTenant?.id
  return tenantId ? presupuestoStore.cargarPresupuestos(tenantId) : Promise.resolve([])
})

watch(
  () => presupuestoStore.presupuestos,
  (lista) => {
    if (!presupuestoSeleccionadoId.value && lista.length > 0) {
      presupuestoSeleccionadoId.value = lista[0]!.id
    }
  },
  { immediate: true },
)

watch(
  presupuestoSeleccionadoId,
  async (id) => {
    previsualizacion.value = null
    errorPrevisualizacion.value = null
    if (id) await presupuestoStore.cargarFuentesFinanciacion(id)
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

async function registrar(): Promise<void> {
  error.value = null
  const presupuestoId = presupuestoSeleccionadoId.value
  if (!presupuestoId || valorDisponible.value === null) return

  cargando.value = true
  try {
    await presupuestoStore.registrarFuenteFinanciacion({
      presupuestoId,
      tipo: tipo.value,
      valorDisponible: valorDisponible.value,
      valorAplicado: valorAplicado.value ?? 0,
      descripcion: descripcion.value || undefined,
    })
    valorDisponible.value = null
    valorAplicado.value = null
    descripcion.value = ''
    // Una fuente nueva cambia la necesidad financiera — la previsualización
    // anterior ya no refleja el presupuesto actual.
    previsualizacion.value = null
  } catch (excepcion) {
    error.value =
      excepcion instanceof Error
        ? excepcion.message
        : 'No se pudo registrar la fuente de financiación.'
  } finally {
    cargando.value = false
  }
}

async function previsualizar(): Promise<void> {
  errorPrevisualizacion.value = null
  const presupuestoId = presupuestoSeleccionadoId.value
  if (!presupuestoId) return

  previsualizando.value = true
  try {
    previsualizacion.value = await presupuestoStore.previsualizarDistribucion(presupuestoId)
  } catch (excepcion) {
    errorPrevisualizacion.value =
      excepcion instanceof Error ? excepcion.message : 'No se pudo previsualizar la distribución.'
  } finally {
    previsualizando.value = false
  }
}
</script>

<template>
  <div class="space-y-8">
    <div>
      <h1 class="text-xl font-semibold mb-2">Presupuesto — fuentes de financiación</h1>
      <p class="text-sm text-gray-500">
        Recursos distintos de la cuota ordinaria (otros ingresos, cuota extraordinaria, fondo de
        imprevistos, saldo aplicable) — GAP-19.
      </p>
    </div>

    <p v-if="presupuestoStore.presupuestos.length === 0" class="text-gray-500 text-sm">
      Esta copropiedad todavía no tiene un presupuesto registrado.
    </p>

    <template v-else>
      <UFormField label="Presupuesto" name="presupuesto">
        <select
          v-model="presupuestoSeleccionadoId"
          class="rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5 text-sm"
        >
          <option v-for="p in presupuestoStore.presupuestos" :key="p.id" :value="p.id">
            {{ p.anio }} — v{{ p.version }} ({{ p.estado }})
          </option>
        </select>
      </UFormField>

      <div>
        <h2 class="text-lg font-semibold mb-2">Fuentes registradas</h2>
        <p v-if="presupuestoStore.fuentes.length === 0" class="text-gray-500 text-sm">Ninguna.</p>
        <table v-else class="w-full text-sm">
          <thead>
            <tr class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-800">
              <th class="py-1 font-medium">Tipo</th>
              <th class="py-1 font-medium">Disponible</th>
              <th class="py-1 font-medium">Aplicado</th>
              <th class="py-1 font-medium">Descripción</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="fuente in presupuestoStore.fuentes"
              :key="fuente.id"
              class="border-b border-gray-100 dark:border-gray-900"
            >
              <td class="py-1.5">{{ fuente.tipo }}</td>
              <td class="py-1.5">{{ formatoMoneda(fuente.valor_disponible) }}</td>
              <td class="py-1.5">{{ formatoMoneda(fuente.valor_aplicado) }}</td>
              <td class="py-1.5 text-gray-500">{{ fuente.descripcion ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div>
        <div class="flex items-center justify-between mb-2">
          <h2 class="text-lg font-semibold">Previsualizar distribución</h2>
          <UButton size="xs" variant="soft" :loading="previsualizando" @click="previsualizar">
            Previsualizar
          </UButton>
        </div>
        <p class="text-sm text-gray-500 mb-2">
          Simula cómo quedaría el reparto por coeficiente sin liquidar nada — netea las fuentes de
          tipo "otros ingresos" contra el total antes de repartir.
        </p>

        <UAlert
          v-if="errorPrevisualizacion"
          color="error"
          variant="soft"
          :title="errorPrevisualizacion"
        />

        <template v-if="previsualizacion">
          <p class="text-sm mb-2">
            Necesidad financiera:
            <span class="font-medium">{{
              formatoMoneda(previsualizacion.necesidad_financiera)
            }}</span>
            <span class="text-gray-500">
              ({{ formatoMoneda(previsualizacion.monto_total) }} − otros ingresos
              {{ formatoMoneda(previsualizacion.otros_ingresos_aplicados) }})
            </span>
          </p>
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-800">
                <th class="py-1 font-medium">Inmueble</th>
                <th class="py-1 font-medium">Coeficiente</th>
                <th class="py-1 font-medium">Valor asignado</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="fila in previsualizacion.distribucion"
                :key="fila.inmueble_id"
                class="border-b border-gray-100 dark:border-gray-900"
              >
                <td class="py-1.5">{{ fila.codigo }}</td>
                <td class="py-1.5 text-gray-500">{{ fila.coeficiente ?? '—' }}</td>
                <td class="py-1.5">{{ formatoMoneda(fila.valor_asignado) }}</td>
              </tr>
            </tbody>
          </table>
        </template>
      </div>

      <div>
        <h2 class="text-lg font-semibold mb-2">Registrar fuente de financiación</h2>
        <form class="space-y-4 max-w-sm" @submit.prevent="registrar">
          <UFormField label="Tipo" name="tipo">
            <select
              v-model="tipo"
              class="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5"
            >
              <option value="otros_ingresos">Otros ingresos</option>
              <option value="cuota_extraordinaria">Cuota extraordinaria</option>
              <option value="fondo_imprevistos">Fondo de imprevistos</option>
              <option value="saldo_aplicable">Saldo aplicable</option>
            </select>
          </UFormField>

          <UFormField label="Valor disponible" name="valor_disponible">
            <UInput
              v-model.number="valorDisponible"
              type="number"
              min="0"
              required
              class="w-full"
            />
          </UFormField>

          <UFormField label="Valor aplicado" name="valor_aplicado">
            <UInput v-model.number="valorAplicado" type="number" min="0" class="w-full" />
          </UFormField>

          <UFormField label="Descripción" name="descripcion">
            <UInput v-model="descripcion" class="w-full" />
          </UFormField>

          <UAlert v-if="error" color="error" variant="soft" :title="error" />

          <UButton type="submit" :loading="cargando">Registrar</UButton>
        </form>
      </div>
    </template>
  </div>
</template>
