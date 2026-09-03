<script setup lang="ts">
/**
 * Compositor de correo — drawer lateral derecho.
 *
 * Se abre desde el acceso directo fijo del sidebar (NavShortcuts).
 * Solo se renderiza si tenants.compositor_correo_activo es true.
 */
import { COMPOSITOR_FIELD_REGISTRY, validateCompositorBody } from '@aquila/shared'

const tenantStore = useTenantStore()
const compositorStore = usePlantillasCompositorStore()
const tercerosStore = useTercerosStore()
const toast = useToast()
const { abierto: panelAbierto } = useCompositorCorreo()

const activo = ref(false)

watch(
  () => tenantStore.activeTenant?.id,
  async (tenantId) => {
    if (!tenantId) {
      activo.value = false
      return
    }
    const cliente = useSupabaseClient()
    const { data, error } = await cliente
      .from('tenants')
      .select('compositor_correo_activo')
      .eq('id', tenantId)
      .single()
    if (!error) activo.value = data.compositor_correo_activo === true
  },
  { immediate: true },
)

const contenedorRef = ref<HTMLElement | null>(null)
const modoDestinatario = ref<'tercero' | 'manual'>('tercero')
const terceroSeleccionadoId = ref<string | null>(null)
const emailManual = ref('')
const plantillaSeleccionada = ref<string | null>(null)
const plantillaSelectorAbierto = ref(false)
const asuntoEditado = ref('')
const cuerpoEditado = ref('')
const enviando = ref(false)
const errorEnvio = ref<string | null>(null)
const exitoEnvio = ref(false)
const confirmandoEnvio = ref(false)

watch(
  () => tenantStore.activeTenant?.id,
  async (tenantId) => {
    if (!tenantId) return
    await Promise.all([
      compositorStore.cargarPlantillas(tenantId),
      tercerosStore.cargarTerceros(tenantId),
    ])
  },
  { immediate: true },
)

const plantillasActivas = computed(() =>
  compositorStore.plantillas.filter((p) => p.activa),
)

const opcionesTerceros = computed(() =>
  tercerosStore.terceros
    .filter((t) => t.email)
    .map((t) => ({ valor: t.id, etiqueta: `${t.nombre_completo ?? t.numero_documento} — ${t.email}` })),
)

const terceroSeleccionado = computed(() =>
  tercerosStore.terceros.find((t) => t.id === terceroSeleccionadoId.value) ?? null,
)

const cargandoCatalogos = computed(() => tercerosStore.loading || compositorStore.loading)

const destinatarioEmailActual = computed(() =>
  modoDestinatario.value === 'tercero' ? (terceroSeleccionado.value?.email ?? '') : emailManual.value,
)
const destinatarioNombreActual = computed(() =>
  modoDestinatario.value === 'tercero'
    ? (terceroSeleccionado.value?.nombre_completo ?? destinatarioEmailActual.value)
    : destinatarioEmailActual.value,
)

function cambiarModoDestinatario(modo: 'tercero' | 'manual'): void {
  modoDestinatario.value = modo
  terceroSeleccionadoId.value = null
  emailManual.value = ''
  confirmandoEnvio.value = false
}

watch([terceroSeleccionadoId, emailManual, plantillaSeleccionada, asuntoEditado, cuerpoEditado], () => {
  confirmandoEnvio.value = false
  exitoEnvio.value = false
  // Sin esto, un error de un envío fallido anterior seguía visible mientras
  // el usuario ya estaba corrigiendo el mensaje — podía apilarse encima del
  // error de validación del intento nuevo, dos alertas rojas por dos envíos
  // distintos en la misma pantalla.
  errorEnvio.value = null
})

const paramsResueltos = computed(() => {
  const params: Record<string, string> = {}
  const now = new Date()
  params.fechaActual = now.toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })
  params.remitenteNombre = tenantStore.activeTenant?.name ?? 'Administración'
  if (destinatarioNombreActual.value) params.nombreDestinatario = destinatarioNombreActual.value
  return params
})

const asuntoPreview = computed(() => {
  if (!asuntoEditado.value) return ''
  return asuntoEditado.value.replace(/\{\{\s*params\.(\w+)\s*\}\}/g, (_m, key: string) => paramsResueltos.value[key] ?? `{{ params.${key} }}`)
})

const cuerpoPreview = computed(() => {
  if (!cuerpoEditado.value) return ''
  return cuerpoEditado.value.replace(/\{\{\s*params\.(\w+)\s*\}\}/g, (_m, key: string) => paramsResueltos.value[key] ?? `{{ params.${key} }}`)
})

const errorValidacion = computed(() => {
  if (!asuntoEditado.value && !cuerpoEditado.value) return null
  try {
    validateCompositorBody(asuntoEditado.value, cuerpoEditado.value)
    return null
  } catch (e: unknown) {
    return e instanceof Error ? e.message : 'Error de validación'
  }
})

const tieneDestinatario = computed(() => destinatarioEmailActual.value.includes('@'))

function seleccionarPlantilla(plantillaId: string | null): void {
  plantillaSeleccionada.value = plantillaId
  if (!plantillaId) {
    asuntoEditado.value = ''
    cuerpoEditado.value = ''
    return
  }
  const plantilla = compositorStore.plantillas.find((p) => p.id === plantillaId)
  if (plantilla) {
    asuntoEditado.value = plantilla.asunto
    cuerpoEditado.value = plantilla.cuerpo
  }
}

function pedirConfirmacion(): void {
  if (!tieneDestinatario.value || errorValidacion.value) return
  confirmandoEnvio.value = true
}

function cancelarConfirmacion(): void {
  confirmandoEnvio.value = false
}

async function enviar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !tieneDestinatario.value || errorValidacion.value) return

  confirmandoEnvio.value = false
  enviando.value = true
  errorEnvio.value = null
  exitoEnvio.value = false

  try {
    const resultado = await compositorStore.enviarCorreo(tenantId, {
      destinatario_email: destinatarioEmailActual.value,
      destinatario_nombre: destinatarioNombreActual.value,
      plantilla_id: plantillaSeleccionada.value ?? undefined,
      asunto: asuntoEditado.value,
      cuerpo: cuerpoEditado.value,
    })

    if (resultado.ok) {
      exitoEnvio.value = true
      toast.add({ title: 'Correo enviado', color: 'success' })
    } else {
      errorEnvio.value = resultado.error ?? 'No se pudo enviar el correo.'
    }
  } catch (e: unknown) {
    errorEnvio.value = e instanceof Error ? e.message : 'Error al enviar el correo.'
  } finally {
    enviando.value = false
  }
}

function prepararNuevoEnvio(): void {
  limpiarFormulario()
}

function cerrarPanel(): void {
  panelAbierto.value = false
  limpiarFormulario()
}

function limpiarFormulario(): void {
  modoDestinatario.value = 'tercero'
  terceroSeleccionadoId.value = null
  emailManual.value = ''
  plantillaSeleccionada.value = null
  asuntoEditado.value = ''
  cuerpoEditado.value = ''
  errorEnvio.value = null
  exitoEnvio.value = false
  confirmandoEnvio.value = false
}
</script>

<template>
  <Teleport to="body">
    <!-- Backdrop -->
    <Transition name="fade">
      <div
        v-if="activo && panelAbierto"
        class="fixed inset-0 z-40 bg-black/40"
        @click="cerrarPanel"
      />
    </Transition>

    <!-- Drawer -->
    <Transition name="drawer">
      <div
        v-if="activo && panelAbierto"
        ref="contenedorRef"
        class="fixed top-0 right-0 bottom-0 z-50 w-[560px] max-w-[calc(100vw-1.5rem)] bg-default border-l border-neutral-200 dark:border-neutral-700 shadow-lg flex flex-col"
      >
        <!-- Header -->
        <div class="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-700 shrink-0">
          <h3 class="text-base font-semibold">Compositor de correo</h3>
          <UButton
            icon="i-lucide-x"
            size="xs"
            color="neutral"
            variant="ghost"
            aria-label="Cerrar compositor de correo"
            @click="cerrarPanel"
          />
        </div>

        <!-- Body -->
        <div class="flex-1 overflow-y-auto p-4 space-y-3">
          <template v-if="cargandoCatalogos">
            <USkeleton class="h-16 w-full" />
            <USkeleton class="h-8 w-full" />
          </template>
          <template v-else>
            <!-- Destinatario -->
            <div>
              <UButtonGroup size="xs" class="mb-1.5" aria-label="Modo de destinatario">
                <UButton
                  :color="modoDestinatario === 'tercero' ? 'primary' : 'neutral'"
                  :variant="modoDestinatario === 'tercero' ? 'solid' : 'outline'"
                  :aria-pressed="modoDestinatario === 'tercero'"
                  @click="cambiarModoDestinatario('tercero')"
                >
                  Tercero
                </UButton>
                <UButton
                  :color="modoDestinatario === 'manual' ? 'primary' : 'neutral'"
                  :variant="modoDestinatario === 'manual' ? 'solid' : 'outline'"
                  :aria-pressed="modoDestinatario === 'manual'"
                  @click="cambiarModoDestinatario('manual')"
                >
                  Correo manual
                </UButton>
              </UButtonGroup>
              <!-- El grupo de modo vive fuera de UFormField a propósito: "Para"
                   debe asociarse solo con el control real (selector/input), no
                   con los botones de modo — de lo contrario un lector de
                   pantalla anuncia el label sobre contenido que no es el campo. -->
              <UFormField label="Para" name="destinatario">
                <UiSelectorBuscable
                  v-if="modoDestinatario === 'tercero'"
                  v-model="terceroSeleccionadoId"
                  :opciones="opcionesTerceros"
                  :deshabilitado="enviando"
                  placeholder="Buscar tercero por nombre..."
                />
                <UInput
                  v-else
                  v-model="emailManual"
                  type="email"
                  :disabled="enviando"
                  placeholder="correo@ejemplo.com"
                />
              </UFormField>
            </div>

            <!-- Plantilla -->
            <UFormField label="Plantilla" name="plantilla">
              <USelect
                :model-value="plantillaSeleccionada"
                :items="[
                  { label: 'Sin plantilla (texto libre)', value: null },
                  ...plantillasActivas.map((p) => ({ label: p.nombre, value: p.id })),
                ]"
                value-key="value"
                :disabled="enviando"
                @update:open="plantillaSelectorAbierto = $event"
                @update:model-value="seleccionarPlantilla"
              />
            </UFormField>
          </template>

          <!-- Asunto -->
          <UFormField label="Asunto" name="asunto">
            <UInput v-model="asuntoEditado" :disabled="enviando" placeholder="Asunto del correo..." />
          </UFormField>

          <!-- Cuerpo -->
          <UFormField label="Cuerpo" name="cuerpo">
            <UTextarea
              v-model="cuerpoEditado"
              :rows="8"
              :disabled="enviando"
              class="w-full font-mono"
              placeholder="Escribe tu mensaje aquí. Usa {{ params.nombreDestinatario }} para personalizar..."
            />
          </UFormField>

          <!-- Campos disponibles -->
          <div>
            <p class="text-xs text-neutral-500 mb-1">Campos disponibles — clic para insertar</p>
            <div class="flex flex-wrap gap-1">
              <UButton
                v-for="campo in COMPOSITOR_FIELD_REGISTRY"
                :key="campo.field"
                size="xs"
                color="neutral"
                variant="soft"
                :title="campo.description"
                :aria-label="`Insertar campo ${campo.field}: ${campo.description}`"
                @click="cuerpoEditado += `{{ params.${campo.field} }}`"
              >
                {{ campo.field }}
              </UButton>
            </div>
          </div>

          <!-- Error de validación -->
          <UAlert v-if="errorValidacion" color="error" variant="soft" :title="errorValidacion" />

          <!-- Error de envío -->
          <UAlert v-if="errorEnvio" color="error" variant="soft" :title="errorEnvio" />

          <!-- Éxito -->
          <UAlert v-if="exitoEnvio" color="success" variant="soft" title="Correo enviado correctamente." />

          <!-- Preview -->
          <details v-if="asuntoEditado || cuerpoEditado" class="group">
            <summary class="text-xs text-neutral-500 cursor-pointer hover:text-neutral-700 dark:hover:text-neutral-300">
              Vista previa
            </summary>
            <div class="mt-2 rounded-md border border-neutral-200 dark:border-neutral-700 p-3 text-sm">
              <p class="font-medium mb-1">{{ asuntoPreview || '(sin asunto)' }}</p>
              <div class="text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap text-xs">{{ cuerpoPreview }}</div>
            </div>
          </details>
        </div>

        <!-- Footer -->
        <div class="flex items-center justify-end gap-2 px-4 py-3 border-t border-neutral-200 dark:border-neutral-700 shrink-0">
          <template v-if="exitoEnvio">
            <UButton variant="outline" color="neutral" size="sm" @click="prepararNuevoEnvio">Enviar otro</UButton>
            <UButton color="primary" size="sm" @click="cerrarPanel">Cerrar</UButton>
          </template>
          <template v-else-if="confirmandoEnvio">
            <p class="text-sm text-neutral-500 mr-auto">
              ¿Enviar a <span class="font-medium text-neutral-700 dark:text-neutral-300">{{ destinatarioEmailActual }}</span>?
            </p>
            <UButton variant="outline" color="neutral" size="sm" @click="cancelarConfirmacion">Volver</UButton>
            <UButton color="primary" size="sm" :loading="enviando" @click="enviar">Confirmar envío</UButton>
          </template>
          <template v-else>
            <UButton variant="ghost" size="sm" @click="cerrarPanel">Cancelar</UButton>
            <UButton
              size="sm"
              :disabled="!tieneDestinatario || !!errorValidacion"
              @click="pedirConfirmacion"
            >
              Enviar correo
            </UButton>
          </template>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.drawer-enter-active,
.drawer-leave-active {
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.drawer-enter-from,
.drawer-leave-to {
  transform: translateX(100%);
}
</style>
