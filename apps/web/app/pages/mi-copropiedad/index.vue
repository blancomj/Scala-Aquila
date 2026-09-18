<script setup lang="ts">
// EXT-05/EXT-07 · M4/M4b — "Mis asuntos": agregador (saldo resumido + solicitudes recientes +
// accesos rápidos con badge, patrón Vecindapp visto en la exploración competitiva — ver artifact
// de propuesta §7). Cero Edge Functions nuevas propias: reusa external-cuenta-resumen (EXT-07,
// ya cerrado en U2) y external-solicitudes-listar (EXT-02, preexistente).
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'mi-copropiedad', publico: true })

const actorExterno = useActorExternoStore()
const cliente = useSupabaseClient<Database>()

const cargando = ref(true)
const error = ref<string | null>(null)
const resumen = ref<CuentaResumen | null>(null)
const solicitudes = ref<SolicitudExterna[]>([])
const correspondencia = ref<CorrespondenciaExterna[]>([])

// §7.6: no existe en el FSM de solicitudes (GOB-8/EXT-02) un estado específico "requiere tu
// respuesta" distinto de "abierta" — `en_espera` solo pausa el reloj del SLA y su motivo es
// texto libre (puede no tratarse en absoluto del residente). Asumir esa semántica sin verificarla
// sería inventar una regla no cerrada en el plan. "Abierta" (no terminal) es el criterio honesto,
// y ya tiene precedente: es el mismo conjunto que usa el "Mis Asuntos" interno de staff (p. ej.
// supabase/migrations/20260934140000_ola1_cartera_asuntos.sql) para "pendiente".
//
// El enum real tiene 10 valores, no 7: `recibida_externa`/`rechazada_triage` (parche GOB-8,
// 20260932790000) y `cancelada_por_solicitante` (EXT-02, 20260932820000) se agregaron después vía
// ALTER TYPE — un vistazo a la migración de creación del tipo (20260931850000) no los muestra;
// hallado al probar en navegador con una solicitud QA real en recibida_externa, no al leer código
// (mismo tipo de gap que ya costó un bug real en Ola 1 con concepto_id). `comment on type
// solicitud_estado_t` (20260932820000) es la fuente de verdad: recibida_externa NO es terminal
// (pendiente de triage humano, no cuenta para SLA); resuelta/cerrada/anulada/rechazada_triage/
// cancelada_por_solicitante SÍ lo son.
const ESTADOS_ABIERTOS = new Set(['nueva', 'asignada', 'en_atencion', 'en_espera', 'recibida_externa'])

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

const badgeFinanzas = computed(() => ((resumen.value?.saldo_total ?? 0) > 0 ? 1 : 0))
const badgeSolicitudes = computed(
  () => solicitudes.value.filter((s) => ESTADOS_ABIERTOS.has(s.estado)).length,
)
// §5 (patrón de badges): derivado de un dato que external-correspondencia-listar ya trae, no un
// contador inventado — cantidad sin recoger todavía (entregada=false).
const badgeCorrespondencia = computed(() => correspondencia.value.filter((c) => !c.entregada).length)
const solicitudesRecientes = computed(() => solicitudes.value.slice(0, 3))

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

    const vinculoId = actorExterno.vinculoActivo.vinculo_id
    const [resumenResultado, solicitudesResultado, correspondenciaResultado] = await Promise.all([
      obtenerCuentaResumen(vinculoId),
      listarSolicitudesExternas(vinculoId),
      listarCorrespondenciaExterna(vinculoId),
    ])
    resumen.value = resumenResultado
    solicitudes.value = solicitudesResultado
    correspondencia.value = correspondenciaResultado
  } catch (err) {
    error.value = mensajeError(err, 'No se pudo cargar la información de tu copropiedad.')
  } finally {
    cargando.value = false
  }
})
</script>

<template>
  <div class="mx-auto max-w-md space-y-5 p-4">
    <div>
      <p class="text-xs text-gray-500 dark:text-gray-400">Hola</p>
      <h1 class="truncate text-lg font-semibold text-gray-900 dark:text-white">
        {{ actorExterno.vinculoActivo?.tenant_nombre ?? 'Mi Copropiedad' }}
      </h1>
    </div>

    <UAlert v-if="error" color="error" variant="soft" :title="error" />

    <template v-else>
      <NuxtLink to="/mi-copropiedad/finanzas" class="block">
        <MiCopropiedadSaldoCard :resumen="resumen" :cargando="cargando" :detalle="false" />
      </NuxtLink>

      <div>
        <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Accesos rápidos</p>
        <div class="grid grid-cols-2 gap-3">
          <NuxtLink
            to="/mi-copropiedad/finanzas"
            class="relative flex flex-col items-center gap-1.5 rounded-xl border border-default bg-elevated py-4"
          >
            <UIcon name="i-lucide-wallet" class="size-6 text-primary-600 dark:text-primary-400" />
            <span class="text-xs font-medium text-gray-700 dark:text-gray-200">Finanzas</span>
            <span
              v-if="badgeFinanzas > 0"
              class="absolute top-1.5 right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-semibold text-white"
            >{{ badgeFinanzas }}</span>
          </NuxtLink>
          <NuxtLink
            to="/mi-copropiedad/solicitudes"
            class="relative flex flex-col items-center gap-1.5 rounded-xl border border-default bg-elevated py-4"
          >
            <UIcon name="i-lucide-message-square" class="size-6 text-primary-600 dark:text-primary-400" />
            <span class="text-xs font-medium text-gray-700 dark:text-gray-200">Solicitudes</span>
            <span
              v-if="badgeSolicitudes > 0"
              class="absolute top-1.5 right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-semibold text-white"
            >{{ badgeSolicitudes }}</span>
          </NuxtLink>
          <NuxtLink
            to="/mi-copropiedad/visitas"
            class="flex flex-col items-center gap-1.5 rounded-xl border border-default bg-elevated py-4"
          >
            <UIcon name="i-lucide-qr-code" class="size-6 text-primary-600 dark:text-primary-400" />
            <span class="text-xs font-medium text-gray-700 dark:text-gray-200">Visitas</span>
          </NuxtLink>
          <NuxtLink
            to="/mi-copropiedad/reservas"
            class="flex flex-col items-center gap-1.5 rounded-xl border border-default bg-elevated py-4"
          >
            <UIcon name="i-lucide-calendar-check" class="size-6 text-primary-600 dark:text-primary-400" />
            <span class="text-xs font-medium text-gray-700 dark:text-gray-200">Reservas</span>
          </NuxtLink>
          <NuxtLink
            to="/mi-copropiedad/documentos"
            class="flex flex-col items-center gap-1.5 rounded-xl border border-default bg-elevated py-4"
          >
            <UIcon name="i-lucide-file-text" class="size-6 text-primary-600 dark:text-primary-400" />
            <span class="text-xs font-medium text-gray-700 dark:text-gray-200">Documentos</span>
          </NuxtLink>
          <NuxtLink
            to="/mi-copropiedad/correspondencia"
            class="relative flex flex-col items-center gap-1.5 rounded-xl border border-default bg-elevated py-4"
          >
            <UIcon name="i-lucide-package" class="size-6 text-primary-600 dark:text-primary-400" />
            <span class="text-xs font-medium text-gray-700 dark:text-gray-200">Correspondencia</span>
            <span
              v-if="badgeCorrespondencia > 0"
              class="absolute top-1.5 right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-semibold text-white"
            >{{ badgeCorrespondencia }}</span>
          </NuxtLink>
          <NuxtLink
            to="/mi-copropiedad/contactos"
            class="flex flex-col items-center gap-1.5 rounded-xl border border-default bg-elevated py-4"
          >
            <UIcon name="i-lucide-phone" class="size-6 text-primary-600 dark:text-primary-400" />
            <span class="text-xs font-medium text-gray-700 dark:text-gray-200">Contactos</span>
          </NuxtLink>
        </div>
      </div>

      <div v-if="!cargando">
        <div class="mb-2 flex items-center justify-between">
          <p class="text-xs font-semibold uppercase tracking-wide text-gray-400">Solicitudes recientes</p>
          <NuxtLink
            v-if="solicitudes.length > 0"
            to="/mi-copropiedad/solicitudes"
            class="text-xs font-medium text-primary-600 dark:text-primary-400"
          >Ver todas</NuxtLink>
        </div>
        <p v-if="solicitudesRecientes.length === 0" class="text-sm text-gray-500 dark:text-gray-400">
          No has hecho ninguna solicitud todavía.
        </p>
        <div v-else class="divide-y divide-default rounded-xl border border-default bg-elevated px-4">
          <NuxtLink
            v-for="s in solicitudesRecientes"
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
  </div>
</template>
