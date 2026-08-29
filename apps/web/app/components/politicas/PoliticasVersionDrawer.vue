<script setup lang="ts">
// Drawer de una versión de política financiera — sirve para los 2 casos
// según el prop `politicaId`: sin él, crea una versión nueva en borrador;
// con él, la muestra en solo lectura (nunca editable — guard_politica_
// inmutable no admite tocar una fila después de insertada, así que no hay
// modo "editar" como en PresupuestoRubroDrawer.vue, solo crear/ver).
//
// Contenedor `UiDrawer` (igual que el resto de drawers de la app — sin
// `.ficha-inmueble` como ancestro se renderiza sin estilo, ver comentario
// de MiembroDrawer.vue), pero el CONTENIDO usa componentes Nuxt UI
// (UFormField/UInput/USelect/UButton) en vez del `.field`/`<select>` plano
// de ficha-inmueble.css — decisión del usuario (23-08-2026): que el drawer
// combine con el resto de esta página (que ya es Nuxt UI), no con los
// otros drawers del sistema `.ficha-inmueble` (Miembros, Rubros,
// Coeficientes...). Es el primer drawer con este criterio — si se adopta
// para los demás, este es el patrón de referencia.
import type { Database } from '@aquila/shared'

type PoliticaFinancieraRow = Database['public']['Tables']['politicas_financieras']['Row']

const props = defineProps<{ politicaId?: string }>()
const emit = defineEmits<{ cerrar: []; creado: [] }>()

const tenantStore = useTenantStore()
const politicaStore = usePoliticaFinancieraStore()

const politicaExistente = computed<PoliticaFinancieraRow | undefined>(() =>
  props.politicaId ? politicaStore.politicas.find((p) => p.id === props.politicaId) : undefined,
)
const soloLectura = computed(() => politicaExistente.value !== undefined)

const redondeoModo = ref<'half_up' | 'half_even' | 'down' | 'up'>(
  politicaExistente.value?.redondeo_modo ?? 'half_up',
)
const redondeoEscala = ref(politicaExistente.value?.redondeo_escala ?? 0)
const interesTipoTasa = ref<'ibc_consumo_ordinario' | null>(
  politicaExistente.value?.interes_tipo_tasa ?? null,
)
const interesMultiplicador = ref<number | null>(
  politicaExistente.value?.interes_multiplicador ?? 1.5,
)
const interesTasaMensual = ref<number | null>(politicaExistente.value?.interes_tasa_mensual ?? null)
const interesTopeMensual = ref<number | null>(politicaExistente.value?.interes_tope_mensual ?? null)
const interesDiasGracia = ref(politicaExistente.value?.interes_dias_gracia ?? 0)
const interesDayCount = ref<'mensual_30_dias_reales' | 'actual_365' | 'actual_360' | 'treinta_360'>(
  politicaExistente.value?.interes_day_count ?? 'mensual_30_dias_reales',
)
const interesDescuentoOrden = ref<'interes_sobre_capital_completo' | 'descuento_antes_interes'>(
  politicaExistente.value?.interes_descuento_orden ?? 'interes_sobre_capital_completo',
)
const fondoImprevistosPorcentaje = ref<number | null>(
  politicaExistente.value?.fondo_imprevistos_porcentaje ?? null,
)
const fondoImprevistosBase = ref<'presupuesto_anual' | 'cuota_administracion' | null>(
  politicaExistente.value?.fondo_imprevistos_base ?? null,
)
const coeficientesSumaEsperada = ref(politicaExistente.value?.coeficientes_suma_esperada ?? 1)
const vigenteDesde = ref(politicaExistente.value?.vigente_desde ?? '')
const guardando = ref(false)
const error = ref<string | null>(null)

const opcionesRedondeoModo = [
  { label: 'Half up (redondea 0.5 hacia arriba)', value: 'half_up' },
  { label: 'Half even (banquero — 0.5 al par más cercano)', value: 'half_even' },
  { label: 'Down (siempre hacia abajo)', value: 'down' },
  { label: 'Up (siempre hacia arriba)', value: 'up' },
]
const opcionesDayCount = [
  { label: 'Tasa/30 × días reales (histórico)', value: 'mensual_30_dias_reales' },
  { label: 'ACTUAL/365', value: 'actual_365' },
  { label: 'ACTUAL/360', value: 'actual_360' },
  { label: '30/360', value: 'treinta_360' },
]
const opcionesDescuentoOrden = [
  { label: 'Interés sobre capital completo (histórico)', value: 'interes_sobre_capital_completo' },
  { label: 'Descuento reduce la base antes del interés', value: 'descuento_antes_interes' },
]
const opcionesFondoBase = [
  { label: '— Ninguna —', value: null },
  { label: 'Presupuesto anual', value: 'presupuesto_anual' },
  { label: 'Cuota de administración', value: 'cuota_administracion' },
]
const opcionesTipoTasa = [
  { label: '— Sin interés de mora —', value: null },
  { label: 'IBC consumo y ordinario (Superfinanciera)', value: 'ibc_consumo_ordinario' },
]

// Espejo en la UI de guard_politica_financiera_tope_legal (20260901110000): mismo
// cálculo, misma tasa vigente, mismos dos rechazos. No sustituye al trigger — la
// autoridad sigue siendo la base; esto solo evita que el administrador descubra el
// rechazo al activar, cuando ya no puede editar la versión (guard_politica_inmutable).
const tasaVigente = computed(() => politicaStore.tasaReferenciaVigente)
const cobraMora = computed(
  () => interesTasaMensual.value !== null || interesTopeMensual.value !== null,
)
const topeLegal = computed<number | null>(() => {
  if (!tasaVigente.value || interesMultiplicador.value === null) return null
  return interesMultiplicador.value * Number(tasaVigente.value.valor_mensual)
})
const faltaFuente = computed(() => cobraMora.value && interesTipoTasa.value === null)
const faltaTasaVigente = computed(
  () => interesTipoTasa.value !== null && tasaVigente.value === null,
)
const excedeTopeLegal = computed(() => {
  const tope = topeLegal.value
  if (tope === null) return false
  return (
    (interesTasaMensual.value !== null && interesTasaMensual.value > tope) ||
    (interesTopeMensual.value !== null && interesTopeMensual.value > tope)
  )
})
const puedeGuardar = computed(
  () => !faltaFuente.value && !excedeTopeLegal.value && !faltaTasaVigente.value,
)

watch(
  [interesTipoTasa, vigenteDesde],
  async () => {
    if (!interesTipoTasa.value) return
    try {
      await politicaStore.cargarTasaReferenciaVigente(
        interesTipoTasa.value,
        vigenteDesde.value || undefined,
      )
    } catch (excepcion) {
      error.value = mensajeError(excepcion, 'No se pudo leer la tasa de referencia vigente.')
    }
  },
  { immediate: true },
)

async function guardar(): Promise<void> {
  error.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return

  guardando.value = true
  try {
    await politicaStore.crearPolitica({
      tenantId,
      redondeoModo: redondeoModo.value,
      redondeoEscala: redondeoEscala.value,
      interesTipoTasa: interesTipoTasa.value ?? undefined,
      interesMultiplicador: interesTipoTasa.value ? (interesMultiplicador.value ?? undefined) : undefined,
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
    emit('creado')
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo crear la política financiera.')
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div class="ficha-inmueble">
    <UiDrawer
      :abierto="true"
      :titulo="soloLectura ? `Política financiera — v${politicaExistente?.version}` : 'Nueva versión de política financiera'"
      :subtitulo="soloLectura ? undefined : 'Queda en borrador — no afecta nada hasta que la actives.'"
      @cerrar="emit('cerrar')"
    >
      <div class="space-y-6 text-sm">
        <div>
          <h3 class="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3">Redondeo</h3>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Modo" name="redondeo_modo">
              <USelect
                v-model="redondeoModo"
                :items="opcionesRedondeoModo"
                value-key="value"
                :disabled="soloLectura"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Escala" name="redondeo_escala" help="Decimales que conserva, ej. 0 = pesos enteros.">
              <UInput v-model.number="redondeoEscala" type="number" min="0" :disabled="soloLectura" class="w-full" />
            </UFormField>
          </div>
        </div>

        <div>
          <h3 class="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3">Interés y mora</h3>
          <div class="space-y-4">
            <UFormField
              label="Fuente de la tasa"
              name="interes_tipo_tasa"
              help="Obligatoria si la política cobra mora: es la tasa certificada contra la que se valida el tope del art. 30."
            >
              <USelect
                v-model="interesTipoTasa"
                :items="opcionesTipoTasa"
                value-key="value"
                :disabled="soloLectura"
                class="w-full"
              />
            </UFormField>
            <div v-if="interesTipoTasa" class="grid grid-cols-2 gap-4">
              <UFormField
                label="Multiplicador"
                name="interes_multiplicador"
                help="Máximo 1.5 (art. 30 Ley 675). La asamblea puede fijar menos, nunca más."
              >
                <UInput
                  v-model.number="interesMultiplicador"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="1.5"
                  :disabled="soloLectura"
                  class="w-full"
                />
              </UFormField>
              <div class="self-center text-xs text-neutral-500">
                <template v-if="topeLegal !== null">
                  Tope legal resultante:
                  <span class="font-semibold tabular-nums">{{ topeLegal.toFixed(6) }}%</span>
                  mensual
                  <span v-if="tasaVigente" class="block mt-1">
                    Resolución {{ tasaVigente.resolucion_numero }} · {{ tasaVigente.entidad_fuente }}
                  </span>
                </template>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <UFormField
                label="Tasa mensual"
                name="interes_tasa_mensual"
                help="Como porcentaje, ej. 1.5 = 1.5% mensual."
              >
                <UInput
                  v-model.number="interesTasaMensual"
                  type="number"
                  step="0.000001"
                  :disabled="soloLectura"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="Tope mensual"
                name="interes_tope_mensual"
                help="Tope legal de interés de mora, mismo formato que la tasa."
              >
                <UInput
                  v-model.number="interesTopeMensual"
                  type="number"
                  step="0.000001"
                  :disabled="soloLectura"
                  class="w-full"
                />
              </UFormField>
            </div>
            <UAlert
              v-if="faltaFuente"
              color="warning"
              variant="soft"
              title="Falta declarar la fuente de la tasa"
              description="Una política que cobra mora debe declarar contra qué tasa certificada se valida. Sin eso la versión se guarda, pero la base rechaza activarla."
            />
            <UAlert
              v-else-if="faltaTasaVigente"
              color="warning"
              variant="soft"
              title="No hay tasa de referencia vigente para esa fecha"
              description="Hay que cargar la resolución correspondiente antes de activar esta versión."
            />
            <UAlert
              v-else-if="excedeTopeLegal"
              color="error"
              variant="soft"
              title="El interés excede el tope legal"
              description="Ni la tasa ni el tope mensual pueden superar el multiplicador por la tasa de referencia vigente (art. 30 Ley 675 de 2001)."
            />
            <UFormField
              label="Días de gracia"
              name="interes_dias_gracia"
              help="Días después del vencimiento antes de empezar a cobrar mora."
            >
              <UInput
                v-model.number="interesDiasGracia"
                type="number"
                min="0"
                :disabled="soloLectura"
                class="w-full max-w-40"
              />
            </UFormField>
            <UFormField
              label="Day-count de mora"
              name="interes_day_count"
              help="Cómo se cuentan los días para calcular el interés — afecta cuánto paga un inmueble en mora."
            >
              <USelect
                v-model="interesDayCount"
                :items="opcionesDayCount"
                value-key="value"
                :disabled="soloLectura"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="Orden descuento vs. interés"
              name="interes_descuento_orden"
              help="Si un pronto pago tiene descuento, decide si el interés de mora se calcula antes o después de aplicarlo."
            >
              <USelect
                v-model="interesDescuentoOrden"
                :items="opcionesDescuentoOrden"
                value-key="value"
                :disabled="soloLectura"
                class="w-full"
              />
            </UFormField>
          </div>
        </div>

        <div>
          <h3 class="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3">Fondo de imprevistos</h3>
          <div class="grid grid-cols-2 gap-4">
            <UFormField
              label="Porcentaje"
              name="fondo_imprevistos_porcentaje"
              help="Como porcentaje, ej. 5 = 5%. Vacío = sin fondo de imprevistos."
            >
              <UInput
                v-model.number="fondoImprevistosPorcentaje"
                type="number"
                step="0.0001"
                :disabled="soloLectura"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Base de cálculo" name="fondo_imprevistos_base">
              <USelect
                v-model="fondoImprevistosBase"
                :items="opcionesFondoBase"
                value-key="value"
                :disabled="soloLectura"
                class="w-full"
              />
            </UFormField>
          </div>
        </div>

        <div>
          <h3 class="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3">Vigencia</h3>
          <div class="grid grid-cols-2 gap-4">
            <UFormField
              label="Σ coeficientes esperada"
              name="coeficientes_suma_esperada"
              help="Normalmente 1 — la suma de los coeficientes de todos los inmuebles."
            >
              <UInput
                v-model.number="coeficientesSumaEsperada"
                type="number"
                step="0.0000000001"
                :disabled="soloLectura"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Vigente desde" name="vigente_desde">
              <UInput v-model="vigenteDesde" type="date" :disabled="soloLectura" class="w-full" />
            </UFormField>
          </div>
        </div>

        <UAlert v-if="error" color="error" variant="soft" :title="error" />
      </div>

      <template #foot>
        <template v-if="soloLectura">
          <UButton @click="emit('cerrar')">Cerrar</UButton>
        </template>
        <template v-else>
          <UButton variant="ghost" @click="emit('cerrar')">Cancelar</UButton>
          <UButton :loading="guardando" :disabled="!puedeGuardar" @click="guardar">Crear versión</UButton>
        </template>
      </template>
    </UiDrawer>
  </div>
</template>
