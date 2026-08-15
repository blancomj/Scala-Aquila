<script setup lang="ts">
// Motor de cuenta corriente (E4) — novedades: ajustes manuales con
// aprobación separada del motor de cálculo (Docs/19 §284, AD-33). Crear es
// agent-only (rechazo/aprobación también) porque materializa un cargo real
// en el ledger al aprobar.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:create' })

const tenantStore = useTenantStore()
const cuentaStore = useCuentaCorrienteStore()

const inmueblePorId = computed(() => new Map(cuentaStore.inmuebles.map((i) => [i.id, i.codigo])))

await useAsyncData('cuenta-corriente-novedades-base', async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return null
  await Promise.all([cuentaStore.cargarInmuebles(tenantId), cuentaStore.cargarNovedades(tenantId)])
  return null
})

function formatoMoneda(valor: string | number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(valor))
}

// ── crear novedad ──────────────────────────────────────────────────────
const inmuebleId = ref<string | null>(null)
const tipo = ref<'CHARGE' | 'DISCOUNT' | 'ADJUSTMENT' | 'REFUND' | 'CREDIT' | 'DEBIT'>('CHARGE')
const monto = ref<number | null>(null)
const descripcion = ref('')
const fechaEfectiva = ref(new Date().toISOString().slice(0, 10))
const creando = ref(false)
const errorCrear = ref<string | null>(null)

async function crearNovedad(): Promise<void> {
  errorCrear.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !inmuebleId.value || monto.value === null || !descripcion.value) return

  creando.value = true
  try {
    await cuentaStore.crearNovedad({
      tenantId,
      inmuebleId: inmuebleId.value,
      tipo: tipo.value,
      monto: monto.value,
      descripcion: descripcion.value,
      fechaEfectiva: fechaEfectiva.value,
    })
    monto.value = null
    descripcion.value = ''
  } catch (excepcion) {
    errorCrear.value =
      excepcion instanceof Error ? excepcion.message : 'No se pudo crear la novedad.'
  } finally {
    creando.value = false
  }
}

// ── aprobar / rechazar ────────────────────────────────────────────────
const accionEnCursoId = ref<string | null>(null)
const errorAccion = ref<string | null>(null)
const motivoPorNovedad = ref<Record<string, string>>({})

async function aprobar(novedadId: string): Promise<void> {
  errorAccion.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return

  accionEnCursoId.value = novedadId
  try {
    await cuentaStore.aprobarNovedad(novedadId, tenantId)
  } catch (excepcion) {
    errorAccion.value =
      excepcion instanceof Error ? excepcion.message : 'No se pudo aprobar la novedad.'
  } finally {
    accionEnCursoId.value = null
  }
}

async function rechazar(novedadId: string): Promise<void> {
  errorAccion.value = null
  const tenantId = tenantStore.activeTenant?.id
  const motivo = motivoPorNovedad.value[novedadId]
  if (!tenantId || !motivo) return

  accionEnCursoId.value = novedadId
  try {
    await cuentaStore.rechazarNovedad(novedadId, motivo, tenantId)
    motivoPorNovedad.value[novedadId] = ''
  } catch (excepcion) {
    errorAccion.value =
      excepcion instanceof Error ? excepcion.message : 'No se pudo rechazar la novedad.'
  } finally {
    accionEnCursoId.value = null
  }
}
</script>

<template>
  <div class="space-y-8">
    <div>
      <h1 class="text-xl font-semibold mb-2">Novedades</h1>
      <p class="text-sm text-gray-500">
        Ajustes manuales (cargo, descuento, reembolso...) con aprobación separada del motor de
        cálculo — solo al aprobar se materializa un cargo en el ledger.
      </p>
    </div>

    <div>
      <h2 class="text-lg font-semibold mb-2">Crear novedad</h2>
      <p v-if="cuentaStore.inmuebles.length === 0" class="text-gray-500 text-sm">
        Esta copropiedad todavía no tiene inmuebles registrados.
      </p>
      <form v-else class="space-y-4 max-w-sm" @submit.prevent="crearNovedad">
        <UFormField label="Inmueble" name="inmueble">
          <select
            v-model="inmuebleId"
            required
            class="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5"
          >
            <option :value="null" disabled>— Elegir —</option>
            <option v-for="i in cuentaStore.inmuebles" :key="i.id" :value="i.id">
              {{ i.codigo }}
            </option>
          </select>
        </UFormField>
        <UFormField label="Tipo" name="tipo">
          <select
            v-model="tipo"
            class="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5"
          >
            <option value="CHARGE">Cargo (CHARGE)</option>
            <option value="DEBIT">Débito (DEBIT)</option>
            <option value="DISCOUNT">Descuento (DISCOUNT)</option>
            <option value="CREDIT">Crédito (CREDIT)</option>
            <option value="REFUND">Reembolso (REFUND)</option>
            <option value="ADJUSTMENT">Ajuste (ADJUSTMENT)</option>
          </select>
        </UFormField>
        <UFormField label="Monto" name="monto">
          <UInput v-model.number="monto" type="number" step="0.01" required class="w-full" />
        </UFormField>
        <p class="text-xs text-gray-500 -mt-2">
          CHARGE/DEBIT deben ser positivos; DISCOUNT/CREDIT/REFUND, negativos; ADJUSTMENT admite
          cualquier signo distinto de cero.
        </p>
        <UFormField label="Descripción" name="descripcion">
          <UInput v-model="descripcion" required class="w-full" />
        </UFormField>
        <UFormField label="Fecha efectiva" name="fecha_efectiva">
          <UInput v-model="fechaEfectiva" type="date" required class="w-full" />
        </UFormField>
        <UAlert v-if="errorCrear" color="error" variant="soft" :title="errorCrear" />
        <UButton type="submit" :loading="creando">Crear novedad</UButton>
      </form>
    </div>

    <div>
      <h2 class="text-lg font-semibold mb-2">Novedades registradas</h2>
      <UAlert v-if="errorAccion" color="error" variant="soft" :title="errorAccion" class="mb-2" />
      <p v-if="cuentaStore.novedades.length === 0" class="text-gray-500 text-sm">Ninguna.</p>
      <table v-else class="w-full text-sm">
        <thead>
          <tr class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-800">
            <th class="py-1 font-medium">Fecha efectiva</th>
            <th class="py-1 font-medium">Inmueble</th>
            <th class="py-1 font-medium">Tipo</th>
            <th class="py-1 font-medium">Monto</th>
            <th class="py-1 font-medium">Descripción</th>
            <th class="py-1 font-medium">Estado</th>
            <th class="py-1 font-medium">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="novedad in cuentaStore.novedades"
            :key="novedad.id"
            class="border-b border-gray-100 dark:border-gray-900"
          >
            <td class="py-1.5">{{ novedad.fecha_efectiva }}</td>
            <td class="py-1.5 text-gray-500">
              {{ inmueblePorId.get(novedad.inmueble_id) ?? novedad.inmueble_id }}
            </td>
            <td class="py-1.5">{{ novedad.tipo }}</td>
            <td class="py-1.5">{{ formatoMoneda(novedad.monto) }}</td>
            <td class="py-1.5 text-gray-500">{{ novedad.descripcion }}</td>
            <td class="py-1.5 text-gray-500">{{ novedad.estado }}</td>
            <td class="py-1.5">
              <div v-if="novedad.estado === 'pendiente'" class="flex items-center gap-2">
                <UButton
                  size="xs"
                  variant="soft"
                  :loading="accionEnCursoId === novedad.id"
                  @click="aprobar(novedad.id)"
                >
                  Aprobar
                </UButton>
                <UInput
                  v-model="motivoPorNovedad[novedad.id]"
                  placeholder="Motivo de rechazo"
                  size="xs"
                  class="w-36"
                />
                <UButton
                  size="xs"
                  variant="soft"
                  color="error"
                  :disabled="!motivoPorNovedad[novedad.id]"
                  :loading="accionEnCursoId === novedad.id"
                  @click="rechazar(novedad.id)"
                >
                  Rechazar
                </UButton>
              </div>
              <span v-else class="text-gray-500">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
