<script setup lang="ts">
// Centro de escalamiento, aprobaciones y bitácora (CAR §11, bloque 18) —
// la cola de decisiones sobre la etapa de cobranza de cada inmueble.
//
// Solo aparecen aquí los inmuebles con una PROPUESTA pendiente: el job
// diario ya distingue transición automática (se confirma sola) de
// transición que exige aprobación (queda en etapa_propuesta) — CAR §11.3.
// Toda fila de esta bandeja, sin excepción, exige rol administrador y
// prohíbe que quien propuso también confirme (REQ-CAR-011, mismo
// maker-checker que /cartera/acciones).
//
// La bitácora es eventos_cartera filtrada a CARTERA_ETAPA_CAMBIO: el
// antes/después/motivo que el job ya registra cada vez que propone o
// confirma una etapa (I-C13) — no un historial reconstruido a mano.
import { formatoMoneda } from '~/utils/formato'
import type { EventoEscalamiento, FilaBandejaEscalamiento } from '~/stores/escalamiento'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const tenantStore = useTenantStore()
const escalamientoStore = useEscalamientoStore()
const authStore = useAuthStore()
const toast = useToast()

const errorCarga = ref<string | null>(null)
const procesando = ref<string | null>(null)
const vista = ref<'bandeja' | 'bitacora'>('bandeja')

const ETIQUETA_ETAPA: Record<string, string> = {
  preventiva: 'Preventiva',
  administrativa: 'Administrativa',
  prejuridica: 'Prejurídica',
  juridica: 'Jurídica',
  judicial: 'Judicial',
}

const COLOR_ETAPA: Record<string, 'neutral' | 'warning' | 'error'> = {
  preventiva: 'neutral',
  administrativa: 'neutral',
  prejuridica: 'warning',
  juridica: 'error',
  judicial: 'error',
}

function fechaHoy(): string {
  return new Date().toISOString().slice(0, 10)
}

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  errorCarga.value = null
  try {
    await Promise.all([
      escalamientoStore.cargarBandeja(tenantId, fechaHoy()),
      escalamientoStore.cargarBitacora(tenantId),
    ])
  } catch (excepcion) {
    errorCarga.value = excepcion instanceof Error ? excepcion.message : 'No se pudo cargar el centro de escalamiento.'
  }
}

await useAsyncData('cartera-escalamiento-inicial', async () => {
  await cargar()
  return null
})

watch(() => tenantStore.activeTenant?.id, cargar)

const bandeja = computed(() => escalamientoStore.bandeja)
const bitacora = computed(() => escalamientoStore.bitacora)
const esAdministrador = computed(() => tenantStore.role === 'administrador')

/** Mismo criterio que motivoNoPuedeDecidir en /cartera/acciones. */
function motivoNoPuedeDecidir(fila: FilaBandejaEscalamiento): string | null {
  if (!esAdministrador.value) {
    return 'Confirmar o rechazar una transición de etapa requiere rol administrador (CAR §11.3).'
  }
  if (fila.propuestoPor === authStore.profile?.id) {
    return 'No puedes confirmar una transición de etapa que tú mismo propusiste.'
  }
  return null
}

async function confirmar(fila: FilaBandejaEscalamiento): Promise<void> {
  procesando.value = fila.inmuebleId
  try {
    await escalamientoStore.confirmarEtapa(fila.inmuebleId, fila.etapaPropuesta)
    toast.add({
      title: 'Transición confirmada',
      description: `Unidad ${fila.inmuebleCodigo} · ${ETIQUETA_ETAPA[fila.etapa] ?? fila.etapa} → ${ETIQUETA_ETAPA[fila.etapaPropuesta] ?? fila.etapaPropuesta}`,
      color: 'success',
    })
    await cargar()
  } catch (excepcion) {
    toast.add({
      title: 'No se pudo confirmar la transición',
      description: excepcion instanceof Error ? excepcion.message : 'Error inesperado.',
      color: 'error',
    })
  } finally {
    procesando.value = null
  }
}

async function rechazar(fila: FilaBandejaEscalamiento): Promise<void> {
  procesando.value = fila.inmuebleId
  try {
    await escalamientoStore.rechazarPropuesta(fila.inmuebleId)
    toast.add({
      title: 'Propuesta rechazada',
      description: `Unidad ${fila.inmuebleCodigo} permanece en ${ETIQUETA_ETAPA[fila.etapa] ?? fila.etapa}.`,
      color: 'neutral',
    })
    await cargar()
  } catch (excepcion) {
    toast.add({
      title: 'No se pudo rechazar la propuesta',
      description: excepcion instanceof Error ? excepcion.message : 'Error inesperado.',
      color: 'error',
    })
  } finally {
    procesando.value = null
  }
}

function fechaHora(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })
}

function etiquetaEstadoEvento(evento: EventoEscalamiento): string {
  const nuevo = evento.estadoNuevo as { etapa?: string; requiereAprobacion?: boolean } | null
  if (!nuevo?.etapa) return evento.motivo
  const etiqueta = ETIQUETA_ETAPA[nuevo.etapa] ?? nuevo.etapa
  return nuevo.requiereAprobacion ? `Propuesta hacia ${etiqueta}` : `Confirmada hacia ${etiqueta}`
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-xl font-semibold mb-2">Centro de escalamiento</h1>
      <p class="text-sm text-neutral-500">
        Transiciones de etapa que esperan tu confirmación, y la bitácora de lo ya decidido.
      </p>
    </div>

    <UAlert
      v-if="errorCarga"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="No se pudo cargar"
      :description="errorCarga"
    />

    <div class="flex items-center gap-2">
      <UButton
        size="sm"
        :variant="vista === 'bandeja' ? 'solid' : 'outline'"
        :color="vista === 'bandeja' ? 'primary' : 'neutral'"
        @click="vista = 'bandeja'"
      >
        Esperan confirmación
        <UBadge v-if="bandeja.length > 0" size="sm" color="warning" variant="subtle" class="ml-1">
          {{ bandeja.length }}
        </UBadge>
      </UButton>
      <UButton
        size="sm"
        :variant="vista === 'bitacora' ? 'solid' : 'outline'"
        :color="vista === 'bitacora' ? 'primary' : 'neutral'"
        @click="vista = 'bitacora'"
      >
        Bitácora
      </UButton>
      <UButton
        icon="i-lucide-refresh-cw"
        size="sm"
        variant="ghost"
        color="neutral"
        :loading="escalamientoStore.loading || escalamientoStore.loadingBitacora"
        class="ml-auto"
        @click="cargar"
      >
        Actualizar
      </UButton>
    </div>

    <p v-if="vista === 'bandeja' && !esAdministrador" class="text-xs text-neutral-500 flex items-center gap-1.5">
      <UIcon name="i-lucide-info" class="size-3.5 shrink-0" />
      Tu rol permite ver la bandeja, pero confirmar o rechazar una transición de etapa requiere rol
      administrador (CAR §11.3).
    </p>

    <!-- ── bandeja de aprobaciones ──────────────────────────────────── -->
    <template v-if="vista === 'bandeja'">
      <p v-if="bandeja.length === 0 && !escalamientoStore.loading" class="text-sm text-neutral-500">
        No hay transiciones de etapa esperando confirmación.
      </p>

      <UiTabla
        v-else
        variante="tailwind"
        :columnas="[
          { clave: 'unidad', etiqueta: 'Unidad' },
          { clave: 'transicion', etiqueta: 'Transición propuesta' },
          { clave: 'motivo', etiqueta: 'Motivo' },
          { clave: 'mora', etiqueta: 'Mora', alinear: 'derecha' },
          { clave: 'deuda', etiqueta: 'Deuda', alinear: 'derecha' },
          { clave: 'operaciones', etiqueta: '' },
        ]"
        :filas="bandeja"
        :clave-fila="(fila) => fila.inmuebleId"
      >
        <template #celda-unidad="{ fila }">
          <NuxtLink :to="`/cartera/expediente/${fila.inmuebleId}`" class="font-medium hover:underline">
            {{ fila.inmuebleCodigo }}
          </NuxtLink>
        </template>

        <template #celda-transicion="{ fila }">
          <div class="flex items-center gap-1.5">
            <UBadge :color="COLOR_ETAPA[fila.etapa] ?? 'neutral'" variant="subtle" size="sm">
              {{ ETIQUETA_ETAPA[fila.etapa] ?? fila.etapa }}
            </UBadge>
            <UIcon name="i-lucide-arrow-right" class="size-3.5 text-neutral-400" />
            <UBadge :color="COLOR_ETAPA[fila.etapaPropuesta] ?? 'neutral'" variant="subtle" size="sm">
              {{ ETIQUETA_ETAPA[fila.etapaPropuesta] ?? fila.etapaPropuesta }}
            </UBadge>
          </div>
          <p class="text-xs text-neutral-400 mt-1">Propuesta {{ fechaHora(fila.propuestoAt) }}</p>
        </template>

        <template #celda-motivo="{ fila }">
          <p class="text-sm max-w-xs">{{ fila.motivoPropuesta }}</p>
        </template>

        <template #celda-mora="{ fila }">
          <span class="tabular-nums">{{ fila.diasMora }} d</span>
        </template>

        <template #celda-deuda="{ fila }">
          <span class="tabular-nums">{{ formatoMoneda(fila.deudaTotal) }}</span>
        </template>

        <template #celda-operaciones="{ fila }">
          <div class="flex items-center justify-end gap-1">
            <UButton
              size="xs"
              color="primary"
              :disabled="motivoNoPuedeDecidir(fila) !== null"
              :loading="procesando === fila.inmuebleId"
              :title="motivoNoPuedeDecidir(fila) ?? 'Confirmar la transición'"
              @click="confirmar(fila)"
            >
              Confirmar
            </UButton>
            <UButton
              size="xs"
              color="neutral"
              variant="outline"
              :disabled="procesando === fila.inmuebleId"
              :loading="procesando === fila.inmuebleId"
              title="Retirar la propuesta — cualquier gestor puede hacerlo"
              @click="rechazar(fila)"
            >
              Rechazar
            </UButton>
          </div>
        </template>
      </UiTabla>
    </template>

    <!-- ── bitácora ─────────────────────────────────────────────────── -->
    <template v-else>
      <p v-if="bitacora.length === 0 && !escalamientoStore.loadingBitacora" class="text-sm text-neutral-500">
        Todavía no hay cambios de etapa registrados.
      </p>

      <div v-else class="space-y-2">
        <div
          v-for="evento in bitacora"
          :key="evento.id"
          class="rounded-md border border-neutral-200 dark:border-neutral-800 p-3 flex items-center justify-between gap-3"
        >
          <div>
            <p class="text-sm font-medium">{{ etiquetaEstadoEvento(evento) }}</p>
            <p class="text-xs text-neutral-500">{{ evento.motivo }}</p>
          </div>
          <div class="text-right shrink-0">
            <p class="text-xs text-neutral-400">{{ fechaHora(evento.ocurridoAt) }}</p>
            <NuxtLink
              v-if="evento.inmuebleId"
              :to="`/cartera/expediente/${evento.inmuebleId}`"
              class="text-xs text-primary-500 hover:underline"
            >
              Ver expediente
            </NuxtLink>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
