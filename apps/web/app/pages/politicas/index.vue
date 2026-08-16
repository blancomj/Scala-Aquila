<script setup lang="ts">
// Políticas financieras — PLAN §4.3. Pantalla pequeña: listar versiones,
// crear una nueva en borrador, activar. No soporta reemplazar una política
// ya vigente (guard_politica_inmutable no lo permite hoy — ver stores/politicaFinanciera.ts).
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'settings:manage' })

const tenantStore = useTenantStore()
const politicaStore = usePoliticaFinancieraStore()

const redondeoModo = ref<'half_up' | 'half_even' | 'down' | 'up'>('half_up')
const redondeoEscala = ref(0)
const interesTasaMensual = ref<number | null>(null)
const interesTopeMensual = ref<number | null>(null)
const interesDiasGracia = ref(0)
const interesDayCount = ref<'mensual_30_dias_reales' | 'actual_365' | 'actual_360' | 'treinta_360'>(
  'mensual_30_dias_reales',
)
const interesDescuentoOrden = ref<'interes_sobre_capital_completo' | 'descuento_antes_interes'>(
  'interes_sobre_capital_completo',
)
const fondoImprevistosPorcentaje = ref<number | null>(null)
const fondoImprevistosBase = ref<'presupuesto_anual' | 'cuota_administracion' | ''>('')
const coeficientesSumaEsperada = ref(1)
const vigenteDesde = ref('')
const cargando = ref(false)
const activandoId = ref<string | null>(null)
const error = ref<string | null>(null)

await useAsyncData('politicas-financieras', () => {
  const tenantId = tenantStore.activeTenant?.id
  return tenantId ? politicaStore.cargarPoliticas(tenantId) : Promise.resolve([])
})

async function crear(): Promise<void> {
  error.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return

  cargando.value = true
  try {
    await politicaStore.crearPolitica({
      tenantId,
      redondeoModo: redondeoModo.value,
      redondeoEscala: redondeoEscala.value,
      interesTasaMensual: interesTasaMensual.value ?? undefined,
      interesTopeMensual: interesTopeMensual.value ?? undefined,
      interesDiasGracia: interesDiasGracia.value,
      interesDayCount: interesDayCount.value,
      interesDescuentoOrden: interesDescuentoOrden.value,
      fondoImprevistosPorcentaje: fondoImprevistosPorcentaje.value ?? undefined,
      fondoImprevistosBase: fondoImprevistosBase.value || undefined,
      coeficientesSumaEsperada: coeficientesSumaEsperada.value,
      vigenteDesde: vigenteDesde.value || undefined,
    })
    interesTasaMensual.value = null
    interesTopeMensual.value = null
    fondoImprevistosPorcentaje.value = null
    fondoImprevistosBase.value = ''
    vigenteDesde.value = ''
  } catch (excepcion) {
    error.value =
      excepcion instanceof Error ? excepcion.message : 'No se pudo crear la política financiera.'
  } finally {
    cargando.value = false
  }
}

async function activar(id: string): Promise<void> {
  error.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return

  activandoId.value = id
  try {
    await politicaStore.activarPolitica(id, tenantId)
  } catch (excepcion) {
    error.value = excepcion instanceof Error ? excepcion.message : 'No se pudo activar la política.'
  } finally {
    activandoId.value = null
  }
}
</script>

<template>
  <div class="space-y-8">
    <div>
      <h1 class="text-xl font-semibold mb-2">Políticas financieras</h1>
      <p class="text-sm text-gray-500">
        Redondeo, residual, intereses y fondo de imprevistos — versionadas (PLAN §4.3).
      </p>
    </div>

    <div>
      <h2 class="text-lg font-semibold mb-2">Versiones</h2>
      <p v-if="politicaStore.politicas.length === 0" class="text-gray-500 text-sm">
        Esta copropiedad todavía no tiene una política financiera.
      </p>
      <table v-else class="w-full text-sm">
        <thead>
          <tr class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-800">
            <th class="py-1 font-medium">Versión</th>
            <th class="py-1 font-medium">Estado</th>
            <th class="py-1 font-medium">Redondeo</th>
            <th class="py-1 font-medium">Interés</th>
            <th class="py-1 font-medium">Σ coeficientes</th>
            <th class="py-1 font-medium" />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="politica in politicaStore.politicas"
            :key="politica.id"
            class="border-b border-gray-100 dark:border-gray-900"
          >
            <td class="py-1.5">v{{ politica.version }}</td>
            <td class="py-1.5">{{ politica.estado }}</td>
            <td class="py-1.5 text-gray-500">
              {{ politica.redondeo_modo }} · escala {{ politica.redondeo_escala }}
            </td>
            <td class="py-1.5 text-gray-500">
              {{ politica.interes_day_count }} · {{ politica.interes_descuento_orden }}
            </td>
            <td class="py-1.5 text-gray-500">{{ politica.coeficientes_suma_esperada }}</td>
            <td class="py-1.5">
              <UButton
                v-if="politica.estado === 'borrador'"
                size="xs"
                variant="soft"
                :loading="activandoId === politica.id"
                @click="activar(politica.id)"
              >
                Activar
              </UButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div>
      <h2 class="text-lg font-semibold mb-2">Crear nueva versión (borrador)</h2>
      <form class="space-y-4 max-w-sm" @submit.prevent="crear">
        <UFormField label="Modo de redondeo" name="redondeo_modo">
          <select
            v-model="redondeoModo"
            class="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5"
          >
            <option value="half_up">Half up</option>
            <option value="half_even">Half even</option>
            <option value="down">Down</option>
            <option value="up">Up</option>
          </select>
        </UFormField>

        <UFormField label="Escala de redondeo" name="redondeo_escala">
          <UInput v-model.number="redondeoEscala" type="number" min="0" class="w-full" />
        </UFormField>

        <UFormField label="Σ coeficientes esperada" name="coeficientes_suma_esperada">
          <UInput
            v-model.number="coeficientesSumaEsperada"
            type="number"
            step="0.0000000001"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Tasa de interés mensual" name="interes_tasa_mensual">
          <UInput
            v-model.number="interesTasaMensual"
            type="number"
            step="0.000001"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Tope de interés mensual" name="interes_tope_mensual">
          <UInput
            v-model.number="interesTopeMensual"
            type="number"
            step="0.000001"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Días de gracia" name="interes_dias_gracia">
          <UInput v-model.number="interesDiasGracia" type="number" min="0" class="w-full" />
        </UFormField>

        <UFormField label="Day-count de mora" name="interes_day_count">
          <select
            v-model="interesDayCount"
            class="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5"
          >
            <option value="mensual_30_dias_reales">Tasa/30 × días reales (histórico)</option>
            <option value="actual_365">ACTUAL/365</option>
            <option value="actual_360">ACTUAL/360</option>
            <option value="treinta_360">30/360</option>
          </select>
        </UFormField>

        <UFormField label="Orden descuento vs. interés" name="interes_descuento_orden">
          <select
            v-model="interesDescuentoOrden"
            class="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5"
          >
            <option value="interes_sobre_capital_completo">
              Interés sobre capital completo (histórico)
            </option>
            <option value="descuento_antes_interes">Descuento reduce la base antes del interés</option>
          </select>
        </UFormField>

        <UFormField label="% fondo de imprevistos" name="fondo_imprevistos_porcentaje">
          <UInput
            v-model.number="fondoImprevistosPorcentaje"
            type="number"
            step="0.0001"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Base del fondo de imprevistos" name="fondo_imprevistos_base">
          <select
            v-model="fondoImprevistosBase"
            class="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5"
          >
            <option value="">— Ninguna —</option>
            <option value="presupuesto_anual">Presupuesto anual</option>
            <option value="cuota_administracion">Cuota de administración</option>
          </select>
        </UFormField>

        <UFormField label="Vigente desde" name="vigente_desde">
          <UInput v-model="vigenteDesde" type="date" class="w-full" />
        </UFormField>

        <UAlert v-if="error" color="error" variant="soft" :title="error" />

        <UButton type="submit" :loading="cargando">Crear versión</UButton>
      </form>
    </div>
  </div>
</template>
