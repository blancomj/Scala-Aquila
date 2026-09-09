<script setup lang="ts">
// MANT-7: ejecución de campo de una inspección — un formato vigente, respuesta por ítem
// (conforme/no_conforme/no_aplica), resultado sugerido calculado en vivo (mismo criterio que
// fn_mant_registrar_inspeccion) con opción de sobrescribir + motivo obligatorio.
import type { Database } from '@aquila/shared'

type FormatoRow = Database['public']['Tables']['mant_inspeccion_formatos']['Row']
type Resultado = Database['public']['Enums']['cumplimiento_resultado_t']
type RespuestaValor = Database['public']['Enums']['respuesta_valor_t']

const emit = defineEmits<{ cerrar: []; guardado: [] }>()

const tenantStore = useTenantStore()
const inspeccionesStore = useMantenimientoInspeccionesStore()
const activosStore = useActivosStore()

const formatosVigentes = computed(() =>
  inspeccionesStore.formatos.filter((f) => f.estado === 'vigente'),
)
const formatoId = ref<string | undefined>(undefined)
const formato = computed<FormatoRow | undefined>(() =>
  inspeccionesStore.formatos.find((f) => f.id === formatoId.value),
)
const activoId = ref<string | null>(null)
const fecha = ref(new Date().toISOString().slice(0, 10))
const terceroId = ref<string | null>(null)
const acreditacionReferencia = ref('')

interface RespuestaLocal {
  itemId: string
  texto: string
  severidad: Database['public']['Enums']['severidad_t']
  requiereEvidencia: boolean
  valor: RespuestaValor | undefined
  observacion: string
  evidenciaDocumentoId: string
  fechaLimite: string
}
const respuestasLocales = ref<RespuestaLocal[]>([])

watch(formatoId, async (id) => {
  respuestasLocales.value = []
  if (!id) return
  await inspeccionesStore.cargarItems(id)
  respuestasLocales.value = inspeccionesStore.items.map((i) => ({
    itemId: i.id,
    texto: i.texto,
    severidad: i.severidad_si_no_conforme,
    requiereEvidencia: i.requiere_evidencia,
    valor: undefined,
    observacion: '',
    evidenciaDocumentoId: '',
    fechaLimite: '',
  }))
})

onMounted(() => {
  const tenantId = tenantStore.activeTenant?.id
  if (tenantId) activosStore.cargarActivos(tenantId)
})

const resultadoSugerido = computed<Resultado>(() => {
  const noConformes = respuestasLocales.value.filter((r) => r.valor === 'no_conforme')
  if (noConformes.some((r) => r.severidad === 'critico')) return 'no_conforme'
  if (noConformes.length > 0) return 'con_hallazgos'
  return 'conforme'
})

const sobrescribir = ref(false)
const resultadoManual = ref<Resultado>('conforme')
const resultadoMotivo = ref('')

const error = ref<string | null>(null)

const hallazgosCriticosSinFecha = computed(() =>
  respuestasLocales.value.filter(
    (r) =>
      r.valor === 'no_conforme' &&
      (r.severidad === 'critico' || r.severidad === 'mayor') &&
      !r.fechaLimite,
  ),
)

const puedeGuardar = computed(
  () =>
    !!formatoId.value &&
    !!fecha.value &&
    respuestasLocales.value.every((r) => r.valor !== undefined) &&
    hallazgosCriticosSinFecha.value.length === 0 &&
    (!sobrescribir.value || !!resultadoMotivo.value.trim()),
)

async function guardar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !formatoId.value || !puedeGuardar.value) return
  error.value = null
  try {
    await inspeccionesStore.registrarInspeccion({
      tenantId,
      formatoId: formatoId.value,
      fecha: fecha.value,
      activoId: activoId.value ?? undefined,
      terceroId: terceroId.value ?? undefined,
      acreditacionReferencia: acreditacionReferencia.value.trim() || undefined,
      resultadoOverride: sobrescribir.value ? resultadoManual.value : undefined,
      resultadoMotivo: sobrescribir.value ? resultadoMotivo.value.trim() : undefined,
      respuestas: respuestasLocales.value.map((r) => ({
        itemId: r.itemId,
        valor: r.valor as RespuestaValor,
        observacion: r.observacion.trim() || undefined,
        evidenciaDocumentoId: r.evidenciaDocumentoId.trim() || undefined,
        fechaLimite: r.fechaLimite || undefined,
      })),
    })
    emit('guardado')
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo registrar la inspección.')
  }
}
</script>

<template>
  <UiDrawer :abierto="true" titulo="Ejecutar inspección" ancho="ancho" @cerrar="emit('cerrar')">
    <div class="space-y-4">
      <div class="grid grid-cols-2 gap-3">
        <UFormField label="Formato" name="formato">
          <USelect
            v-model="formatoId"
            class="w-full"
            :items="formatosVigentes.map((f) => ({ label: `${f.nombre} (v${f.version})`, value: f.id }))"
          />
        </UFormField>
        <UFormField label="Fecha" name="fecha">
          <UInput v-model="fecha" type="date" class="w-full" />
        </UFormField>
      </div>
      <UFormField label="Activo (opcional)" name="activo">
        <UiSelectorBuscable
          v-model="activoId"
          :opciones="activosStore.activos.map((a) => ({ valor: a.id, etiqueta: a.nombre }))"
          placeholder="— Inspección a nivel de copropiedad —"
        />
      </UFormField>

      <template v-if="formato?.requisito_id">
        <p class="text-xs text-muted">
          Este formato demuestra un requisito de cumplimiento — si exige tercero acreditado,
          complétalo aquí.
        </p>
        <UFormField label="Referencia de acreditación (si aplica)">
          <UInput v-model="acreditacionReferencia" class="w-full" />
        </UFormField>
      </template>

      <template v-if="respuestasLocales.length > 0">
        <hr class="border-neutral-200 dark:border-neutral-800">
        <div v-for="r in respuestasLocales" :key="r.itemId" class="space-y-2 rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
          <div class="flex items-start justify-between gap-2">
            <p class="text-sm font-medium">{{ r.texto }}</p>
            <UBadge size="sm" variant="soft" class="capitalize">{{ r.severidad }}</UBadge>
          </div>
          <URadioGroup
            v-model="r.valor"
            orientation="horizontal"
            :items="[
              { label: 'Conforme', value: 'conforme' },
              { label: 'No conforme', value: 'no_conforme' },
              { label: 'No aplica', value: 'no_aplica' },
            ]"
          />
          <UTextarea v-model="r.observacion" placeholder="Observación (opcional)" :rows="1" class="w-full" />
          <template v-if="r.valor === 'no_conforme'">
            <p class="text-xs text-warning">Genera un hallazgo automáticamente al guardar.</p>
            <div v-if="r.severidad === 'critico' || r.severidad === 'mayor'" class="grid grid-cols-2 gap-2">
              <UFormField label="Fecha límite (obligatoria)">
                <UInput v-model="r.fechaLimite" type="date" class="w-full" />
              </UFormField>
            </div>
            <UFormField v-if="r.requiereEvidencia" label="Documento de evidencia (id)">
              <UInput v-model="r.evidenciaDocumentoId" class="w-full" placeholder="uuid del documento subido" />
            </UFormField>
          </template>
        </div>
      </template>

      <template v-if="respuestasLocales.length > 0 && respuestasLocales.every((r) => r.valor !== undefined)">
        <hr class="border-neutral-200 dark:border-neutral-800">
        <UAlert
          color="neutral"
          variant="soft"
          :title="`Resultado sugerido: ${resultadoSugerido}`"
          description="Calculado desde las respuestas — se puede sobrescribir con un motivo."
        />
        <UCheckbox v-model="sobrescribir" label="Sobrescribir el resultado sugerido" />
        <template v-if="sobrescribir">
          <USelect
            v-model="resultadoManual"
            class="w-full"
            :items="[
              { label: 'Conforme', value: 'conforme' },
              { label: 'Con hallazgos', value: 'con_hallazgos' },
              { label: 'No conforme', value: 'no_conforme' },
            ]"
          />
          <UFormField label="Motivo de la sobrescritura (obligatorio)">
            <UTextarea v-model="resultadoMotivo" :rows="2" class="w-full" />
          </UFormField>
        </template>
      </template>

      <UAlert
        v-if="hallazgosCriticosSinFecha.length > 0"
        color="warning"
        variant="soft"
        title="Falta fecha límite"
        description="Todo hallazgo crítico/mayor exige una fecha límite antes de poder guardar."
      />
      <UAlert v-if="error" color="error" variant="soft" :title="error" />
    </div>
    <template #foot>
      <div class="flex justify-end gap-2 w-full">
        <UButton variant="ghost" @click="emit('cerrar')">Cancelar</UButton>
        <UButton :loading="inspeccionesStore.guardando" :disabled="!puedeGuardar" @click="guardar()">
          Registrar inspección
        </UButton>
      </div>
    </template>
  </UiDrawer>
</template>
