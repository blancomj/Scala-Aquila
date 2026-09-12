<script setup lang="ts">
/**
 * Galería de documentos de un alcance que admite VARIOS — adjuntos de un
 * anuncio (EXS-3), fotos de una ficha del directorio (EXS-4).
 *
 * NO es `UiLibreriaDocumentos`, y la diferencia es de fondo, no de estilo:
 * aquella está construida sobre el versionado —muestra "próxima versión" y
 * subir del mismo tipo reemplaza lo anterior—, mientras que aquí subir
 * añade. La convocatoria y el presupuesto anexo son dos documentos, no dos
 * versiones de uno, y el logo y la foto del local conviven. `subir-documento`
 * trata así estos alcances a propósito. Meter los dos comportamientos en un
 * componente con una bandera lo haría más difícil de leer que tener dos.
 *
 * La autorización real es del guard y de la RLS: ocultar el formulario no
 * autoriza nada (EXS-1 §4), así que si la base rechaza algo, su mensaje se
 * muestra tal cual en vez de traducirlo a un "no permitido" genérico.
 */
import type { Database } from '@aquila/shared'

const props = defineProps<{
  /** Exactamente uno de los dos. Decide contra qué alcance se sube y se lee. */
  anuncioId?: string
  perfilId?: string
  titulo?: string
  /** Con `false` la sección queda en solo lectura y se muestra `motivoBloqueo`. */
  editable?: boolean
  motivoBloqueo?: string
  vacio?: string
}>()

const tenantStore = useTenantStore()
const documentosStore = useDocumentosStore()
const catalogosStore = useCatalogosStore()

const MIME_PERMITIDOS = new Set(['application/pdf', 'image/jpeg', 'image/png'])
const TAMANO_MAXIMO = 15 * 1024 * 1024

type Item = { id: string; nombre: string; tipo: string; tamano: number | null; storagePath: string }

const items = ref<Item[]>([])
const tiposDocumento = shallowRef<Database['public']['Tables']['lista_tipos']['Row'][]>([])
const tipoSeleccionado = ref<number | null>(null)
const archivoSeleccionado = ref<File | null>(null)
const error = ref<string | null>(null)
const descargando = ref<string | null>(null)

const puedeEditar = computed(() => props.editable !== false)

const opcionesTipo = computed(() =>
  tiposDocumento.value.map((t) => ({ valor: t.id, etiqueta: t.nombre })),
)

function nombreTipo(id: number | null): string {
  return tiposDocumento.value.find((t) => t.id === id)?.nombre ?? 'Documento'
}

/** Bajo 1 KB se muestran los bytes: un "0 KB" en un archivo que sí existe
 *  se lee como si la subida hubiera fallado. */
function formatearTamano(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${String(bytes)} B`
  const kb = bytes / 1024
  return kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb / 1024).toFixed(1)} MB`
}

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  const filas = props.anuncioId
    ? await documentosStore.cargarAdjuntosAnuncio(tenantId, props.anuncioId)
    : props.perfilId
      ? await documentosStore.cargarFotosPerfil(tenantId, props.perfilId)
      : []
  items.value = filas.map((f) => ({
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
    // Un anexo suele ser un documento suelto; la foto de un negocio, una
    // fotografía. El catálogo completo queda ahí para quien sepa que lo
    // suyo es un acta o un reglamento.
    const preferido = props.perfilId ? 'fotografia' : 'otro_documento'
    tipoSeleccionado.value = tiposDocumento.value.find((t) => t.codigo === preferido)?.id ?? null
  }
  await cargar()
})

// Cambiar de ficha sin desmontar el componente (la tabla de gestión abre
// una y luego otra) tiene que recargar: si no, se vería la galería anterior.
watch(
  () => [props.anuncioId, props.perfilId],
  async () => {
    items.value = []
    await cargar()
  },
)

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
      perfilId: props.perfilId,
    })
    archivoSeleccionado.value = null
    await cargar()
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo subir el documento.')
  }
}

async function abrir(storagePath: string): Promise<void> {
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
    <h2 v-if="titulo" class="text-sm font-medium">{{ titulo }}</h2>

    <p v-if="items.length === 0" class="text-sm text-neutral-500">
      {{ vacio ?? 'Todavía no hay documentos.' }}
    </p>
    <ul v-else class="space-y-1">
      <li
        v-for="d in items"
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
          @click="abrir(d.storagePath)"
        >
          Abrir
        </UButton>
      </li>
    </ul>

    <p v-if="error" class="text-sm text-red-600 dark:text-red-400">{{ error }}</p>

    <div v-if="puedeEditar" class="space-y-2 pt-1 max-w-md">
      <UFormField label="Tipo de documento">
        <UiSelectorBuscable
          v-model="tipoSeleccionado"
          :opciones="opcionesTipo"
          placeholder="Selecciona el tipo"
        />
      </UFormField>
      <UFormField label="Añadir" help="PDF, JPG o PNG, hasta 15 MB.">
        <input type="file" accept="application/pdf,image/jpeg,image/png" @change="elegirArchivo" >
      </UFormField>
      <UButton
        size="xs"
        :disabled="!archivoSeleccionado || tipoSeleccionado === null"
        :loading="documentosStore.subiendo"
        @click="subir"
      >
        Subir
      </UButton>
    </div>
    <p v-else-if="motivoBloqueo" class="text-xs text-neutral-500">{{ motivoBloqueo }}</p>
  </section>
</template>
