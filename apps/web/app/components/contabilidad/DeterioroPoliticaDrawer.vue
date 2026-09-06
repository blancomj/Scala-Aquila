<script setup lang="ts">
// CO-7 · Drawer de una versión de política de deterioro — mismo criterio que
// PoliticasVersionDrawer.vue (politicas financieras): sin `politicaId` crea una versión nueva en
// borrador, con él la muestra en solo lectura (guard_politica_inmutable no admite tocar una fila
// ya vigente/histórica — no hay modo "editar").
//
// La validación de cobertura de tramos (§4.1: [0,∞) sin huecos ni solapes) se calcula aquí en
// vivo, como ayuda visual antes de guardar — la autoridad real sigue siendo
// guard_politica_deterioro_completa en la base, que corre al activar, no al crear el borrador.
import { useDeterioroStore, type NuevoTramoDeterioro } from '~/stores/deterioro'

const props = defineProps<{ tenantId: string; politicaId?: string; siguienteVersion: number }>()
const emit = defineEmits<{ cerrar: []; creado: [] }>()

const deterioroStore = useDeterioroStore()
const soloLectura = computed(() => props.politicaId !== undefined)

const politicaExistente = computed(() =>
  props.politicaId ? deterioroStore.politicas.find((p) => p.id === props.politicaId) : undefined,
)

const metodo = ref<'antiguedad' | 'porcentaje_global' | 'individual'>(politicaExistente.value?.metodo ?? 'antiguedad')
const porcentajeGlobal = ref<number | null>(politicaExistente.value?.porcentaje_global ?? null)
const excluirAcuerdoVigente = ref(politicaExistente.value?.excluir_cargos_con_acuerdo_vigente ?? true)
const vigenteDesde = ref(politicaExistente.value?.vigente_desde ?? '')
const acuerdoReferencia = ref(politicaExistente.value?.acta_referencia ?? '')
const fundamento = ref(politicaExistente.value?.fundamento ?? '')
const guardando = ref(false)
const error = ref<string | null>(null)

interface FilaTramo extends NuevoTramoDeterioro { sinTope: boolean }
const filasTramo = ref<FilaTramo[]>([
  { diasDesde: 0, diasHasta: 30, porcentaje: 0, sinTope: false },
  { diasDesde: 31, diasHasta: null, porcentaje: 10, sinTope: true },
])

onMounted(async () => {
  if (!props.politicaId) return
  const cargados = await deterioroStore.cargarTramos(props.politicaId)
  filasTramo.value = cargados.map((t) => ({
    diasDesde: t.dias_desde, diasHasta: t.dias_hasta, porcentaje: Number(t.porcentaje),
    sinTope: t.dias_hasta === null,
  }))
})

function agregarTramo(): void {
  const ultimo = filasTramo.value.at(-1)
  const desde = ultimo ? (ultimo.diasHasta ?? ultimo.diasDesde) + 1 : 0
  filasTramo.value = [...filasTramo.value, { diasDesde: desde, diasHasta: null, porcentaje: 0, sinTope: true }]
}
function quitarTramo(indice: number): void {
  filasTramo.value = filasTramo.value.filter((_, i) => i !== indice)
}

/** Espejo visual de guard_politica_deterioro_completa (CO-7 §4.1) — no sustituye al guard, solo
 * evita que el usuario descubra el problema recién al activar. */
const problemasCobertura = computed<string[]>(() => {
  if (metodo.value !== 'antiguedad') return []
  const problemas: string[] = []
  const ordenados = [...filasTramo.value].sort((a, b) => a.diasDesde - b.diasDesde)

  if (ordenados.length === 0) {
    problemas.push('No hay ningún tramo.')
    return problemas
  }
  if (ordenados[0]!.diasDesde !== 0) {
    problemas.push('Falta un tramo que empiece en 0 días.')
  }
  const abiertos = ordenados.filter((t) => t.diasHasta === null)
  if (abiertos.length !== 1) {
    problemas.push(`Debe haber exactamente un tramo sin tope superior (hay ${String(abiertos.length)}).`)
  } else if (abiertos[0] !== ordenados.at(-1)) {
    problemas.push('El tramo sin tope superior debe ser el de mayor "días desde" — hay otro tramo después.')
  }
  for (let i = 1; i < ordenados.length; i++) {
    const anterior = ordenados[i - 1]!
    const actual = ordenados[i]!
    if (anterior.diasHasta === null) continue
    if (actual.diasDesde > anterior.diasHasta + 1) {
      problemas.push(`Hueco de cobertura entre ${String(anterior.diasHasta)} y ${String(actual.diasDesde)} días.`)
    } else if (actual.diasDesde <= anterior.diasHasta) {
      problemas.push(`Solape entre el tramo que termina en ${String(anterior.diasHasta)} y el que empieza en ${String(actual.diasDesde)} días.`)
    }
  }
  for (const t of ordenados) {
    if (t.porcentaje < 0 || t.porcentaje > 100) {
      problemas.push(`El porcentaje ${String(t.porcentaje)} está fuera de 0-100.`)
    }
  }
  return problemas
})

const puedeGuardar = computed(() => {
  if (metodo.value === 'porcentaje_global') {
    return porcentajeGlobal.value !== null && porcentajeGlobal.value >= 0 && porcentajeGlobal.value <= 100
  }
  return true // 'antiguedad' y 'individual' se pueden guardar en borrador aunque estén incompletos
})

async function guardar(): Promise<void> {
  error.value = null
  guardando.value = true
  try {
    await deterioroStore.crearPolitica({
      tenantId: props.tenantId,
      version: props.siguienteVersion,
      metodo: metodo.value,
      porcentajeGlobal: porcentajeGlobal.value ?? undefined,
      excluirCargosConAcuerdoVigente: excluirAcuerdoVigente.value,
      vigenteDesde: vigenteDesde.value || undefined,
      acuerdoReferencia: acuerdoReferencia.value || undefined,
      fundamento: fundamento.value || undefined,
      tramos: metodo.value === 'antiguedad'
        ? filasTramo.value.map((t) => ({ diasDesde: t.diasDesde, diasHasta: t.sinTope ? null : t.diasHasta, porcentaje: t.porcentaje }))
        : [],
    })
    emit('creado')
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo crear la versión de la política de deterioro.')
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div class="ficha-inmueble">
    <UiDrawer
      :abierto="true"
      :titulo="soloLectura ? `Política de deterioro — v${politicaExistente?.version}` : `Nueva versión — v${siguienteVersion}`"
      :subtitulo="soloLectura ? undefined : 'Queda en borrador — no calcula nada hasta que la actives.'"
      ancho="ancho"
      @cerrar="emit('cerrar')"
    >
      <div class="space-y-6 text-sm">
        <div>
          <h3 class="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3">Método</h3>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Método de estimación" name="metodo">
              <USelect
                v-model="metodo"
                :items="[
                  { label: 'Por antigüedad (tramos)', value: 'antiguedad' },
                  { label: 'Porcentaje global sobre todo saldo vencido', value: 'porcentaje_global' },
                  { label: 'Individual (caso por caso — sin implementar aún)', value: 'individual' },
                ]"
                value-key="value"
                :disabled="soloLectura"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Excluir cargos con acuerdo de pago vigente" name="excluir">
              <USelect
                :model-value="excluirAcuerdoVigente"
                :items="[{ label: 'Sí (recomendado)', value: true }, { label: 'No', value: false }]"
                value-key="value"
                :disabled="soloLectura"
                class="w-full"
                @update:model-value="(v) => (excluirAcuerdoVigente = v as boolean)"
              />
            </UFormField>
          </div>
        </div>

        <UAlert
          v-if="metodo === 'individual'"
          color="warning"
          variant="soft"
          title="Método individual sin estructura definida"
          description="CO-7 no define una tabla de excepciones por inmueble — si se activa una política con este método, el cálculo falla explícitamente (DETERIORO_METODO_NO_IMPLEMENTADO) hasta que un corte futuro lo diseñe."
        />

        <div v-if="metodo === 'porcentaje_global'">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3">Porcentaje</h3>
          <UFormField label="Porcentaje global (0-100)" name="porcentaje_global" class="max-w-60">
            <UInput v-model.number="porcentajeGlobal" type="number" step="0.01" min="0" max="100" :disabled="soloLectura" class="w-full" />
          </UFormField>
        </div>

        <div v-if="metodo === 'antiguedad'">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-neutral-500">Tramos de antigüedad</h3>
            <UButton v-if="!soloLectura" size="xs" variant="soft" icon="i-lucide-plus" @click="agregarTramo">Agregar tramo</UButton>
          </div>
          <div class="overflow-x-auto rounded-lg border border-default">
            <table class="w-full text-sm">
              <thead class="bg-muted/30">
                <tr>
                  <th class="p-2 text-left">Días desde</th>
                  <th class="p-2 text-left">Días hasta</th>
                  <th class="p-2 text-left">Porcentaje</th>
                  <th v-if="!soloLectura" class="p-2" />
                </tr>
              </thead>
              <tbody>
                <tr v-for="(fila, i) in filasTramo" :key="i" class="border-t border-default">
                  <td class="p-1"><UInput v-model.number="fila.diasDesde" type="number" min="0" :disabled="soloLectura" class="w-24" /></td>
                  <td class="p-1">
                    <div class="flex items-center gap-2">
                      <UInput v-if="!fila.sinTope" v-model.number="fila.diasHasta" type="number" min="0" :disabled="soloLectura" class="w-24" />
                      <span v-else class="text-neutral-500 text-xs">sin tope</span>
                      <label v-if="!soloLectura" class="flex items-center gap-1 text-xs text-neutral-500">
                        <input v-model="fila.sinTope" type="checkbox"> sin tope
                      </label>
                    </div>
                  </td>
                  <td class="p-1"><UInput v-model.number="fila.porcentaje" type="number" step="0.01" min="0" max="100" :disabled="soloLectura" class="w-24" /></td>
                  <td v-if="!soloLectura" class="p-1">
                    <UButton size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" @click="quitarTramo(i)" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <UAlert
            v-if="problemasCobertura.length > 0"
            class="mt-3"
            color="warning"
            variant="soft"
            title="Los tramos no cubren [0,∞) todavía"
          >
            <template #description>
              <ul class="list-disc pl-4">
                <li v-for="(p, i) in problemasCobertura" :key="i">{{ p }}</li>
              </ul>
              <p class="mt-1 text-xs">Se puede guardar en borrador igual — la base rechazará activarla mientras esto no se corrija.</p>
            </template>
          </UAlert>
          <p v-else class="mt-3 text-xs text-green-700 dark:text-green-400">Los tramos cubren [0,∞) sin huecos ni solapes.</p>
        </div>

        <div>
          <h3 class="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3">Vigencia y soporte</h3>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Vigente desde" name="vigente_desde">
              <UInput v-model="vigenteDesde" type="date" :disabled="soloLectura" class="w-full" />
            </UFormField>
            <UFormField label="Referencia de acta" name="acta_referencia" help="Acta de consejo/asamblea que aprobó esta política.">
              <UInput v-model="acuerdoReferencia" :disabled="soloLectura" class="w-full" />
            </UFormField>
          </div>
          <UFormField label="Fundamento" name="fundamento" class="mt-4">
            <UTextarea v-model="fundamento" :disabled="soloLectura" class="w-full" :rows="2" />
          </UFormField>
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
