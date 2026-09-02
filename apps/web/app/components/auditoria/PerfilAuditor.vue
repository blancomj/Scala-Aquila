<script setup lang="ts">
// "Perfil del auditor" (PROMPT AUDITORÍA §93): "auditorías asignadas,
// pruebas pendientes, hallazgos, acciones, revisiones. No mostrar
// información fuera de su tenant." El aislamiento de tenant ya lo da la
// RLS de cada tabla — este panel solo filtra, sobre lo que index.vue YA
// cargó para las otras pestañas (hallazgos/acciones/engagements), lo que
// tiene a `profile.id` como responsable. Cero queries nuevas.
const authStore = useAuthStore()
const auditoriaStore = useAuditoriaStore()

const miId = computed(() => authStore.profile?.id ?? null)

const misEngagements = computed(() =>
  auditoriaStore.engagements.filter((e) => e.responsable === miId.value),
)
const misHallazgos = computed(() =>
  auditoriaStore.hallazgos.filter((h) => h.responsable === miId.value),
)
const misAcciones = computed(() =>
  auditoriaStore.acciones.filter((a) => a.responsable === miId.value),
)

const hallazgosAbiertos = computed(() =>
  misHallazgos.value.filter((h) => h.estado !== 'CERRADO' && h.estado !== 'RECHAZADO'),
)
const accionesPendientes = computed(() =>
  misAcciones.value.filter((a) => a.estado !== 'CERRADA' && a.estado !== 'RECHAZADA'),
)
const accionesVencidas = computed(() => {
  const hoy = new Date()
  return accionesPendientes.value.filter((a) => a.fecha_compromiso && new Date(a.fecha_compromiso) < hoy)
})

function nombreEngagement(engagementId: string): string {
  return auditoriaStore.engagements.find((e) => e.id === engagementId)?.nombre ?? '—'
}

function fecha(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}

const COLOR_NIVEL: Record<string, 'error' | 'warning' | 'neutral'> = {
  CRITICO: 'error',
  ALTO: 'error',
  MEDIO: 'warning',
  BAJO: 'neutral',
  OBSERVACION: 'neutral',
}
</script>

<template>
  <div class="space-y-6">
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div class="rounded-md border border-default p-3">
        <p class="text-xs text-muted uppercase tracking-wide">Auditorías asignadas</p>
        <p class="text-lg font-semibold tabular-nums">{{ misEngagements.length }}</p>
      </div>
      <div class="rounded-md border border-default p-3">
        <p class="text-xs text-muted uppercase tracking-wide">Hallazgos abiertos</p>
        <p class="text-lg font-semibold tabular-nums">{{ hallazgosAbiertos.length }}</p>
      </div>
      <div class="rounded-md border border-default p-3">
        <p class="text-xs text-muted uppercase tracking-wide">Acciones pendientes</p>
        <p class="text-lg font-semibold tabular-nums">{{ accionesPendientes.length }}</p>
      </div>
      <div class="rounded-md border border-default p-3">
        <p class="text-xs text-muted uppercase tracking-wide">Acciones vencidas</p>
        <p class="text-lg font-semibold tabular-nums" :class="accionesVencidas.length > 0 ? 'text-error-600' : ''">
          {{ accionesVencidas.length }}
        </p>
      </div>
    </div>

    <section>
      <h3 class="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Mis auditorías</h3>
      <p v-if="misEngagements.length === 0" class="text-sm text-muted py-4">
        No tienes auditorías asignadas como responsable.
      </p>
      <div v-else class="space-y-2">
        <div
          v-for="engagement in misEngagements"
          :key="engagement.id"
          class="border border-default rounded-md p-3 flex items-center justify-between gap-3"
        >
          <div>
            <p class="text-sm font-medium">{{ engagement.nombre }}</p>
            <p v-if="engagement.periodo" class="text-xs text-muted">{{ engagement.periodo }}</p>
          </div>
          <UBadge color="neutral" variant="subtle">{{ engagement.estado.replace('_', ' ') }}</UBadge>
        </div>
      </div>
    </section>

    <section>
      <h3 class="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Mis hallazgos</h3>
      <p v-if="misHallazgos.length === 0" class="text-sm text-muted py-4">
        No tienes hallazgos asignados como responsable.
      </p>
      <div v-else class="space-y-2">
        <div
          v-for="hallazgo in misHallazgos"
          :key="hallazgo.id"
          class="border border-default rounded-md p-3"
        >
          <div class="flex items-center gap-2">
            <UBadge :color="COLOR_NIVEL[hallazgo.nivel] ?? 'neutral'" variant="subtle" size="xs">
              {{ hallazgo.nivel }}
            </UBadge>
            <span class="text-sm font-medium">{{ hallazgo.proceso }}</span>
            <span class="ml-auto text-xs text-muted">{{ nombreEngagement(hallazgo.engagement_id) }}</span>
          </div>
          <p v-if="hallazgo.condicion" class="text-xs text-muted mt-1">{{ hallazgo.condicion }}</p>
          <p class="text-xs text-muted mt-1">Estado: {{ hallazgo.estado.replace('_', ' ') }}</p>
        </div>
      </div>
    </section>

    <section>
      <h3 class="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Mis acciones</h3>
      <p v-if="misAcciones.length === 0" class="text-sm text-muted py-4">
        No tienes acciones asignadas como responsable.
      </p>
      <div v-else class="space-y-2">
        <div
          v-for="accion in misAcciones"
          :key="accion.id"
          class="border border-default rounded-md p-3 flex items-center justify-between gap-3"
        >
          <div>
            <p class="text-sm font-medium">{{ accion.accion }}</p>
            <p class="text-xs text-muted">Compromiso: {{ fecha(accion.fecha_compromiso) }}</p>
          </div>
          <UBadge
            :color="accionesVencidas.some((v) => v.id === accion.id) ? 'error' : 'neutral'"
            variant="subtle"
          >
            {{ accion.estado.replace('_', ' ') }}
          </UBadge>
        </div>
      </div>
    </section>
  </div>
</template>
