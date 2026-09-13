<script setup lang="ts">
/**
 * Galería de documentos de un alcance que admite VARIOS — adjuntos de un
 * anuncio (EXS-3), fotos de una ficha del directorio (EXS-4), fotos de un
 * activo físico (Fase 5 de mantenimiento de activos, D-92).
 *
 * NO es `UiLibreriaDocumentos`, y la diferencia es de fondo, no de estilo:
 * aquella está construida sobre el versionado —muestra "próxima versión" y
 * subir del mismo tipo reemplaza lo anterior—, mientras que aquí subir
 * añade. La convocatoria y el presupuesto anexo son dos documentos, no dos
 * versiones de uno, y el logo y la foto del local conviven. `subir-documento`
 * trata así estos alcances a propósito. Meter los dos comportamientos en un
 * componente con una bandera lo haría más difícil de leer que tener dos.
 *
 * `soloImagenes` (activos): a diferencia de anuncios/directorio, que mezclan
 * PDF y fotos, una galería de activo es SIEMPRE fotográfica — se pidió
 * explícitamente poder capturar "al menos 5 imágenes". Con esta bandera se
 * restringe el selector de archivo a JPG/PNG con `capture="environment"`
 * (abre la cámara en un teléfono), se oculta el selector de tipo de
 * documento (siempre 'fotografia') y la lista se muestra como una grilla de
 * miniaturas en vez de filas de "Abrir" — sigue siendo opt-in para no
 * cambiarle el aspecto a los consumidores existentes (anuncios/directorio).
 *
 * La autorización real es del guard y de la RLS: ocultar el formulario no
 * autoriza nada (EXS-1 §4), así que si la base rechaza algo, su mensaje se
 * muestra tal cual en vez de traducirlo a un "no permitido" genérico.
 */
import type { Database } from '@aquila/shared'

const props = withDefaults(
  defineProps<{
    /** Exactamente uno de los tres. Decide contra qué alcance se sube y se lee. */
    anuncioId?: string
    perfilId?: string
    activoId?: string
    titulo?: string
    /** Con `false` la sección queda en solo lectura y se muestra `motivoBloqueo`. */
    editable?: boolean
    motivoBloqueo?: string
    vacio?: string
    /** Grilla de miniaturas + solo JPG/PNG + cámara, en vez de la lista genérica. */
    soloImagenes?: boolean
  }>(),
  // Vue castea un prop `boolean` opcional sin default explícito a `false` (no a `undefined`,
  // como cualquier otro tipo) — sin este `withDefaults` la galería nace en solo lectura para
  // cualquier consumidor que no pase `:editable` explícito. `anuncios/[id].vue` sí lo pasa
  // siempre, pero `directorio/index.vue` (EXS-4, D-83) nunca lo hizo: su formulario de subida
  // de fotos llevaba oculto desde entonces sin que nadie lo notara — hallazgo de este corte
  // (D-92), no introducido por él. El resto de los defaults son solo para que
  // `vue/require-default-prop` no marque el resto de props opcionales una vez que este bloque
  // pasa a usar `withDefaults` (antes, con `defineProps<T>()` a secas, ninguno se marcaba).
  {
    editable: true,
    anuncioId: undefined,
    perfilId: undefined,
    activoId: undefined,
    titulo: undefined,
    motivoBloqueo: undefined,
    vacio: undefined,
    soloImagenes: false,
  },
)

const tenantStore = useTenantStore()
const documentosStore = useDocumentosStore()
const catalogosStore = useCatalogosStore()

const MIME_PERMITIDOS_TODOS = new Set(['application/pdf', 'image/jpeg', 'image/png'])
const MIME_PERMITIDOS_IMAGEN = new Set(['image/jpeg', 'image/png'])
const TAMANO_MAXIMO = 15 * 1024 * 1024

type Item = { id: string; nombre: string; tipo: string; tamano: number | null; storagePath: string }

const items = ref<Item[]>([])
const miniaturas = ref<Record<string, string>>({})
const tiposDocumento = shallowRef<Database['public']['Tables']['lista_tipos']['Row'][]>([])
const tipoSeleccionado = ref<number | null>(null)
const archivoSeleccionado = ref<File | null>(null)
const error = ref<string | null>(null)
const descargando = ref<string | null>(null)

const puedeEditar = computed(() => props.editable !== false)
const mimePermitidos = computed(() => (props.soloImagenes ? MIME_PERMITIDOS_IMAGEN : MIME_PERMITIDOS_TODOS))

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

async function cargarMiniaturas(): Promise<void> {
  if (!props.soloImagenes) return
  const entradas = await Promise.all(
    items.value.map(async (it) => [it.id, await documentosStore.urlDescarga(it.storagePath)] as const),
  )
  miniaturas.value = Object.fromEntries(entradas)
}

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  const filas = props.anuncioId
    ? await documentosStore.cargarAdjuntosAnuncio(tenantId, props.anuncioId)
    : props.perfilId
      ? await documentosStore.cargarFotosPerfil(tenantId, props.perfilId)
      : props.activoId
        ? await documentosStore.cargarImagenesActivo(tenantId, props.activoId)
        : []
  items.value = filas.map((f) => ({
    id: f.id!,
    nombre: f.nombre_archivo ?? 'documento',
    tipo: nombreTipo(f.tipo_documento_id),
    tamano: f.tamano_bytes,
    storagePath: f.storage_path!,
  }))
  await cargarMiniaturas()
}

onMounted(async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (tenantId) {
    const valores = await catalogosStore.cargarValores(tenantId)
    tiposDocumento.value = valores.filter((v) => v.tipo === 'TIPO_DOCUMENTO')
    // Un anexo suele ser un documento suelto; la foto de un negocio o de un
    // activo, una fotografía. El catálogo completo queda ahí para quien sepa
    // que lo suyo es un acta o un reglamento.
    const preferido = props.perfilId || props.activoId ? 'fotografia' : 'otro_documento'
    tipoSeleccionado.value = tiposDocumento.value.find((t) => t.codigo === preferido)?.id ?? null
  }
  await cargar()
})

// Cambiar de ficha sin desmontar el componente (la tabla de gestión abre
// una y luego otra) tiene que recargar: si no, se vería la galería anterior.
watch(
  () => [props.anuncioId, props.perfilId, props.activoId],
  async () => {
    items.value = []
    miniaturas.value = {}
    await cargar()
  },
)

function elegirArchivo(evento: Event): void {
  const input = evento.target as HTMLInputElement
  const archivo = input.files?.[0] ?? null
  error.value = null
  if (archivo && (!mimePermitidos.value.has(archivo.type) || archivo.size > TAMANO_MAXIMO)) {
    error.value = props.soloImagenes ? 'Solo JPG o PNG, hasta 15 MB.' : 'Solo PDF, JPG o PNG, hasta 15 MB.'
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
      activoId: props.activoId,
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
    <div v-if="titulo || soloImagenes" class="flex items-center justify-between gap-2">
      <h2 v-if="titulo" class="text-sm font-medium">{{ titulo }}</h2>
      <p v-if="soloImagenes" class="text-xs" :class="items.length >= 5 ? 'text-muted' : 'text-warning'">
        {{ items.length }} foto{{ items.length === 1 ? '' : 's' }}
        <template v-if="items.length < 5">— se recomiendan al menos 5</template>
      </p>
    </div>

    <p v-if="items.length === 0" class="text-sm text-neutral-500">
      {{ vacio ?? 'Todavía no hay documentos.' }}
    </p>

    <div v-else-if="soloImagenes" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      <button
        v-for="d in items"
        :key="d.id"
        type="button"
        class="group relative aspect-square overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800 disabled:opacity-60"
        :disabled="descargando === d.storagePath"
        @click="abrir(d.storagePath)"
      >
        <img
          v-if="miniaturas[d.id]"
          :src="miniaturas[d.id]"
          :alt="d.nombre"
          class="h-full w-full object-cover transition group-hover:opacity-80"
        >
        <div v-else class="flex h-full w-full items-center justify-center text-xs text-neutral-500">
          Cargando…
        </div>
      </button>
    </div>

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
      <UFormField v-if="!soloImagenes" label="Tipo de documento">
        <UiSelectorBuscable
          v-model="tipoSeleccionado"
          :opciones="opcionesTipo"
          placeholder="Selecciona el tipo"
        />
      </UFormField>
      <UFormField :label="soloImagenes ? 'Capturar o elegir foto' : 'Añadir'" :help="soloImagenes ? 'JPG o PNG, hasta 15 MB.' : 'PDF, JPG o PNG, hasta 15 MB.'">
        <input
          v-if="soloImagenes"
          type="file"
          accept="image/jpeg,image/png"
          capture="environment"
          @change="elegirArchivo"
        >
        <input v-else type="file" accept="application/pdf,image/jpeg,image/png" @change="elegirArchivo" >
      </UFormField>
      <UButton
        size="xs"
        :disabled="!archivoSeleccionado || tipoSeleccionado === null"
        :loading="documentosStore.subiendo"
        @click="subir"
      >
        {{ soloImagenes ? 'Subir foto' : 'Subir' }}
      </UButton>
    </div>
    <p v-else-if="motivoBloqueo" class="text-xs text-neutral-500">{{ motivoBloqueo }}</p>
  </section>
</template>
