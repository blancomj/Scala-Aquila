<script setup lang="ts">
// Plantillas de correo (Brevo) — editor por evento, spec del módulo (§11):
// dos columnas (lista a la izquierda, editor a la derecha), insignia de
// sincronización siempre visible, botón de reintento solo si is_synced=0,
// chips que insertan {{ params.campo }} completo, vista previa en diálogo
// con overrides editables e iframe sandbox, editor <textarea> monoespaciado.
import {
  EMAIL_EVENT_LABELS,
  EMAIL_FIELD_REGISTRY,
  EmailValidationError,
  validateEmailTemplateBody,
} from '@aquila/shared'
import type { ResultadoPruebaEmail, ResultadoSyncEmail } from '~/stores/plantillasEmail'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'settings:manage' })

const tenantStore = useTenantStore()
const plantillasStore = usePlantillasEmailStore()

await useAsyncData('plantillas-email', async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return []
  return plantillasStore.cargarPlantillas(tenantId)
})

const eventos = computed(() => plantillasStore.plantillas.map((p) => p.eventType))
const eventoSeleccionado = ref<string>(eventos.value[0] ?? '')

const itemActual = computed(
  () => plantillasStore.plantillas.find((p) => p.eventType === eventoSeleccionado.value) ?? null,
)
const camposEvento = computed(() => EMAIL_FIELD_REGISTRY[eventoSeleccionado.value] ?? [])
const sampleMap = computed(() =>
  Object.fromEntries(camposEvento.value.map((f) => [f.field, f.sample])),
)

// Se resincroniza al cambiar de evento — no en cada refresh del store (que
// ocurre tras guardar/sincronizar), para no pisar lo que el admin escribe.
const asuntoEditado = ref('')
const cuerpoEditado = ref('')
watch(
  eventoSeleccionado,
  () => {
    asuntoEditado.value = itemActual.value?.subject ?? ''
    cuerpoEditado.value = itemActual.value?.htmlContent ?? ''
  },
  { immediate: true },
)

const textareaEl = ref<HTMLTextAreaElement | null>(null)

function insertarCampo(campo: string): void {
  const marcador = `{{ params.${campo} }}`
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

const errorValidacion = computed<string | null>(() => {
  try {
    validateEmailTemplateBody(eventoSeleccionado.value, asuntoEditado.value, cuerpoEditado.value)
    return null
  } catch (e) {
    return e instanceof EmailValidationError ? e.message : 'Contenido inválido.'
  }
})

// ── guardar ──────────────────────────────────────────────────────────────
const guardando = ref(false)
const errorGuardar = ref<string | null>(null)
const resultadoGuardar = ref<ResultadoSyncEmail | null>(null)

async function guardar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || errorValidacion.value) return
  errorGuardar.value = null
  resultadoGuardar.value = null
  guardando.value = true
  try {
    resultadoGuardar.value = await plantillasStore.guardar(
      tenantId,
      eventoSeleccionado.value,
      asuntoEditado.value,
      cuerpoEditado.value,
    )
  } catch (excepcion) {
    errorGuardar.value = excepcion instanceof Error ? excepcion.message : 'No se pudo guardar.'
  } finally {
    guardando.value = false
  }
}

// ── reintentar sincronización — solo visible cuando is_synced=false ──────
const sincronizando = ref(false)
const errorSincronizar = ref<string | null>(null)

async function reintentarSincronizacion(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  errorSincronizar.value = null
  resultadoGuardar.value = null
  sincronizando.value = true
  try {
    resultadoGuardar.value = await plantillasStore.sincronizar(tenantId, eventoSeleccionado.value)
  } catch (excepcion) {
    errorSincronizar.value =
      excepcion instanceof Error ? excepcion.message : 'No se pudo reintentar la sincronización.'
  } finally {
    sincronizando.value = false
  }
}

// ── vista previa — diálogo, overrides editables ───────────────────────────
const dialogoAbierto = ref(false)
const overridesPrevia = ref<Record<string, string>>({})
const previa = ref<ResultadoPruebaEmail | null>(null)
const cargandoPrevia = ref(false)
const errorPrevia = ref<string | null>(null)

const previaSrcdoc = computed(() => previa.value?.html ?? '')

async function generarPrevia(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  errorPrevia.value = null
  cargandoPrevia.value = true
  try {
    previa.value = await plantillasStore.probar(
      tenantId,
      eventoSeleccionado.value,
      asuntoEditado.value,
      cuerpoEditado.value,
      overridesPrevia.value,
    )
  } catch (excepcion) {
    errorPrevia.value = excepcion instanceof Error ? excepcion.message : 'No se pudo generar la vista previa.'
  } finally {
    cargandoPrevia.value = false
  }
}

function abrirPrevia(): void {
  overridesPrevia.value = { ...sampleMap.value }
  previa.value = null
  errorPrevia.value = null
  dialogoAbierto.value = true
  void generarPrevia()
}
</script>

<template>
  <div class="space-y-4">
    <div>
      <h1 class="text-xl font-semibold mb-2">Plantillas de correo</h1>
      <p class="text-sm text-gray-500">
        Copia local de cada plantilla de correo transaccional, sincronizada con Brevo al guardar.
        Editar aquí no requiere despliegue.
      </p>
    </div>

    <div class="flex gap-6 items-start">
      <!-- ── columna izquierda: lista ── -->
      <div class="w-64 shrink-0 border border-gray-200 dark:border-gray-800 rounded-md divide-y divide-gray-200 dark:divide-gray-800">
        <button
          v-for="item in plantillasStore.plantillas"
          :key="item.eventType"
          type="button"
          class="w-full text-left px-3 py-2.5 text-sm flex items-center justify-between gap-2"
          :class="
            item.eventType === eventoSeleccionado
              ? 'bg-gray-100 dark:bg-gray-800 font-medium'
              : 'hover:bg-gray-50 dark:hover:bg-gray-900'
          "
          @click="eventoSeleccionado = item.eventType"
        >
          <span>{{ EMAIL_EVENT_LABELS[item.eventType] ?? item.eventType }}</span>
          <span
            v-if="item.isSynced === true"
            class="text-success shrink-0"
            title="Sincronizado con Brevo"
          >✓</span>
          <span
            v-else-if="item.isSynced === false"
            class="text-warning shrink-0"
            title="Sin sincronizar con Brevo"
          >⚠</span>
          <span v-else class="text-gray-400 shrink-0" title="Sin guardar todavía">—</span>
        </button>
      </div>

      <!-- ── columna derecha: editor ── -->
      <div class="flex-1 min-w-0 space-y-4">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <h2 class="text-base font-medium">{{ EMAIL_EVENT_LABELS[eventoSeleccionado] ?? eventoSeleccionado }}</h2>
            <span
              v-if="itemActual?.isSynced === true"
              class="inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-xs text-success"
            >✓ Sincronizado</span>
            <span
              v-else-if="itemActual?.isSynced === false"
              class="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs text-warning"
            >⚠ Sin sincronizar</span>
            <span
              v-else
              class="inline-flex items-center gap-1 rounded-full border border-gray-300 dark:border-gray-700 px-2 py-0.5 text-xs text-gray-500"
            >Sin guardar</span>
          </div>
          <div class="flex items-center gap-2">
            <UButton
              v-if="itemActual?.isSynced === false"
              size="xs"
              variant="soft"
              color="warning"
              :loading="sincronizando"
              @click="reintentarSincronizacion"
            >
              Reintentar sincronización
            </UButton>
            <UButton size="xs" variant="soft" :disabled="!!errorValidacion" @click="abrirPrevia">
              Vista previa
            </UButton>
            <UButton size="xs" :disabled="!!errorValidacion" :loading="guardando" @click="guardar">
              Guardar
            </UButton>
          </div>
        </div>
        <UAlert v-if="errorSincronizar" color="error" variant="soft" :title="errorSincronizar" />

        <UFormField label="Asunto" name="asunto">
          <UInput v-model="asuntoEditado" class="w-full" placeholder="Tu saldo pendiente en {{ params.inmueble }}" />
        </UFormField>

        <div>
          <p class="text-xs text-gray-500 mb-1.5">Campos disponibles — clic para insertar</p>
          <div class="flex flex-wrap gap-1.5">
            <UButton
              v-for="campo in camposEvento"
              :key="campo.field"
              size="xs"
              variant="soft"
              color="neutral"
              :title="campo.description"
              @click="insertarCampo(campo.field)"
            >
              {{ campo.field }} · {{ campo.description }}
            </UButton>
          </div>
        </div>

        <div>
          <p class="text-xs text-gray-500 mb-1">HTML del correo</p>
          <textarea
            ref="textareaEl"
            v-model="cuerpoEditado"
            rows="16"
            class="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-3 py-2 text-xs font-mono"
            placeholder="<!DOCTYPE html>…"
          />
          <UAlert v-if="errorValidacion" color="error" variant="soft" :title="errorValidacion" class="mt-2" />
        </div>

        <div class="flex items-center justify-end gap-2">
          <UAlert v-if="errorGuardar" color="error" variant="soft" :title="errorGuardar" class="mr-auto" />
          <UAlert
            v-else-if="resultadoGuardar?.saved && resultadoGuardar.synced"
            color="success"
            variant="soft"
            title="Plantilla guardada y sincronizada."
            class="mr-auto"
          />
          <UAlert
            v-else-if="resultadoGuardar?.saved && !resultadoGuardar.synced"
            color="warning"
            variant="soft"
            :title="`Se guardó localmente, pero no se pudo sincronizar: ${resultadoGuardar.error ?? 'motivo desconocido'}`"
            class="mr-auto"
          />
        </div>
      </div>
    </div>

    <UModal v-model:open="dialogoAbierto" title="Vista previa" :ui="{ content: 'max-w-3xl' }">
      <template #body>
        <div class="space-y-3">
          <div>
            <p class="text-xs text-gray-500 mb-1.5">Datos de ejemplo — edita y regenera</p>
            <div class="grid grid-cols-2 gap-2">
              <UFormField v-for="campo in camposEvento" :key="campo.field" :label="campo.description" size="xs">
                <UInput v-model="overridesPrevia[campo.field]" size="xs" class="w-full" />
              </UFormField>
            </div>
            <UButton size="xs" variant="soft" class="mt-2" :loading="cargandoPrevia" @click="generarPrevia">
              Regenerar
            </UButton>
          </div>
          <UAlert v-if="errorPrevia" color="error" variant="soft" :title="errorPrevia" />
          <template v-else-if="previa">
            <div>
              <p class="text-xs text-gray-500 mb-1">Asunto</p>
              <p class="text-sm font-medium border border-gray-200 dark:border-gray-800 rounded-md px-3 py-2">
                {{ previa.subject }}
              </p>
            </div>
            <div>
              <p class="text-xs text-gray-500 mb-1">Cuerpo</p>
              <iframe
                :srcdoc="previaSrcdoc"
                sandbox="allow-same-origin"
                class="w-full h-96 border border-gray-200 dark:border-gray-800 rounded-md bg-white"
              />
            </div>
          </template>
        </div>
      </template>
      <template #footer>
        <UButton variant="ghost" @click="dialogoAbierto = false">Cerrar</UButton>
      </template>
    </UModal>
  </div>
</template>
