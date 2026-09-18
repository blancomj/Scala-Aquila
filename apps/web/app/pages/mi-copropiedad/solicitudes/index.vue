<script setup lang="ts">
// EXT-08 §6.1/§7.1 (Ola 2, M10) — "Mis solicitudes": listado completo, reusa
// external-solicitudes-listar tal cual (sin Edge Function nueva). Antes de este corte solo
// existía nueva.vue (crear) y un resumen de 3 recientes en la home (Ola 1 U6) — este es el
// listado íntegro, con acceso a cada detalle.
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'mi-copropiedad', publico: true })

const actorExterno = useActorExternoStore()
const cliente = useSupabaseClient<Database>()

const cargando = ref(true)
const error = ref<string | null>(null)
const solicitudes = ref<SolicitudExterna[]>([])

// Mismo mapeo que ya se repite en atencion/[id].vue, consulta-inmueble/index.vue y
// mi-copropiedad/index.vue — precedente ya establecido en el proyecto, no una abstracción nueva.
// 10 valores reales (no 7): ver el comentario de mi-copropiedad/index.vue — recibida_externa/
// rechazada_triage/cancelada_por_solicitante se agregaron vía ALTER TYPE después de la creación
// del enum, hallado al probar en navegador con datos QA reales.
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

    solicitudes.value = await listarSolicitudesExternas(actorExterno.vinculoActivo.vinculo_id)
  } catch (err) {
    error.value = mensajeError(err, 'No se pudieron cargar tus solicitudes.')
  } finally {
    cargando.value = false
  }
})
</script>

<template>
  <div class="mx-auto max-w-md space-y-4 p-4">
    <div class="flex items-center justify-between gap-3">
      <h1 class="text-lg font-semibold text-gray-900 dark:text-white">Mis solicitudes</h1>
      <UButton to="/mi-copropiedad/solicitudes/nueva" icon="i-lucide-plus" size="sm">Nueva</UButton>
    </div>

    <UAlert v-if="error" color="error" variant="soft" :title="error" />

    <p v-else-if="cargando" class="text-sm text-gray-500 dark:text-gray-400">Cargando…</p>

    <p v-else-if="solicitudes.length === 0" class="text-sm text-gray-500 dark:text-gray-400">
      No has hecho ninguna solicitud todavía.
    </p>

    <div v-else class="divide-y divide-default rounded-xl border border-default bg-elevated px-4">
      <NuxtLink
        v-for="s in solicitudes"
        :key="s.id"
        :to="`/mi-copropiedad/solicitudes/${s.id}`"
        class="block"
      >
        <MiCopropiedadAsuntoRow
          :titulo="s.asunto"
          :contexto="`#${s.numero}/${s.anio}`"
          :etiqueta="ETIQUETA_ESTADO[s.estado] ?? s.estado"
          :etiqueta-tono="ESTADOS_ABIERTOS.has(s.estado) ? 'atencion' : 'neutral'"
        />
      </NuxtLink>
    </div>
  </div>
</template>
