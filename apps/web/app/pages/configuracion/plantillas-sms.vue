<script setup lang="ts">
// Plantillas SMS — editor por evento, mockup del spec del módulo (§10):
// selector de evento arriba (no tabs, un evento a la vez), chips que
// insertan en el cursor, contador de segmentos en vivo, vista previa,
// envío de prueba, interruptor que guarda al instante.
import {
  calculateSmsSegments,
  renderSmsTemplate,
  SMS_EVENT_LABELS,
  SMS_EVENT_RECIPIENTS,
  SMS_FIELD_REGISTRY,
  SMS_RECIPIENT_LABELS,
  SmsValidationError,
  validateSmsTemplateBody,
} from '@aquila/shared'
import type { ResultadoPruebaSms } from '~/stores/plantillasSms'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'settings:manage' })

const tenantStore = useTenantStore()
const plantillasStore = usePlantillasSmsStore()

await useAsyncData('plantillas-sms', async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return []
  return plantillasStore.cargarPlantillas(tenantId)
})

const eventos = computed(() => Object.keys(SMS_FIELD_REGISTRY))
const eventoSeleccionado = ref<string>(eventos.value[0] ?? '')

const opcionesEvento = computed(() =>
  eventos.value.map((eventType) => ({
    label: SMS_EVENT_LABELS[eventType] ?? eventType,
    value: eventType,
  })),
)

const itemActual = computed(
  () => plantillasStore.plantillas.find((p) => p.eventType === eventoSeleccionado.value) ?? null,
)

const camposEvento = computed(() => SMS_FIELD_REGISTRY[eventoSeleccionado.value] ?? [])
const destinatario = computed(() => {
  const tipo = SMS_EVENT_RECIPIENTS[eventoSeleccionado.value]
  return tipo ? SMS_RECIPIENT_LABELS[tipo] : '—'
})
const sampleMap = computed(() =>
  Object.fromEntries(camposEvento.value.map((f) => [f.field, f.sample])),
)

// Se resincroniza al cambiar de evento — no en cada refresh del store (que
// ocurre tras guardar/activar), para no pisar lo que el admin está escribiendo.
const cuerpoEditado = ref('')
watch(
  eventoSeleccionado,
  () => {
    cuerpoEditado.value = itemActual.value?.cuerpo ?? ''
  },
  { immediate: true },
)

const textareaEl = ref<HTMLTextAreaElement | null>(null)

function insertarCampo(campo: string): void {
  const marcador = `{${campo}}`
  const el = textareaEl.value
  if (!el) {
    cuerpoEditado.value += marcador
    return
  }
  const inicio = el.selectionStart ?? cuerpoEditado.value.length
  const fin = el.selectionEnd ?? cuerpoEditado.value.length
  cuerpoEditado.value = cuerpoEditado.value.slice(0, inicio) + marcador + cuerpoEditado.value.slice(fin)
  nextTick(() => {
    el.focus()
    const posicion = inicio + marcador.length
    el.setSelectionRange(posicion, posicion)
  })
}

const vistaPrevia = computed(() => renderSmsTemplate(cuerpoEditado.value, sampleMap.value))
const segmentos = computed(() => calculateSmsSegments(vistaPrevia.value))

const errorValidacion = computed<string | null>(() => {
  try {
    validateSmsTemplateBody(eventoSeleccionado.value, cuerpoEditado.value)
    return null
  } catch (e) {
    return e instanceof SmsValidationError ? e.message : 'Texto inválido.'
  }
})

// ── guardar ──────────────────────────────────────────────────────────
const guardando = ref(false)
const errorGuardar = ref<string | null>(null)

async function guardar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || errorValidacion.value) return
  errorGuardar.value = null
  guardando.value = true
  try {
    await plantillasStore.guardar(tenantId, eventoSeleccionado.value, cuerpoEditado.value)
  } catch (excepcion) {
    errorGuardar.value = mensajeError(excepcion, 'No se pudo guardar.')
  } finally {
    guardando.value = false
  }
}

// ── interruptor — al instante, acción independiente de "Guardar" ──────
const cambiandoInterruptor = ref(false)
const errorInterruptor = ref<string | null>(null)

async function cambiarInterruptor(activo: boolean): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  errorInterruptor.value = null
  cambiandoInterruptor.value = true
  try {
    await plantillasStore.toggle(tenantId, eventoSeleccionado.value, activo)
  } catch (excepcion) {
    errorInterruptor.value = mensajeError(excepcion, 'No se pudo cambiar el interruptor.')
  } finally {
    cambiandoInterruptor.value = false
  }
}

// ── prueba de envío ─────────────────────────────────────────────────────
const telefonoPrueba = ref('')
const probando = ref(false)
const resultadoPrueba = ref<ResultadoPruebaSms | null>(null)
const errorPrueba = ref<string | null>(null)

async function probarEnvio(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || errorValidacion.value || !telefonoPrueba.value) return
  errorPrueba.value = null
  resultadoPrueba.value = null
  probando.value = true
  try {
    resultadoPrueba.value = await plantillasStore.probar(
      tenantId,
      eventoSeleccionado.value,
      cuerpoEditado.value,
      telefonoPrueba.value,
    )
  } catch (excepcion) {
    errorPrueba.value = mensajeError(excepcion, 'No se pudo enviar la prueba.')
  } finally {
    probando.value = false
  }
}
</script>

<template>
  <div class="space-y-6 max-w-2xl">
    <div>
      <h1 class="text-xl font-semibold mb-2">Plantillas SMS</h1>
      <p class="text-sm text-gray-500">
        Texto de cada SMS transaccional que envía la plataforma, por evento de cartera. Cambiar el
        texto aquí no requiere despliegue.
      </p>
    </div>

    <div class="flex items-end gap-4">
      <UFormField label="Proceso" name="evento" class="flex-1">
        <USelect v-model="eventoSeleccionado" :items="opcionesEvento" value-key="value" class="w-full" />
      </UFormField>
      <div class="flex items-center gap-2 pb-1.5">
        <span class="text-sm text-gray-500">Evento activo</span>
        <USwitch
          :model-value="itemActual?.activo === true"
          :disabled="!itemActual?.isActive || !itemActual?.cuerpo || cambiandoInterruptor"
          @update:model-value="cambiarInterruptor"
        />
      </div>
    </div>
    <p class="text-xs text-gray-500 -mt-4">Destinatario: {{ destinatario }}</p>
    <p v-if="itemActual && !itemActual.cuerpo" class="text-xs text-gray-500 -mt-4">
      Guarda el texto antes de poder activar el envío de este evento.
    </p>
    <UAlert v-if="errorInterruptor" color="error" variant="soft" :title="errorInterruptor" />

    <div>
      <p class="text-xs text-gray-500 mb-1.5">Campos disponibles — clic para insertar</p>
      <div class="flex flex-wrap gap-1.5">
        <UButton
          v-for="campo in camposEvento"
          :key="campo.field"
          size="xs"
          variant="soft"
          color="neutral"
          @click="insertarCampo(campo.field)"
        >
          {{ '{' + campo.field + '}' }}
        </UButton>
      </div>
    </div>

    <div>
      <textarea
        ref="textareaEl"
        v-model="cuerpoEditado"
        rows="4"
        class="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-3 py-2 text-sm"
        placeholder="Escribe el texto del SMS…"
      />
      <div class="flex items-center gap-2 mt-1 text-xs">
        <span
          :class="segmentos.segments > 1 ? 'text-error font-medium' : 'text-gray-500'"
        >
          {{ vistaPrevia.length }} caracteres · {{ segmentos.segments }}
          {{ segmentos.segments === 1 ? 'segmento' : 'segmentos' }} · {{ segmentos.encoding }}
        </span>
      </div>
      <UAlert v-if="errorValidacion" color="error" variant="soft" :title="errorValidacion" class="mt-2" />
    </div>

    <div>
      <p class="text-xs text-gray-500 mb-1">Vista previa con datos de ejemplo</p>
      <p class="text-sm rounded-md border border-gray-200 dark:border-gray-800 px-3 py-2 bg-gray-50 dark:bg-gray-900">
        {{ vistaPrevia }}
      </p>
    </div>

    <div class="border-t border-gray-200 dark:border-gray-800 pt-4 space-y-2">
      <p class="text-xs text-gray-500">Envía el texto actual (sin guardar) a este número.</p>
      <div class="flex items-center gap-2">
        <UInput v-model="telefonoPrueba" placeholder="+573001234567" class="w-48" />
        <UButton
          variant="soft"
          :disabled="!!errorValidacion || !telefonoPrueba"
          :loading="probando"
          @click="probarEnvio"
        >
          Probar
        </UButton>
      </div>
      <UAlert
        v-if="resultadoPrueba && !resultadoPrueba.success"
        color="error"
        variant="soft"
        :title="resultadoPrueba.errorMessage ?? 'No se pudo enviar.'"
      />
      <UAlert
        v-else-if="resultadoPrueba?.success"
        color="success"
        variant="soft"
        :title="`Enviado — ${resultadoPrueba.segmentsUsed} segmento(s).`"
      />
      <UAlert v-if="errorPrueba" color="error" variant="soft" :title="errorPrueba" />
    </div>

    <div class="flex items-center justify-end gap-2">
      <UAlert v-if="errorGuardar" color="error" variant="soft" :title="errorGuardar" class="mr-auto" />
      <UButton :disabled="!!errorValidacion" :loading="guardando" @click="guardar">
        Guardar plantilla
      </UButton>
    </div>
  </div>
</template>
