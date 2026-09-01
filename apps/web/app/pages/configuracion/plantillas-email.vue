<script setup lang="ts">
// Plantillas de correo — pestaña dual:
//   1. Plantillas Brevo (transaccionales, sync con Brevo)
//   2. Plantillas compositor (flotante, envío manual ad-hoc)
import {
  EMAIL_EVENT_LABELS,
  EMAIL_FIELD_REGISTRY,
  EmailValidationError,
  validateEmailTemplateBody,
  COMPOSITOR_FIELD_REGISTRY,
  validateCompositorBody,
} from '@aquila/shared'
import type { ResultadoPruebaEmail, ResultadoSyncEmail } from '~/stores/plantillasEmail'
import type { PlantillaCompositorItem } from '~/stores/plantillasCompositor'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'settings:manage' })

const tenantStore = useTenantStore()
const plantillasStore = usePlantillasEmailStore()
const compositorStore = usePlantillasCompositorStore()
const toast = useToast()

const pestanaActiva = ref<'brevo' | 'compositor'>('brevo')

await useAsyncData('plantillas-email', async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return []
  return plantillasStore.cargarPlantillas(tenantId)
})

await useAsyncData('plantillas-compositor', async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return []
  return compositorStore.cargarPlantillas(tenantId)
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
    errorGuardar.value = mensajeError(excepcion, 'No se pudo guardar.')
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
    errorSincronizar.value = mensajeError(excepcion, 'No se pudo reintentar la sincronización.')
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
    errorPrevia.value = mensajeError(excepcion, 'No se pudo generar la vista previa.')
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

// ── historial de versiones (PRQ-CAR-021) — solo lectura, "usar" carga el
// texto en el editor pero no guarda: guardar sigue siendo un acto explícito. ──
const historialAbierto = ref(false)
const cargandoHistorial = ref(false)
const errorHistorial = ref<string | null>(null)

function formatoFecha(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })
}

async function abrirHistorial(): Promise<void> {
  const plantillaId = itemActual.value?.id
  if (!plantillaId) return
  errorHistorial.value = null
  historialAbierto.value = true
  cargandoHistorial.value = true
  try {
    await plantillasStore.cargarHistorial(plantillaId)
  } catch (excepcion) {
    errorHistorial.value = mensajeError(excepcion, 'No se pudo cargar el historial.')
  } finally {
    cargandoHistorial.value = false
  }
}

function usarVersion(subject: string, htmlContent: string): void {
  asuntoEditado.value = subject
  cuerpoEditado.value = htmlContent
  historialAbierto.value = false
}

// ── Compositor: editor de plantillas ──────────────────────────────────
const editorCompositorAbierto = ref(false)
const compositorEditandoId = ref<string | null>(null)
const compositorNombre = ref('')
const compositorAsunto = ref('')
const compositorCuerpo = ref('')
const guardandoCompositor = ref(false)
const textareaCompositorEl = ref<HTMLTextAreaElement | null>(null)

const errorValidacionCompositor = computed(() => {
  if (!compositorAsunto.value && !compositorCuerpo.value) return null
  try {
    validateCompositorBody(compositorAsunto.value, compositorCuerpo.value)
    return null
  } catch (e: unknown) {
    return e instanceof Error ? e.message : 'Error de validación'
  }
})

function abrirEditorCompositor(plantilla: PlantillaCompositorItem | null): void {
  if (plantilla) {
    compositorEditandoId.value = plantilla.id
    compositorNombre.value = plantilla.nombre
    compositorAsunto.value = plantilla.asunto
    compositorCuerpo.value = plantilla.cuerpo
  } else {
    compositorEditandoId.value = null
    compositorNombre.value = ''
    compositorAsunto.value = ''
    compositorCuerpo.value = ''
  }
  editorCompositorAbierto.value = true
}

function insertarCampoCompositor(campo: string): void {
  const marcador = `{{ params.${campo} }}`
  const el = textareaCompositorEl.value
  if (!el) {
    compositorCuerpo.value += marcador
    return
  }
  const inicio = el.selectionStart ?? compositorCuerpo.value.length
  const fin = el.selectionEnd ?? compositorCuerpo.value.length
  compositorCuerpo.value = compositorCuerpo.value.slice(0, inicio) + marcador + compositorCuerpo.value.slice(fin)
  nextTick(() => {
    el.focus()
    const posicion = inicio + marcador.length
    el.setSelectionRange(posicion, posicion)
  })
}

async function guardarPlantillaCompositor(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || errorValidacionCompositor.value) return
  guardandoCompositor.value = true
  try {
    await compositorStore.guardar(tenantId, compositorNombre.value, compositorAsunto.value, compositorCuerpo.value)
    editorCompositorAbierto.value = false
    toast.add({ title: 'Plantilla guardada', color: 'success' })
  } catch (excepcion) {
    toast.add({ title: mensajeError(excepcion, 'No se pudo guardar.'), color: 'error' })
  } finally {
    guardandoCompositor.value = false
  }
}

async function togglePlantillaCompositor(plantilla: PlantillaCompositorItem): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  try {
    await compositorStore.toggleActiva(tenantId, plantilla.id, !plantilla.activa)
    toast.add({ title: plantilla.activa ? 'Plantilla desactivada' : 'Plantilla activada', color: 'success' })
  } catch (excepcion) {
    toast.add({ title: mensajeError(excepcion, 'No se pudo cambiar el estado.'), color: 'error' })
  }
}

async function eliminarPlantillaCompositor(plantilla: PlantillaCompositorItem): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  try {
    await compositorStore.eliminar(tenantId, plantilla.id)
    toast.add({ title: 'Plantilla eliminada', color: 'success' })
  } catch (excepcion) {
    toast.add({ title: mensajeError(excepcion, 'No se pudo eliminar.'), color: 'error' })
  }
}
</script>

<template>
  <div class="space-y-4">
    <UiTituloDescripcion clase-descripcion="text-sm text-gray-500 mt-1">
      <template #titulo>
        <h1 class="text-xl font-semibold">Plantillas de correo</h1>
      </template>
      <template #descripcion>
        Copia local de cada plantilla de correo transaccional, sincronizada con Brevo al guardar.
        Editar aquí no requiere despliegue.
      </template>
    </UiTituloDescripcion>

    <!-- Tabs -->
    <div class="flex gap-1 border-b border-neutral-200 dark:border-neutral-700">
      <button
        type="button"
        class="px-4 py-2 text-sm font-medium border-b-2 transition-colors"
        :class="pestanaActiva === 'brevo'
          ? 'border-brand text-brand'
          : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'"
        @click="pestanaActiva = 'brevo'"
      >
        Plantillas Brevo
      </button>
      <button
        type="button"
        class="px-4 py-2 text-sm font-medium border-b-2 transition-colors"
        :class="pestanaActiva === 'compositor'
          ? 'border-brand text-brand'
          : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'"
        @click="pestanaActiva = 'compositor'"
      >
        Plantillas compositor
      </button>
    </div>

    <!-- ═══ Pestaña Brevo ═══ -->
    <template v-if="pestanaActiva === 'brevo'">
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
            <UButton size="xs" variant="soft" color="neutral" :disabled="!itemActual?.id" @click="abrirHistorial">
              Historial{{ itemActual?.version ? ` (v${itemActual.version})` : '' }}
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

    <UModal v-model:open="historialAbierto" title="Historial de versiones" :ui="{ content: 'max-w-2xl' }">
      <template #body>
        <div class="space-y-3">
          <p class="text-xs text-gray-500">
            Cada guardado que cambió el asunto o el HTML queda aquí, para siempre (PRQ-CAR-021).
            "Usar esta versión" la carga en el editor — no guarda nada hasta que hagas clic en "Guardar".
          </p>
          <UAlert v-if="errorHistorial" color="error" variant="soft" :title="errorHistorial" />
          <div v-else-if="cargandoHistorial" class="space-y-2">
            <USkeleton class="h-20 w-full" />
            <USkeleton class="h-20 w-full" />
          </div>
          <p v-else-if="plantillasStore.historial.length === 0" class="text-sm text-gray-400">
            Sin versiones registradas todavía.
          </p>
          <ul v-else class="space-y-2 max-h-96 overflow-y-auto">
            <li
              v-for="v in plantillasStore.historial"
              :key="v.version"
              class="rounded-md border border-gray-200 dark:border-gray-800 px-3 py-2"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="text-xs font-medium">v{{ v.version }} · {{ formatoFecha(v.createdAt) }}</span>
                <UButton size="xs" variant="soft" @click="usarVersion(v.subject, v.htmlContent)">
                  Usar esta versión
                </UButton>
              </div>
              <p class="mt-1 text-sm font-medium">{{ v.subject }}</p>
              <p class="mt-1 text-xs text-gray-500 font-mono line-clamp-3">{{ v.htmlContent }}</p>
            </li>
          </ul>
        </div>
      </template>
      <template #footer>
        <UButton variant="ghost" @click="historialAbierto = false">Cerrar</UButton>
      </template>
    </UModal>
    </template>

    <!-- ═══ Pestaña Compositor ═══ -->
    <template v-else>
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <p class="text-sm text-neutral-500">
            Plantillas para el compositor de correo flotante. Cada plantilla puede ser elegida por cualquier
            usuario al redactar un correo rápido.
          </p>
          <UButton size="sm" variant="soft" @click="abrirEditorCompositor(null)">
            Nueva plantilla
          </UButton>
        </div>

        <div v-if="compositorStore.plantillas.length === 0" class="text-sm text-neutral-500 py-8 text-center">
          Sin plantillas todavía. Crea la primera con "Nueva plantilla".
        </div>

        <div v-else class="space-y-2">
          <div
            v-for="plantilla in compositorStore.plantillas"
            :key="plantilla.id"
            class="flex items-center justify-between gap-3 rounded-md border border-neutral-200 dark:border-neutral-700 px-4 py-3"
          >
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium">{{ plantilla.nombre }}</span>
                <span
                  v-if="plantilla.activa"
                  class="inline-flex items-center rounded-full bg-success-100 dark:bg-success-900/30 px-2 py-0.5 text-[11px] text-success-700 dark:text-success-400"
                >Activa</span>
                <span
                  v-else
                  class="inline-flex items-center rounded-full bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 text-[11px] text-neutral-500"
                >Inactiva</span>
              </div>
              <p class="text-xs text-neutral-500 mt-0.5 truncate">{{ plantilla.asunto }}</p>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <UButton size="xs" variant="ghost" @click="abrirEditorCompositor(plantilla)">Editar</UButton>
              <UButton
                size="xs"
                variant="ghost"
                :color="plantilla.activa ? 'warning' : 'success'"
                @click="togglePlantillaCompositor(plantilla)"
              >
                {{ plantilla.activa ? 'Desactivar' : 'Activar' }}
              </UButton>
              <UButton size="xs" variant="ghost" color="error" @click="eliminarPlantillaCompositor(plantilla)">Eliminar</UButton>
            </div>
          </div>
        </div>
      </div>

      <!-- Editor de plantilla compositor -->
      <UModal v-model:open="editorCompositorAbierto" title="Plantilla compositor" :ui="{ content: 'max-w-2xl' }">
        <template #body>
          <div class="space-y-4">
            <UFormField label="Nombre" name="nombre-compositor">
              <UInput v-model="compositorNombre" placeholder="Ej: Cobro de mora — Primer aviso" />
            </UFormField>
            <UFormField label="Asunto" name="asunto-compositor">
              <UInput v-model="compositorAsunto" placeholder="Asunto del correo (admite {{ params.campo }})" />
            </UFormField>
            <div>
              <p class="text-xs text-neutral-500 mb-1.5">Campos disponibles — clic para insertar</p>
              <div class="flex flex-wrap gap-1.5">
                <UButton
                  v-for="campo in COMPOSITOR_FIELD_REGISTRY"
                  :key="campo.field"
                  size="xs"
                  variant="soft"
                  color="neutral"
                  :title="campo.description"
                  @click="insertarCampoCompositor(campo.field)"
                >
                  {{ campo.field }} · {{ campo.description }}
                </UButton>
              </div>
            </div>
            <div>
              <p class="text-xs text-neutral-500 mb-1">Cuerpo del correo</p>
              <textarea
                ref="textareaCompositorEl"
                v-model="compositorCuerpo"
                rows="12"
                class="w-full rounded-md border border-neutral-300 dark:border-neutral-600 bg-transparent px-3 py-2 text-xs font-mono"
                placeholder="Escribe el mensaje aquí..."
              />
            </div>
            <UAlert v-if="errorValidacionCompositor" color="error" variant="soft" :title="errorValidacionCompositor" />
          </div>
        </template>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" @click="editorCompositorAbierto = false">Cancelar</UButton>
            <UButton :loading="guardandoCompositor" :disabled="!!errorValidacionCompositor" @click="guardarPlantillaCompositor">
              Guardar
            </UButton>
          </div>
        </template>
      </UModal>
    </template>
  </div>
</template>
