<script setup lang="ts">
// EXT-12 §6.1/§7.7 (Ola 2, M17) — "Mi correspondencia": solo lectura para el residente (§8.4,
// marcar "entregada" es siempre staff en portería, correspondencia-registrar).
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'mi-copropiedad', publico: true })

const actorExterno = useActorExternoStore()
const cliente = useSupabaseClient<Database>()

const cargando = ref(true)
const error = ref<string | null>(null)
const correspondencia = ref<CorrespondenciaExterna[]>([])

function formatoFecha(fecha: string): string {
  return new Date(fecha).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
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

    correspondencia.value = await listarCorrespondenciaExterna(actorExterno.vinculoActivo.vinculo_id)
  } catch (err) {
    error.value = mensajeError(err, 'No se pudo cargar tu correspondencia.')
  } finally {
    cargando.value = false
  }
}

onMounted(cargar)
</script>

<template>
  <div class="mx-auto max-w-md space-y-4 p-4">
    <h1 class="text-lg font-semibold text-gray-900 dark:text-white">Mi correspondencia</h1>

    <UAlert v-if="error" color="error" variant="soft" :title="error" />

    <p v-else-if="cargando" class="text-sm text-gray-500 dark:text-gray-400">Cargando…</p>

    <p v-else-if="correspondencia.length === 0" class="text-sm text-gray-500 dark:text-gray-400">
      No tienes correspondencia registrada.
    </p>

    <div v-else class="space-y-3">
      <div
        v-for="c in correspondencia"
        :key="c.id"
        class="rounded-xl border border-default bg-elevated p-4"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="truncate text-sm font-medium text-gray-900 dark:text-white">
              {{ c.remitente }}<template v-if="c.tipo"> · {{ c.tipo }}</template>
            </p>
            <p class="text-xs text-gray-500 dark:text-gray-400">Para {{ c.destino }} · {{ formatoFecha(c.created_at) }}</p>
          </div>
          <span
            class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
            :class="
              c.entregada
                ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
            "
          >{{ c.entregada ? 'Entregada' : 'En portería' }}</span>
        </div>

        <p v-if="c.descripcion" class="mt-2 text-xs text-gray-500 dark:text-gray-400">{{ c.descripcion }}</p>

        <p v-if="c.entregada && c.entregada_at" class="mt-2 text-xs text-gray-400">
          Recogida el {{ formatoFecha(c.entregada_at) }}<template v-if="c.entregada_a"> por {{ c.entregada_a }}</template>
        </p>
      </div>
    </div>
  </div>
</template>
