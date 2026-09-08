<script setup lang="ts">
// GOB-8 §4.6: detalle de una solicitud — línea de tiempo de actuaciones (append-only) y
// escalamiento a un destino ya existente (decisión, expediente de convivencia o punto de agenda).
// El estado SOLO avanza por gobierno_registrar_actuacion_solicitud() — nunca un UPDATE directo.
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

type SolicitudEstado = Database['public']['Enums']['solicitud_estado_t']
type DecisionOpcion = { id: string; numero: number; anio: number; titulo: string }
type ExpedienteOpcion = { id: string; numero: number; anio: number }
type AgendaPuntoOpcion = { id: string; titulo: string }

const ESTADOS_REGISTRABLES: SolicitudEstado[] = ['asignada', 'en_atencion', 'en_espera', 'resuelta', 'cerrada', 'anulada']
const ESTADO_ETIQUETA: Record<string, string> = {
  nueva: 'Nueva', asignada: 'Asignada', en_atencion: 'En atención', en_espera: 'En espera',
  resuelta: 'Resuelta', cerrada: 'Cerrada', anulada: 'Anulada',
}
const ESTADO_COLOR: Record<string, 'neutral' | 'primary' | 'warning' | 'success' | 'error'> = {
  nueva: 'neutral', asignada: 'primary', en_atencion: 'primary', en_espera: 'warning',
  resuelta: 'success', cerrada: 'success', anulada: 'error',
}
const ESTADOS_TERMINALES = ['cerrada', 'anulada']

const route = useRoute()
const solicitudId = route.params.id as string
const tenantStore = useTenantStore()
const atencionStore = useGobiernoAtencionStore()

const error = ref<string | null>(null)
const decisiones = ref<DecisionOpcion[]>([])
const expedientes = ref<ExpedienteOpcion[]>([])
const agendaPuntos = ref<AgendaPuntoOpcion[]>([])

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  error.value = null
  try {
    await atencionStore.cargarSolicitud(solicitudId)
    const cliente = useSupabaseClient<Database>()
    const [{ data: decisionesFilas }, { data: expedientesFilas }, { data: agendaFilas }] = await Promise.all([
      cliente.from('gobierno_decisiones').select('id, numero, anio, titulo').eq('tenant_id', tenantId)
        .order('anio', { ascending: false }).order('numero', { ascending: false }),
      cliente.from('gobierno_expedientes_convivencia').select('id, numero, anio').eq('tenant_id', tenantId)
        .order('anio', { ascending: false }).order('numero', { ascending: false }),
      cliente.from('gobierno_agenda_puntos').select('id, titulo').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
    ])
    decisiones.value = decisionesFilas ?? []
    expedientes.value = expedientesFilas ?? []
    agendaPuntos.value = agendaFilas ?? []
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo cargar la solicitud.')
  }
}
onMounted(cargar)
onUnmounted(() => atencionStore.limpiar())

const esTerminal = computed(() => !!atencionStore.solicitud && ESTADOS_TERMINALES.includes(atencionStore.solicitud.estado))
const vencida = computed(() => {
  const s = atencionStore.solicitud
  return !!s?.sla_vence_at && new Date(s.sla_vence_at).getTime() < Date.now()
})

// ── registrar actuación ───────────────────────────────────────────────
const formActuacion = reactive({
  estadoNuevo: 'en_atencion' as SolicitudEstado, fecha: new Date().toISOString().slice(0, 10),
  descripcion: '', esRespuesta: false, motivo: '',
})
const requiereMotivo = computed(() => formActuacion.estadoNuevo === 'en_espera' || formActuacion.estadoNuevo === 'anulada')
async function registrarActuacion(): Promise<void> {
  if (!formActuacion.descripcion.trim() || (requiereMotivo.value && !formActuacion.motivo.trim())) return
  error.value = null
  try {
    await atencionStore.registrarActuacion({
      solicitudId, estadoNuevo: formActuacion.estadoNuevo, fecha: formActuacion.fecha,
      descripcion: formActuacion.descripcion.trim(), esRespuesta: formActuacion.esRespuesta,
      motivo: requiereMotivo.value ? formActuacion.motivo.trim() : undefined,
    })
    formActuacion.descripcion = ''
    formActuacion.esRespuesta = false
    formActuacion.motivo = ''
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo registrar la actuación.')
  }
}

// ── escalar ───────────────────────────────────────────────────────────
const formEscalar = reactive({
  destinoTipo: 'decision' as 'decision' | 'expediente_convivencia' | 'agenda_punto',
  destinoId: null as string | null,
})
const opcionesDestino = computed(() => {
  if (formEscalar.destinoTipo === 'decision') return decisiones.value.map((d) => ({ valor: d.id, etiqueta: `${d.numero}/${d.anio} · ${d.titulo}` }))
  if (formEscalar.destinoTipo === 'expediente_convivencia') return expedientes.value.map((e) => ({ valor: e.id, etiqueta: `Expediente ${e.numero}/${e.anio}` }))
  return agendaPuntos.value.map((a) => ({ valor: a.id, etiqueta: a.titulo }))
})
async function escalar(): Promise<void> {
  if (!formEscalar.destinoId) return
  error.value = null
  try {
    await atencionStore.escalarSolicitud({ solicitudId, destinoTipo: formEscalar.destinoTipo, destinoId: formEscalar.destinoId })
    formEscalar.destinoId = null
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo escalar la solicitud.')
  }
}
</script>

<template>
  <div class="space-y-6">
    <div v-if="atencionStore.solicitud" class="space-y-6">
      <NuxtLink to="/atencion" class="text-xs text-muted hover:underline">← Volver a atención</NuxtLink>
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 class="text-xl font-semibold">{{ atencionStore.solicitud.numero }}/{{ atencionStore.solicitud.anio }} · {{ atencionStore.solicitud.asunto }}</h1>
          <p class="text-sm text-muted">
            {{ atencionStore.solicitud.inmueble?.codigo }} ·
            {{ atencionStore.solicitud.solicitante?.primer_nombre }} {{ atencionStore.solicitud.solicitante?.primer_apellido }}
            ({{ atencionStore.solicitud.calidad }}) ·
            {{ atencionStore.solicitud.tipo?.nombre }} / {{ atencionStore.solicitud.categoria?.nombre }} · {{ atencionStore.solicitud.prioridad?.nombre }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <UBadge v-if="vencida" color="error" variant="soft">SLA vencido</UBadge>
          <UBadge :color="ESTADO_COLOR[atencionStore.solicitud.estado] ?? 'neutral'" variant="soft" size="lg">
            {{ ESTADO_ETIQUETA[atencionStore.solicitud.estado] ?? atencionStore.solicitud.estado }}
          </UBadge>
        </div>
      </div>

      <UAlert v-if="error" color="error" variant="soft" :title="error" />

      <p v-if="atencionStore.solicitud.descripcion" class="text-sm">{{ atencionStore.solicitud.descripcion }}</p>
      <p v-if="atencionStore.solicitud.sla_vence_at" class="text-xs text-muted">
        SLA vence: {{ new Date(atencionStore.solicitud.sla_vence_at).toLocaleString('es-CO') }}
        <template v-if="atencionStore.solicitud.en_espera_desde"> · en espera desde {{ new Date(atencionStore.solicitud.en_espera_desde).toLocaleString('es-CO') }}</template>
      </p>

      <!-- ── Bitácora de actuaciones ──────────────────────────────────── -->
      <section class="rounded-lg border border-default p-4 space-y-3">
        <p class="font-medium">Bitácora de actuaciones (append-only)</p>
        <ul class="text-sm space-y-2">
          <li v-for="a in atencionStore.actuaciones" :key="a.id" class="border-b border-default pb-2 last:border-0">
            <p>
              {{ a.fecha }} · <span class="font-medium">{{ ESTADO_ETIQUETA[a.estado] ?? a.estado }}</span>
              <UBadge v-if="a.es_respuesta" size="xs" color="success" variant="soft" class="ml-1">respuesta</UBadge>
            </p>
            <p class="text-muted">{{ a.descripcion }}</p>
          </li>
        </ul>
        <p v-if="atencionStore.actuaciones.length === 0" class="text-sm text-muted">Sin actuaciones registradas todavía.</p>

        <div v-if="!esTerminal" class="pt-2 border-t border-default space-y-2">
          <div class="grid gap-2 sm:grid-cols-3">
            <UFormField label="Nuevo estado">
              <USelect v-model="formActuacion.estadoNuevo" :items="ESTADOS_REGISTRABLES.map((e) => ({ label: ESTADO_ETIQUETA[e], value: e }))" />
            </UFormField>
            <UFormField label="Fecha"><UInput v-model="formActuacion.fecha" type="date" class="w-full" /></UFormField>
            <UFormField label="Es respuesta"><UCheckbox v-model="formActuacion.esRespuesta" /></UFormField>
          </div>
          <UFormField label="Descripción"><UTextarea v-model="formActuacion.descripcion" class="w-full" :rows="2" /></UFormField>
          <UFormField v-if="requiereMotivo" label="Motivo (obligatorio)">
            <UInput v-model="formActuacion.motivo" class="w-full" />
          </UFormField>
          <UButton
            :loading="atencionStore.guardando"
            :disabled="!formActuacion.descripcion.trim() || (requiereMotivo && !formActuacion.motivo.trim())"
            @click="registrarActuacion()"
          >
            Registrar actuación
          </UButton>
        </div>
      </section>

      <!-- ── Escalar ──────────────────────────────────────────────────── -->
      <section class="rounded-lg border border-default p-4 space-y-3">
        <p class="font-medium">Escalar a un destino ya existente</p>
        <p class="text-xs text-muted">
          Deja la trazabilidad en ambos sentidos — no cambia el estado de la solicitud.
          Orden de trabajo de mantenimiento no está disponible: ese módulo no existe todavía.
        </p>
        <div class="grid gap-2 sm:grid-cols-2">
          <UFormField label="Destino">
            <USelect
              v-model="formEscalar.destinoTipo"
              :items="[
                { label: 'Decisión de gobierno', value: 'decision' },
                { label: 'Expediente de convivencia', value: 'expediente_convivencia' },
                { label: 'Punto de agenda', value: 'agenda_punto' },
              ]"
              @update:model-value="formEscalar.destinoId = null"
            />
          </UFormField>
          <UFormField label="Elegir">
            <UiSelectorBuscable v-model="formEscalar.destinoId" :opciones="opcionesDestino" />
          </UFormField>
        </div>
        <UButton variant="soft" :loading="atencionStore.guardando" :disabled="!formEscalar.destinoId" @click="escalar()">
          Escalar
        </UButton>
        <div class="text-xs text-muted space-x-3">
          <span v-if="atencionStore.solicitud.decision_id">Ya enlazada a una decisión.</span>
          <span v-if="atencionStore.solicitud.expediente_convivencia_id">Ya enlazada a un expediente de convivencia.</span>
          <span v-if="atencionStore.solicitud.agenda_punto_id">Ya enlazada a un punto de agenda.</span>
        </div>
      </section>
    </div>
    <p v-else-if="!atencionStore.loading" class="text-sm text-muted">Solicitud no encontrada.</p>
  </div>
</template>
