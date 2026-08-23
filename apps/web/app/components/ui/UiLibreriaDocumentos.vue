<script setup lang="ts">
// Librería de documentos — compartido por CopropiedadDocumentos.vue e
// InmueblesInmuebleDocumentos.vue (antes cada uno tenía su propia copia
// casi idéntica; se extrajo aquí para no mantener dos veces la misma
// lógica de subida/versionado/listado). `inmuebleId` null = documentos de
// la copropiedad misma (mismo criterio que documentosStore/subir-documento).
import type { Database } from '@aquila/shared'
import type { ColumnaTabla } from '~/components/ui/UiTabla.vue'

const props = defineProps<{
  inmuebleId: string | null
  descripcion: string
}>()

const tenantStore = useTenantStore()
const documentosStore = useDocumentosStore()

const tiposDocumento = shallowRef<Database['public']['Tables']['lista_tipos']['Row'][]>([])
const tipoSeleccionado = ref<number | null>(null)
const archivoSeleccionado = ref<File | null>(null)
const fechaVencimiento = ref('')
const descripcionDocumento = ref('')
const error = ref<string | null>(null)
const descargando = ref<string | null>(null)
const vista = ref<'detalle' | 'lista'>('detalle')

const MIME_PERMITIDOS = new Set(['application/pdf', 'image/jpeg', 'image/png'])
const TAMANO_MAXIMO = 15 * 1024 * 1024

type DocumentoRow = Database['public']['Views']['v_documento_vigente']['Row']

function nombreTipo(tipoDocumentoId: number | null): string {
  return tiposDocumento.value.find((t) => t.id === tipoDocumentoId)?.nombre ?? 'Documento'
}

const opcionesTipoDocumento = computed(() =>
  tiposDocumento.value.map((t) => ({ valor: t.id, etiqueta: t.nombre })),
)

// La próxima versión se calcula igual que subir-documento/index.ts: si ya
// existe un documento vigente del mismo tipo en este alcance, la subida lo
// reemplaza (mismo grupo_id, version+1) — acá solo es una previsualización,
// el edge function es quien decide de verdad bajo concurrencia.
const proximaVersion = computed<number | null>(() => {
  if (!tipoSeleccionado.value) return null
  const vigente = documentosStore.documentos.find((d) => d.tipo_documento_id === tipoSeleccionado.value)
  return (vigente?.version ?? 0) + 1
})

function formatearTamano(bytes: number | null): string {
  if (!bytes) return '—'
  const kb = bytes / 1024
  return kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb / 1024).toFixed(1)} MB`
}

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
  if (!tenantId || !archivoSeleccionado.value || !tipoSeleccionado.value) return
  error.value = null
  try {
    await documentosStore.subirDocumento({
      tenantId,
      inmuebleId: props.inmuebleId,
      tipoDocumentoId: tipoSeleccionado.value,
      archivo: archivoSeleccionado.value,
      fechaVencimiento: fechaVencimiento.value || undefined,
      descripcion: descripcionDocumento.value || undefined,
    })
    archivoSeleccionado.value = null
    tipoSeleccionado.value = null
    fechaVencimiento.value = ''
    descripcionDocumento.value = ''
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo subir el documento.')
  }
}

async function descargar(storagePath: string | null): Promise<void> {
  if (!storagePath) return
  descargando.value = storagePath
  try {
    const url = await documentosStore.urlDescarga(storagePath)
    window.open(url, '_blank', 'noopener')
  } catch {
    error.value = 'No se pudo generar el enlace de descarga.'
  } finally {
    descargando.value = null
  }
}

const columnasLista: ColumnaTabla<DocumentoRow>[] = [
  { clave: 'nombre_archivo', etiqueta: 'Documento' },
  { clave: 'tipo', etiqueta: 'Tipo' },
  { clave: 'version', etiqueta: 'Versión', alinear: 'derecha' },
  { clave: 'tamano_bytes', etiqueta: 'Tamaño', alinear: 'derecha' },
  { clave: 'fecha_vencimiento', etiqueta: 'Vencimiento' },
  { clave: 'created_at', etiqueta: 'Cargado el' },
  { clave: 'acciones', etiqueta: '' },
]

watchEffect(async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  ;[tiposDocumento.value] = await Promise.all([
    cargarListaTipos(tenantId, 'TIPO_DOCUMENTO'),
    documentosStore.cargarDocumentos(tenantId, props.inmuebleId),
  ])
})
</script>

<template>
  <div>
    <div class="panel-head">
      <div>
        <h2>Librería de documentos</h2>
        <p class="panel-sub">{{ descripcion }}</p>
      </div>
    </div>

    <div class="dropzone">
      <div class="dropzone-fields">
        <div class="field-group">
          <label class="field-label" for="doc-tipo">Tipo de Documento <span class="field-required">*</span></label>
          <UiSelectorBuscable
            id="doc-tipo"
            v-model="tipoSeleccionado"
            variante="ficha"
            compacta
            :opciones="opcionesTipoDocumento"
            placeholder="Seleccione el tipo de documento"
          />
          <span class="field-hint">Seleccione la categoría del documento</span>
        </div>
        <div class="field-group">
          <label class="field-label" for="doc-vencimiento">📅 Vencimiento</label>
          <input id="doc-vencimiento" v-model="fechaVencimiento" type="date" class="field-input">
          <span class="field-hint">Fecha de vencimiento (opcional)</span>
        </div>
        <div class="field-group">
          <span class="field-label">Versión</span>
          <div class="field-version" :class="{ 'is-vacio': !proximaVersion }">
            {{ proximaVersion ? `v${proximaVersion}` : 'Seleccione tipo' }}
          </div>
          <span class="field-hint">Auto-incrementa</span>
        </div>
        <div class="field-group">
          <label class="field-label" for="doc-descripcion">Descripción</label>
          <input
            id="doc-descripcion"
            v-model="descripcionDocumento"
            type="text"
            class="field-input"
            maxlength="500"
            placeholder="Nota sobre el documento"
          >
          <span class="field-hint">Opcional</span>
        </div>
      </div>

      <div class="dropzone-actions">
        <div style="font-size: 22px; color: var(--ink-faint)">⇧</div>
        <div class="dropzone-text">
          <p>{{ archivoSeleccionado ? archivoSeleccionado.name : 'Selecciona un archivo desde tu equipo' }}</p>
          <span>PDF, JPG o PNG · hasta 15 MB</span>
        </div>
        <input type="file" accept=".pdf,.jpg,.jpeg,.png" class="dropzone-file" @change="elegirArchivo">
        <button
          type="button"
          class="btn btn--primary"
          style="font-size: 12.5px; padding: 8px 14px"
          :disabled="documentosStore.subiendo || !archivoSeleccionado || !tipoSeleccionado"
          @click="subir"
        >
          {{ documentosStore.subiendo ? 'Subiendo…' : 'Subir' }}
        </button>
      </div>
    </div>
    <p v-if="error" class="note" style="color: var(--ladrillo-text)">{{ error }}</p>

    <div class="doc-results">
      <div v-if="documentosStore.documentos.length > 0" class="view-toggle view-toggle--list">
        <button
          type="button"
          class="icon-btn-sm"
          :class="{ 'is-active': vista === 'detalle' }"
          title="Vista de detalle"
          aria-label="Vista de detalle"
          @click="vista = 'detalle'"
        >
          ▦
        </button>
        <button
          type="button"
          class="icon-btn-sm"
          :class="{ 'is-active': vista === 'lista' }"
          title="Vista de lista"
          aria-label="Vista de lista"
          @click="vista = 'lista'"
        >
          ☰
        </button>
      </div>

    <div v-if="documentosStore.documentos.length > 0 && vista === 'detalle'" class="doc-grid">
      <div v-for="d in documentosStore.documentos" :key="d.id ?? undefined" class="doc-card">
        <div class="doc-top">
          <div style="font-size: 20px; color: var(--ink-faint)">▤</div>
          <div>
            <p class="doc-name">{{ d.nombre_archivo }}</p>
            <p class="doc-meta">{{ nombreTipo(d.tipo_documento_id) }} · v{{ d.version }} · {{ formatearTamano(d.tamano_bytes) }}</p>
          </div>
        </div>
        <p v-if="d.descripcion" class="doc-meta">{{ d.descripcion }}</p>
        <p class="doc-meta">Cargado el {{ d.created_at?.slice(0, 10) }}</p>
        <div class="doc-foot">
          <span class="badge badge--gris">{{ nombreTipo(d.tipo_documento_id) }}</span>
          <span v-if="d.fecha_vencimiento" class="badge badge--oro">Vencimiento {{ d.fecha_vencimiento }}</span>
          <button
            type="button"
            class="btn btn--ghost"
            style="font-size: 12px; padding: 4px 10px; margin-left: auto"
            :disabled="descargando === d.storage_path"
            @click="descargar(d.storage_path)"
          >
            {{ descargando === d.storage_path ? 'Generando…' : 'Ver' }}
          </button>
        </div>
      </div>
    </div>

    <UiTabla
      v-else-if="documentosStore.documentos.length > 0 && vista === 'lista'"
      variante="ficha"
      :columnas="columnasLista"
      :filas="documentosStore.documentos"
      :clave-fila="(d: DocumentoRow) => d.id ?? ''"
    >
      <template #celda-nombre_archivo="{ fila }">{{ fila.nombre_archivo }}</template>
      <template #celda-tipo="{ fila }">{{ nombreTipo(fila.tipo_documento_id) }}</template>
      <template #celda-version="{ fila }">v{{ fila.version }}</template>
      <template #celda-tamano_bytes="{ fila }">{{ formatearTamano(fila.tamano_bytes) }}</template>
      <template #celda-fecha_vencimiento="{ fila }">{{ fila.fecha_vencimiento ?? '—' }}</template>
      <template #celda-created_at="{ fila }">{{ fila.created_at?.slice(0, 10) }}</template>
      <template #celda-acciones="{ fila }">
        <div class="row-actions">
          <button
            type="button"
            class="btn btn--ghost"
            style="font-size: 12px; padding: 4px 10px"
            :disabled="descargando === fila.storage_path"
            @click="descargar(fila.storage_path)"
          >
            {{ descargando === fila.storage_path ? 'Generando…' : 'Ver' }}
          </button>
        </div>
      </template>
    </UiTabla>

    <p v-else class="empty-state">Sin documentos cargados todavía.</p>
    </div>
  </div>
</template>
