<script setup lang="ts">
/**
 * EXS-3 · Adjuntos de un anuncio.
 *
 * `documentos.anuncio_id` existe desde la migración del corte, pero nadie
 * podía escribirla ni la leía nadie: no hay policy INSERT para
 * `authenticated` en `documentos` (SEC-14), toda subida pasa por la Edge
 * Function `subir-documento`, y esa función no conocía el parámetro. Esta
 * pantalla y `20260933720000` cierran las dos mitades.
 *
 * NO se reutiliza `UiLibreriaDocumentos`: aquella está construida sobre el
 * versionado —muestra "próxima versión", y subir del mismo tipo reemplaza
 * lo anterior—, y aquí ocurre lo contrario. La convocatoria y el
 * presupuesto anexo son dos documentos, no dos versiones de uno, así que
 * `subir-documento` no los agrupa. Meter ambos comportamientos en un
 * componente con una bandera lo volvería más difícil de leer que tener dos.
 *
 * Adjuntar solo se ofrece mientras el anuncio no se haya publicado. La
 * autorización real es del guard —ocultar un control no autoriza nada
 * (EXS-1 §4)—, así que el error de la base se muestra tal cual si llega.
 */
import type { Database } from '@aquila/shared'

const props = defineProps<{
  anuncioId: string
  /** Estado del anuncio. Con `publicado`, `archivado` o `cancelado` la sección
   *  queda en solo lectura: lo publicado no se reescribe. */
  estado: string
}>()

const tenantStore = useTenantStore()
const documentosStore = useDocumentosStore()
const catalogosStore = useCatalogosStore()

const MIME_PERMITIDOS = new Set(['application/pdf', 'image/jpeg', 'image/png'])
const TAMANO_MAXIMO = 15 * 1024 * 1024
const ESTADOS_CONGELADOS = new Set(['publicado', 'archivado', 'cancelado'])

type Adjunto = { id: string; nombre: string; tipo: string; tamano: number | null; storagePath: string }

const adjuntos = ref<Adjunto[]>([])
const tiposDocumento = shallowRef<Database['public']['Tables']['lista_tipos']['Row'][]>([])
const tipoSeleccionado = ref<number | null>(null)
const archivoSeleccionado = ref<File | null>(null)
const error = ref<string | null>(null)
const descargando = ref<string | null>(null)

const editable = computed(() => !ESTADOS_CONGELADOS.has(props.estado))

const opcionesTipo = computed(() =>
  tiposDocumento.value.map((t) => ({ valor: t.id, etiqueta: t.nombre })),
)

function nombreTipo(id: number | null): string {
  return tiposDocumento.value.find((t) => t.id === id)?.nombre ?? 'Documento'
}

function formatearTamano(bytes: number | null): string {
  if (!bytes) return '—'
  const kb = bytes / 1024
  return kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb / 1024).toFixed(1)} MB`
}

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  const filas = await documentosStore.cargarAdjuntosAnuncio(tenantId, props.anuncioId)
  adjuntos.value = filas.map((f) => ({
    id: f.id!,
    nombre: f.nombre_archivo ?? 'documento',
    tipo: nombreTipo(f.tipo_documento_id),
    tamano: f.tamano_bytes,
    storagePath: f.storage_path!,
  }))
}

onMounted(async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (tenantId) {
    const valores = await catalogosStore.cargarValores(tenantId)
    tiposDocumento.value = valores.filter((v) => v.tipo === 'TIPO_DOCUMENTO')
    // Un adjunto de anuncio suele ser un anexo suelto; el catálogo específico
    // está ahí para quien sepa que es un acta o un reglamento.
    tipoSeleccionado.value = tiposDocumento.value.find((t) => t.codigo === 'otro_documento')?.id ?? null
  }
  await cargar()
})

function elegirArchivo(evento: Event): void {
  const input = evento.target as HTMLInputElement
  const archivo = input.files?.[0] ?? null
  error.value = null
  if (archivo && (!MIME_PERMITIDOS.has(archivo.type) || archivo.size > TAMANO_MAXIMO)) {
    error.value = 'Solo PDF, JPG o PNG, hasta 15 MB.'
    archivoSeleccionado.value = null
    input.value = ''
    return
  }
  archivoSeleccionado.value = archivo
}

async function subir(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !archivoSeleccionado.value || tipoSeleccionado.value === null) return
  error.value = null
  try {
    await documentosStore.subirDocumento({
      tenantId,
      inmuebleId: null,
      tipoDocumentoId: tipoSeleccionado.value,
      archivo: archivoSeleccionado.value,
      anuncioId: props.anuncioId,
    })
    archivoSeleccionado.value = null
    await cargar()
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo adjuntar el documento.')
  }
}

async function descargar(storagePath: string): Promise<void> {
  descargando.value = storagePath
  try {
    // El bucket es privado: la URL se firma en el momento y dura poco.
    const url = await documentosStore.urlDescarga(storagePath)
    window.open(url, '_blank', 'noopener')
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo abrir el documento.')
  } finally {
    descargando.value = null
  }
}
</script>

<template>
  <section class="space-y-2">
    <h2 class="text-sm font-medium">Adjuntos</h2>

    <p v-if="adjuntos.length === 0" class="text-sm text-neutral-500">
      Este anuncio no tiene documentos adjuntos.
    </p>
    <ul v-else class="space-y-1">
      <li
        v-for="d in adjuntos"
        :key="d.id"
        class="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 dark:border-neutral-800 px-3 py-2"
      >
        <div class="min-w-0">
          <p class="text-sm truncate">{{ d.nombre }}</p>
          <p class="text-xs text-neutral-500">{{ d.tipo }} · {{ formatearTamano(d.tamano) }}</p>
        </div>
        <UButton
          size="xs"
          variant="ghost"
          :loading="descargando === d.storagePath"
          @click="descargar(d.storagePath)"
        >
          Abrir
        </UButton>
      </li>
    </ul>

    <p v-if="error" class="text-sm text-red-600 dark:text-red-400">{{ error }}</p>

    <div v-if="editable" class="space-y-2 pt-1 max-w-md">
      <UFormField label="Tipo de documento">
        <UiSelectorBuscable
          v-model="tipoSeleccionado"
          :opciones="opcionesTipo"
          placeholder="Selecciona el tipo"
        />
      </UFormField>
      <UFormField label="Añadir un adjunto" help="PDF, JPG o PNG, hasta 15 MB.">
        <input type="file" accept="application/pdf,image/jpeg,image/png" @change="elegirArchivo" >
      </UFormField>
      <UButton
        size="xs"
        :disabled="!archivoSeleccionado || tipoSeleccionado === null"
        :loading="documentosStore.subiendo"
        @click="subir"
      >
        Adjuntar
      </UButton>
    </div>
    <p v-else class="text-xs text-neutral-500">
      Un anuncio publicado ya no admite adjuntos: lleva consecutivo y lo que se comunicó no se
      reescribe. Si hace falta añadir algo, redacta otro anuncio.
    </p>
  </section>
</template>
