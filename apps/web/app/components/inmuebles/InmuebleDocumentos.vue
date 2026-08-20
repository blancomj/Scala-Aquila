<script setup lang="ts">
// Tab Documentos (PROMPT_FICHA_INMUEBLE.md §1.1 I9, §8.1). La subida pasa
// por la Edge Function subir-documento (bucket documentos-inmueble,
// privado) — este componente nunca escribe directo a Storage ni a
// documentos_inmueble. Descarga vía signed URL de corta duración (60s),
// generada en el momento del click, no precalculada para toda la lista.
import type { Database } from '@aquila/shared'

const props = defineProps<{ inmuebleId: string }>()

const tenantStore = useTenantStore()
const documentosStore = useDocumentosStore()

const tiposDocumento = shallowRef<Database['public']['Tables']['lista_tipos']['Row'][]>([])
const tipoSeleccionado = ref<number | null>(null)
const archivoSeleccionado = ref<File | null>(null)
const fechaVencimiento = ref('')
const error = ref<string | null>(null)
const descargando = ref<string | null>(null)

const MIME_PERMITIDOS = new Set(['application/pdf', 'image/jpeg', 'image/png'])
const TAMANO_MAXIMO = 15 * 1024 * 1024

function nombreTipo(tipoDocumentoId: number | null): string {
  return tiposDocumento.value.find((t) => t.id === tipoDocumentoId)?.nombre ?? 'Documento'
}

const opcionesTipoDocumento = computed(() =>
  tiposDocumento.value.map((t) => ({ valor: t.id, etiqueta: t.nombre })),
)

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
    })
    archivoSeleccionado.value = null
    tipoSeleccionado.value = null
    fechaVencimiento.value = ''
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
        <p class="panel-sub">Escrituras, certificados, contratos y actas asociadas a este inmueble.</p>
      </div>
    </div>

    <div class="dropzone">
      <div style="font-size: 22px; color: var(--ink-faint)">⇧</div>
      <div class="dropzone-text">
        <p>{{ archivoSeleccionado ? archivoSeleccionado.name : 'Selecciona un archivo desde tu equipo' }}</p>
        <span>PDF, JPG o PNG · hasta 15 MB</span>
      </div>
      <input type="file" accept=".pdf,.jpg,.jpeg,.png" style="max-width: 180px" @change="elegirArchivo">
      <UiSelectorBuscable
        v-model="tipoSeleccionado"
        variante="ficha"
        compacta
        :opciones="opcionesTipoDocumento"
        placeholder="— Elegir categoría —"
      />
      <input v-model="fechaVencimiento" type="date" title="Fecha de vencimiento (opcional)">
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
    <p v-if="error" class="note" style="color: var(--ladrillo-text)">{{ error }}</p>

    <div v-if="documentosStore.documentos.length > 0" class="doc-grid">
      <div v-for="d in documentosStore.documentos" :key="d.id ?? undefined" class="doc-card">
        <div class="doc-top">
          <div style="font-size: 20px; color: var(--ink-faint)">▤</div>
          <div>
            <p class="doc-name">{{ d.nombre_archivo }}</p>
            <p class="doc-meta">{{ nombreTipo(d.tipo_documento_id) }} · {{ formatearTamano(d.tamano_bytes) }}</p>
          </div>
        </div>
        <p class="doc-meta">Cargado el {{ d.created_at?.slice(0, 10) }}</p>
        <div class="doc-foot">
          <span class="badge badge--gris">{{ nombreTipo(d.tipo_documento_id) }}</span>
          <span v-if="d.fecha_vencimiento" class="badge badge--oro">vence {{ d.fecha_vencimiento }}</span>
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
    <p v-else class="empty-state">Sin documentos cargados todavía.</p>
  </div>
</template>
