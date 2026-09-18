<script setup lang="ts">
// EXT-11 §6.1/§7.1 (Ola 3, M20) — detalle de una reunión: convocatoria + agenda (orden del día
// congelado), acta si ya está `publicada` (puesta a disposición real — nunca en borrador/
// en_verificacion/suscrita, ver external-gobierno-listar) y el resultado de cada votación
// cerrada. El acta/convocatoria se abren reusando obtenerUrlDocumentoExterno (M16, sin cambios).
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'mi-copropiedad', publico: true })

const route = useRoute()
const reunionId = route.params.id as string

const actorExterno = useActorExternoStore()
const cliente = useSupabaseClient<Database>()

const cargando = ref(true)
const error = ref<string | null>(null)
const detalle = ref<ReunionGobiernoDetalle | null>(null)

const abriendoId = ref<string | null>(null)
const errorAbrir = ref<string | null>(null)

function formatoFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}

onMounted(async () => {
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

    detalle.value = await obtenerReunionGobierno(actorExterno.vinculoActivo.vinculo_id, reunionId)
  } catch (err) {
    error.value = mensajeError(err, 'No se pudo cargar esta reunión.')
  } finally {
    cargando.value = false
  }
})

async function abrirDocumento(documentoId: string): Promise<void> {
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
    <NuxtLink to="/mi-copropiedad/gobierno" class="text-sm text-primary-600 dark:text-primary-400">
      ← Gobierno
    </NuxtLink>

    <UAlert v-if="error" color="error" variant="soft" :title="error" />

    <p v-else-if="cargando" class="text-sm text-gray-500 dark:text-gray-400">Cargando…</p>

    <template v-else-if="detalle">
      <div class="rounded-xl border border-default bg-elevated p-4">
        <h1 class="text-base font-semibold text-gray-900 dark:text-white">{{ detalle.reunion.tipo_nombre }}</h1>
        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {{ detalle.reunion.organo_nombre }} · {{ formatoFecha(detalle.reunion.fecha_hora) }}
        </p>
        <p v-if="detalle.reunion.lugar" class="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Lugar: {{ detalle.reunion.lugar }}
        </p>
        <p v-if="detalle.reunion.medio" class="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Medio: {{ detalle.reunion.medio }}
        </p>
      </div>

      <p v-if="errorAbrir" class="text-xs text-red-600 dark:text-red-400">{{ errorAbrir }}</p>

      <div v-if="detalle.convocatoria" class="rounded-xl border border-default bg-elevated p-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-gray-400">Convocatoria</p>
        <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Emitida {{ formatoFecha(detalle.convocatoria.emitida_at) }}
        </p>
        <UButton
          v-if="detalle.convocatoria.documento_id"
          class="mt-3" variant="soft" size="sm" block
          :loading="abriendoId === detalle.convocatoria.documento_id" :disabled="abriendoId !== null"
          @click="abrirDocumento(detalle.convocatoria.documento_id)"
        >
          {{ abriendoId === detalle.convocatoria.documento_id ? 'Abriendo…' : 'Ver convocatoria' }}
        </UButton>
      </div>

      <div v-if="detalle.agenda.length > 0">
        <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Orden del día</p>
        <div class="space-y-2">
          <div
            v-for="p in detalle.agenda" :key="p.id"
            class="rounded-xl border border-default bg-elevated p-3"
          >
            <p class="text-sm text-gray-700 dark:text-gray-200">{{ p.orden }}. {{ p.titulo }}</p>
            <p v-if="p.descripcion" class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ p.descripcion }}</p>
          </div>
        </div>
      </div>

      <div class="rounded-xl border border-default bg-elevated p-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-gray-400">Acta</p>
        <template v-if="detalle.acta">
          <UButton
            v-if="detalle.acta.documento_id"
            class="mt-3" variant="soft" size="sm" block
            :loading="abriendoId === detalle.acta.documento_id" :disabled="abriendoId !== null"
            @click="abrirDocumento(detalle.acta.documento_id)"
          >
            {{ abriendoId === detalle.acta.documento_id ? 'Abriendo…' : 'Ver acta' }}
          </UButton>
          <p v-else class="mt-2 text-xs text-gray-500 dark:text-gray-400">
            El acta ya está publicada, pero todavía no tiene un documento adjunto.
          </p>
        </template>
        <p v-else class="mt-2 text-xs text-gray-500 dark:text-gray-400">
          El acta todavía no está disponible.
        </p>
      </div>

      <div v-if="detalle.votaciones.length > 0">
        <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Votaciones</p>
        <div class="space-y-2">
          <MiCopropiedadResultadoVotacion v-for="v in detalle.votaciones" :key="v.id" :votacion="v" />
        </div>
      </div>
    </template>
  </div>
</template>
