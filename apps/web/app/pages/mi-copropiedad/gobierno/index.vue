<script setup lang="ts">
// EXT-11 §6.1/§7.1 (Ola 3, M20) — "Gobierno": lista las reuniones ya instaladas/cerradas del
// tenant del vínculo (dominio tenant-completo, no por inmueble — ver comentario de
// external-gobierno-listar) vía external-gobierno-listar (Edge Function nueva de este corte).
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'mi-copropiedad', publico: true })

const actorExterno = useActorExternoStore()
const cliente = useSupabaseClient<Database>()

const cargando = ref(true)
const error = ref<string | null>(null)
const reuniones = ref<ReunionGobierno[]>([])

const ETIQUETA_ESTADO: Record<string, string> = {
  instalada: 'Instalada',
  cerrada: 'Cerrada',
}

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

    reuniones.value = await listarReunionesGobierno(actorExterno.vinculoActivo.vinculo_id)
  } catch (err) {
    error.value = mensajeError(err, 'No se pudieron cargar las reuniones.')
  } finally {
    cargando.value = false
  }
})
</script>

<template>
  <div class="mx-auto max-w-md space-y-4 p-4">
    <h1 class="text-lg font-semibold text-gray-900 dark:text-white">Gobierno</h1>

    <UAlert v-if="error" color="error" variant="soft" :title="error" />

    <p v-else-if="cargando" class="text-sm text-gray-500 dark:text-gray-400">Cargando…</p>

    <p v-else-if="reuniones.length === 0" class="text-sm text-gray-500 dark:text-gray-400">
      Todavía no hay reuniones disponibles.
    </p>

    <div v-else class="space-y-3">
      <NuxtLink
        v-for="r in reuniones" :key="r.id"
        :to="`/mi-copropiedad/gobierno/${r.id}`"
        class="block rounded-xl border border-default bg-elevated p-4"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="truncate text-sm font-medium text-gray-900 dark:text-white">{{ r.tipo_nombre }}</p>
            <p class="text-xs text-gray-500 dark:text-gray-400">{{ r.organo_nombre }} · {{ formatoFecha(r.fecha_hora) }}</p>
          </div>
          <span class="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
            {{ ETIQUETA_ESTADO[r.estado] ?? r.estado }}
          </span>
        </div>
      </NuxtLink>
    </div>
  </div>
</template>
