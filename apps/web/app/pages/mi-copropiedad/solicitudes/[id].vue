<script setup lang="ts">
// EXT-08 §6.1/§7.1 (Ola 2, M10) — detalle de una solicitud propia. Misma Edge Function que el
// listado (external-solicitudes-listar), con solicitud_id en el body en vez de vinculo_id solo:
// responde vía fn_solicitud_estado_externo, un shape DISTINTO al de la lista (sin id/tipo_id/
// categoria_id, con descripcion/resuelta_at/cerrada_at) — ver el comentario en actor-externo-api.ts.
// EXT-08b §7.2 (Ola 2, M12) — ahora además trae `actuaciones` (respuestas del staff, nunca notas
// internas es_respuesta=false).
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'mi-copropiedad', publico: true })

const route = useRoute()
const solicitudId = route.params.id as string

const actorExterno = useActorExternoStore()
const cliente = useSupabaseClient<Database>()

const cargando = ref(true)
const error = ref<string | null>(null)
const solicitud = ref<SolicitudExternaDetalle | null>(null)
const cancelando = ref(false)
const errorCancelar = ref<string | null>(null)

// 10 valores reales (no 7) — ver el comentario de mi-copropiedad/index.vue.
const ETIQUETA_ESTADO: Record<string, string> = {
  nueva: 'Nueva',
  asignada: 'Asignada',
  en_atencion: 'En atención',
  en_espera: 'En espera',
  recibida_externa: 'Recibida',
  resuelta: 'Resuelta',
  cerrada: 'Cerrada',
  anulada: 'Anulada',
  rechazada_triage: 'Rechazada',
  cancelada_por_solicitante: 'Cancelada',
}
const ESTADOS_ABIERTOS = new Set(['nueva', 'asignada', 'en_atencion', 'en_espera', 'recibida_externa'])

function formatoFecha(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
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

    solicitud.value = await obtenerSolicitudExterna(actorExterno.vinculoActivo.vinculo_id, solicitudId)
  } catch (err) {
    error.value = mensajeError(err, 'No se pudo cargar esta solicitud.')
  } finally {
    cargando.value = false
  }
})

// EXT-02 §3.2 — cancelar solo es válido en recibida_externa (antes de que el staff la mire).
// external-solicitudes-cancelar ya existe desde EXT-02; esta es la primera vez que se expone en
// una UI (ninguna pantalla lo consumía todavía).
async function cancelar(): Promise<void> {
  if (!actorExterno.vinculoActivo) return
  cancelando.value = true
  errorCancelar.value = null
  try {
    solicitud.value = await cancelarSolicitudExterna(actorExterno.vinculoActivo.vinculo_id, solicitudId)
  } catch (err) {
    errorCancelar.value = mensajeError(err, 'No se pudo cancelar la solicitud.')
  } finally {
    cancelando.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-md space-y-4 p-4">
    <NuxtLink to="/mi-copropiedad/solicitudes" class="text-sm text-primary-600 dark:text-primary-400">
      ← Mis solicitudes
    </NuxtLink>

    <UAlert v-if="error" color="error" variant="soft" :title="error" />

    <p v-else-if="cargando" class="text-sm text-gray-500 dark:text-gray-400">Cargando…</p>

    <template v-else-if="solicitud">
      <div class="rounded-xl border border-default bg-elevated p-4">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-xs text-gray-500 dark:text-gray-400">#{{ solicitud.numero }}/{{ solicitud.anio }}</p>
            <h1 class="text-base font-semibold text-gray-900 dark:text-white">{{ solicitud.asunto }}</h1>
          </div>
          <span
            class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
            :class="
              ESTADOS_ABIERTOS.has(solicitud.estado)
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
            "
          >{{ ETIQUETA_ESTADO[solicitud.estado] ?? solicitud.estado }}</span>
        </div>

        <p v-if="solicitud.descripcion" class="mt-3 text-sm text-gray-600 dark:text-gray-300">
          {{ solicitud.descripcion }}
        </p>

        <dl class="mt-4 space-y-1.5 text-xs text-gray-500 dark:text-gray-400">
          <div class="flex justify-between gap-2">
            <dt>Radicada</dt>
            <dd>{{ formatoFecha(solicitud.created_at) }}</dd>
          </div>
          <div v-if="solicitud.resuelta_at" class="flex justify-between gap-2">
            <dt>Resuelta</dt>
            <dd>{{ formatoFecha(solicitud.resuelta_at) }}</dd>
          </div>
          <div v-if="solicitud.cerrada_at" class="flex justify-between gap-2">
            <dt>Cerrada</dt>
            <dd>{{ formatoFecha(solicitud.cerrada_at) }}</dd>
          </div>
        </dl>

        <p
          v-if="solicitud.triage_motivo_rechazo"
          class="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-400"
        >
          {{ solicitud.triage_motivo_rechazo }}
        </p>

        <div v-if="solicitud.estado === 'recibida_externa'" class="mt-4">
          <UButton
            color="error" variant="soft" block
            :loading="cancelando" :disabled="cancelando"
            @click="cancelar"
          >
            {{ cancelando ? 'Cancelando…' : 'Cancelar solicitud' }}
          </UButton>
          <p v-if="errorCancelar" class="mt-2 text-xs text-red-600 dark:text-red-400">{{ errorCancelar }}</p>
        </div>
      </div>

      <div v-if="solicitud.actuaciones.length > 0">
        <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Respuestas</p>
        <div class="space-y-2">
          <div
            v-for="(a, i) in solicitud.actuaciones"
            :key="i"
            class="rounded-xl border border-default bg-elevated p-3"
          >
            <p class="text-xs text-gray-500 dark:text-gray-400">{{ formatoFecha(a.created_at) }}</p>
            <p class="mt-1 text-sm text-gray-700 dark:text-gray-200">{{ a.descripcion }}</p>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
