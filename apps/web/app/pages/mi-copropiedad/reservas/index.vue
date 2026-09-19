<script setup lang="ts">
// EXT-10 §6.1/§7.5 (Ola 2, M15) — "Mis reservas": listado + cancelar. Reusa external-reservas-
// listar/-cancelar/-disponibilidad (modo catálogo) tal cual (EXT-03) — confirmado 100% funcional
// para actor externo, cero backend nuevo (PLAN_MI_COPROPIEDAD.md §10.2).
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'mi-copropiedad', publico: true })

const actorExterno = useActorExternoStore()
const cliente = useSupabaseClient<Database>()

const cargando = ref(true)
const error = ref<string | null>(null)
const reservas = ref<ReservaExterna[]>([])
const nombreZona = ref<Map<string, string>>(new Map())
const cancelandoId = ref<string | null>(null)
const errorCancelar = ref<string | null>(null)

const ETIQUETA_ESTADO: Record<ReservaExterna['estado'], string> = {
  solicitada: 'Solicitada',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  cancelada: 'Cancelada',
  completada: 'Completada',
  no_show: 'No asistió',
}
const ESTADOS_CANCELABLES = new Set<ReservaExterna['estado']>(['solicitada', 'aprobada'])

function formatoFecha(fecha: string): string {
  return new Date(`${fecha}T00:00:00`).toLocaleDateString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function formatoHora(hora: string): string {
  return hora.slice(0, 5)
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

    const vinculoId = actorExterno.vinculoActivo.vinculo_id
    const [reservasResultado, zonas] = await Promise.all([
      listarReservasExternas(vinculoId),
      listarZonasReservables(vinculoId),
    ])
    reservas.value = reservasResultado
    nombreZona.value = new Map(zonas.map((z) => [z.id, z.nombre]))
  } catch (err) {
    error.value = mensajeError(err, 'No se pudieron cargar tus reservas.')
  } finally {
    cargando.value = false
  }
}

onMounted(cargar)

async function cancelar(reservaId: string): Promise<void> {
  if (!actorExterno.vinculoActivo) return
  cancelandoId.value = reservaId
  errorCancelar.value = null
  try {
    const actualizada = await cancelarReservaExterna(actorExterno.vinculoActivo.vinculo_id, reservaId)
    const i = reservas.value.findIndex((r) => r.id === reservaId)
    if (i !== -1) reservas.value[i] = actualizada
  } catch (err) {
    errorCancelar.value = mensajeError(err, 'No se pudo cancelar la reserva.')
  } finally {
    cancelandoId.value = null
  }
}
</script>

<template>
  <div class="mx-auto max-w-md space-y-4 p-4">
    <div class="flex items-center justify-between gap-3">
      <h1 class="text-lg font-semibold text-highlighted">Mis reservas</h1>
      <UButton to="/mi-copropiedad/reservas/nueva" icon="i-lucide-plus" size="sm">Nueva</UButton>
    </div>

    <UAlert v-if="error" color="error" variant="soft" :title="error" />

    <p v-else-if="cargando" class="text-sm text-muted">Cargando…</p>

    <p v-else-if="reservas.length === 0" class="text-sm text-muted">
      No has hecho ninguna reserva todavía.
    </p>

    <div v-else class="space-y-3">
      <p v-if="errorCancelar" class="text-xs text-red-600 dark:text-red-400">{{ errorCancelar }}</p>
      <div
        v-for="r in reservas"
        :key="r.id"
        class="rounded-xl border border-default bg-elevated p-4"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="truncate text-sm font-medium text-highlighted">
              {{ nombreZona.get(r.zona_comun_id) ?? 'Zona común' }}
            </p>
            <p class="text-xs text-muted">
              {{ formatoFecha(r.fecha) }} · {{ formatoHora(r.hora_inicio) }}–{{ formatoHora(r.hora_fin) }}
            </p>
          </div>
          <span
            class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
            :class="{
              'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400': r.estado === 'solicitada',
              'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400': r.estado === 'aprobada' || r.estado === 'completada',
              'bg-elevated text-toned': r.estado === 'cancelada',
              'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400': r.estado === 'rechazada' || r.estado === 'no_show',
            }"
          >{{ ETIQUETA_ESTADO[r.estado] }}</span>
        </div>

        <p v-if="r.penalizada" class="mt-2 text-xs text-red-600 dark:text-red-400">
          Cancelación tardía — puede aplicar penalidad.
        </p>
        <p v-if="r.motivo_rechazo" class="mt-2 text-xs text-muted">
          {{ r.motivo_rechazo }}
        </p>

        <UButton
          v-if="ESTADOS_CANCELABLES.has(r.estado)"
          class="mt-3" color="error" variant="soft" size="sm" block
          :loading="cancelandoId === r.id" :disabled="cancelandoId !== null"
          @click="cancelar(r.id)"
        >
          {{ cancelandoId === r.id ? 'Cancelando…' : 'Cancelar' }}
        </UButton>
      </div>
    </div>
  </div>
</template>
