<script setup lang="ts">
// EXT-10 §6.1/§7.6 (Ola 2, M16) — "Mis documentos": lista los documentos del actor externo (de
// su inmueble o de copropiedad, sin inmueble) vía external-documentos-listar (Edge Function
// nueva de este corte). "Ver" firma un enlace de un solo uso (generar-enlace-documento, vía
// actor_externo) y lo resuelve a la signed URL real (ver-documento) — mismo mecanismo HMAC que ya
// usa el staff, sin tocar ver-documento.
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'mi-copropiedad', publico: true })

const actorExterno = useActorExternoStore()
const cliente = useSupabaseClient<Database>()

const cargando = ref(true)
const error = ref<string | null>(null)
const documentos = ref<DocumentoExterno[]>([])
const abriendoId = ref<string | null>(null)
const errorAbrir = ref<string | null>(null)

function formatoFecha(fecha: string): string {
  return new Date(fecha).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatearTamano(bytes: number | null): string {
  if (!bytes) return '—'
  const kb = bytes / 1024
  return kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb / 1024).toFixed(1)} MB`
}

async function cargar(): Promise<void> {
  cargando.value = true
  error.value = null
  try {
    const {
      data: { user: usuario },
    } = await cliente.auth.getUser()
    if (!usuario) {
      await navigateTo('/mi-copropiedad/login')
      return
    }

    if (actorExterno.vinculos.length === 0) {
      await actorExterno.cargarVinculos()
    }
    if (actorExterno.vinculos.length === 0) {
      error.value = 'No encontramos ningún rol vigente asociado a tu cuenta.'
      return
    }
    if (!actorExterno.vinculoActivo) {
      await navigateTo('/mi-copropiedad/vinculos')
      return
    }

    documentos.value = await listarDocumentosExternos(actorExterno.vinculoActivo.vinculo_id)
  } catch (err) {
    error.value = mensajeError(err, 'No se pudieron cargar tus documentos.')
  } finally {
    cargando.value = false
  }
}

onMounted(cargar)

async function abrir(documentoId: string): Promise<void> {
  if (!actorExterno.vinculoActivo) return
  abriendoId.value = documentoId
  errorAbrir.value = null
  try {
    const url = await obtenerUrlDocumentoExterno(actorExterno.vinculoActivo.vinculo_id, documentoId)
    window.open(url, '_blank', 'noopener')
  } catch (err) {
    errorAbrir.value = mensajeError(err, 'No se pudo abrir el documento.')
  } finally {
    abriendoId.value = null
  }
}
</script>

<template>
  <div class="mx-auto max-w-md space-y-4 p-4">
    <h1 class="text-lg font-semibold text-highlighted">Mis documentos</h1>

    <UAlert v-if="error" color="error" variant="soft" :title="error" />

    <p v-else-if="cargando" class="text-sm text-muted">Cargando…</p>

    <p v-else-if="documentos.length === 0" class="text-sm text-muted">
      No hay documentos disponibles todavía.
    </p>

    <div v-else class="space-y-3">
      <p v-if="errorAbrir" class="text-xs text-red-600 dark:text-red-400">{{ errorAbrir }}</p>
      <div
        v-for="d in documentos"
        :key="d.id"
        class="rounded-xl border border-default bg-elevated p-4"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="truncate text-sm font-medium text-highlighted">{{ d.nombre_archivo }}</p>
            <p class="text-xs text-muted">
              {{ d.tipo_documento }} · {{ formatearTamano(d.tamano_bytes) }}
              <template v-if="d.alcance === 'copropiedad'"> · Copropiedad</template>
            </p>
          </div>
          <span
            v-if="d.fecha_vencimiento"
            class="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
          >Vence {{ formatoFecha(d.fecha_vencimiento) }}</span>
        </div>

        <p v-if="d.descripcion" class="mt-2 text-xs text-muted">{{ d.descripcion }}</p>

        <UButton
          class="mt-3" variant="soft" size="sm" block
          :loading="abriendoId === d.id" :disabled="abriendoId !== null"
          @click="abrir(d.id)"
        >
          {{ abriendoId === d.id ? 'Abriendo…' : 'Ver documento' }}
        </UButton>
      </div>
    </div>
  </div>
</template>
