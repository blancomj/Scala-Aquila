<script setup lang="ts">
// Pestaña "Solicitudes de uso" — segregación de funciones (D-37,
// guard_fondo_solicitud_uso_transicion): quien solicita no puede decidir su propia solicitud,
// y quien aprueba no puede comprometer su propia decisión. El espejo cliente de esa regla
// sigue el mismo patrón que motivoNoPuedeDecidir en cartera/acciones.vue: una función que
// devuelve la razón (no un booleano), para que el botón ausente siempre venga acompañado de
// por qué, nunca un botón gris sin explicación.
import type { Database } from '@aquila/shared'
import type { ColumnaTabla } from '~/components/ui/UiTabla.vue'

type FondoSolicitudUsoRow = Database['public']['Tables']['fondo_solicitudes_uso']['Row']

const tenantStore = useTenantStore()
const authStore = useAuthStore()
const fondosStore = useFondosStore()
const toast = useToast()
const fondoId = useSeleccionFondo()

const puedeCrear = computed(() => tenantStore.puede('data:create'))
const esAdministrador = computed(() => tenantStore.role === 'administrador')
const mostrarDrawerCrear = ref(false)
const procesando = ref<string | null>(null)
const solicitudRechazar = ref<FondoSolicitudUsoRow | null>(null)
const modalRechazoAbierto = ref(false)
const motivoRechazo = ref('')

watch(
  fondoId,
  async (id) => {
    if (id) await fondosStore.cargarSolicitudes(id)
  },
  { immediate: true },
)

const columnas: ColumnaTabla<FondoSolicitudUsoRow>[] = [
  { clave: 'objetivo', etiqueta: 'Objetivo' },
  { clave: 'monto_solicitado', etiqueta: 'Monto', alinear: 'derecha' },
  { clave: 'estado', etiqueta: 'Estado' },
  { clave: 'fecha', etiqueta: 'Fecha' },
  { clave: 'operaciones', etiqueta: '' },
]

function motivoNoPuedeDecidir(s: FondoSolicitudUsoRow): string | null {
  if (s.estado !== 'en_revision') return 'Esta solicitud no está en revisión.'
  if (!esAdministrador.value) return 'Aprobar o rechazar exige rol administrador.'
  if (s.solicitante_id === authStore.profile?.id) return 'No puedes decidir tu propia solicitud.'
  return null
}

function motivoNoPuedeComprometer(s: FondoSolicitudUsoRow): string | null {
  if (s.estado !== 'aprobada') return null
  if (s.aprobador_id === authStore.profile?.id) return 'Quien aprobó no puede comprometer su propia decisión.'
  return null
}

async function enviarRevision(s: FondoSolicitudUsoRow): Promise<void> {
  if (!fondoId.value) return
  procesando.value = s.id
  try {
    await fondosStore.cambiarEstadoSolicitud(s.id, fondoId.value, 'en_revision')
    toast.add({ title: 'Solicitud enviada a revisión.', color: 'success' })
  } catch (excepcion) {
    toast.add({ title: mensajeError(excepcion, 'No se pudo enviar a revisión.'), color: 'error' })
  } finally {
    procesando.value = null
  }
}

async function decidir(s: FondoSolicitudUsoRow, estado: 'aprobada' | 'rechazada', motivo?: string): Promise<void> {
  if (!fondoId.value) return
  procesando.value = s.id
  try {
    await fondosStore.cambiarEstadoSolicitud(s.id, fondoId.value, estado, motivo)
    toast.add({ title: estado === 'aprobada' ? 'Solicitud aprobada.' : 'Solicitud rechazada.', color: 'success' })
  } catch (excepcion) {
    toast.add({ title: mensajeError(excepcion, 'No se pudo decidir la solicitud.'), color: 'error' })
  } finally {
    procesando.value = null
  }
}

function abrirRechazo(s: FondoSolicitudUsoRow): void {
  solicitudRechazar.value = s
  motivoRechazo.value = ''
  modalRechazoAbierto.value = true
}

async function confirmarRechazo(): Promise<void> {
  if (!solicitudRechazar.value || !motivoRechazo.value.trim()) return
  await decidir(solicitudRechazar.value, 'rechazada', motivoRechazo.value.trim())
  modalRechazoAbierto.value = false
  solicitudRechazar.value = null
}

async function comprometer(s: FondoSolicitudUsoRow): Promise<void> {
  if (!fondoId.value) return
  procesando.value = s.id
  try {
    await fondosStore.cambiarEstadoSolicitud(s.id, fondoId.value, 'comprometida')
    toast.add({ title: 'Solicitud comprometida — se creó el compromiso del fondo.', color: 'success' })
  } catch (excepcion) {
    toast.add({ title: mensajeError(excepcion, 'No se pudo comprometer.'), color: 'error' })
  } finally {
    procesando.value = null
  }
}

async function anular(s: FondoSolicitudUsoRow): Promise<void> {
  if (!fondoId.value) return
  procesando.value = s.id
  try {
    await fondosStore.cambiarEstadoSolicitud(s.id, fondoId.value, 'anulada')
    toast.add({ title: 'Solicitud anulada.', color: 'success' })
  } catch (excepcion) {
    toast.add({ title: mensajeError(excepcion, 'No se pudo anular.'), color: 'error' })
  } finally {
    procesando.value = null
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-end justify-between gap-4 flex-wrap">
      <FondosFondoSelector v-model="fondoId" />
      <UButton v-if="puedeCrear && fondoId" icon="i-lucide-plus" @click="mostrarDrawerCrear = true">
        Nueva solicitud
      </UButton>
    </div>

    <UAlert
      v-if="!esAdministrador"
      color="neutral"
      variant="soft"
      title="Tu rol permite crear y ver solicitudes, pero aprobar o rechazar exige rol administrador."
    />

    <USkeleton v-if="fondosStore.loading" class="h-40 w-full" />
    <UiTabla
      v-else
      :columnas="columnas"
      :filas="fondosStore.solicitudes"
      :clave-fila="(f) => f.id"
      vacio="Este fondo no tiene solicitudes de uso registradas."
    >
      <template #celda-monto_solicitado="{ fila }">{{ formatoMoneda(fila.monto_solicitado) }}</template>
      <template #celda-estado="{ fila }">
        <UBadge :color="COLOR_ESTADO_SOLICITUD[fila.estado] ?? 'neutral'" variant="subtle">
          {{ ETIQUETA_ESTADO_SOLICITUD[fila.estado] ?? fila.estado }}
        </UBadge>
      </template>
      <template #celda-operaciones="{ fila }">
        <div class="flex items-center gap-2 justify-end">
          <UButton
            v-if="fila.estado === 'borrador'"
            size="xs"
            variant="soft"
            :loading="procesando === fila.id"
            @click="enviarRevision(fila)"
          >
            Enviar a revisión
          </UButton>

          <template v-if="fila.estado === 'en_revision'">
            <template v-if="motivoNoPuedeDecidir(fila) === null">
              <UButton size="xs" color="success" variant="soft" :loading="procesando === fila.id" @click="decidir(fila, 'aprobada')">
                Aprobar
              </UButton>
              <UButton size="xs" color="error" variant="soft" :loading="procesando === fila.id" @click="abrirRechazo(fila)">
                Rechazar
              </UButton>
            </template>
            <span v-else class="text-xs text-neutral-400">{{ motivoNoPuedeDecidir(fila) }}</span>
          </template>

          <template v-if="fila.estado === 'aprobada'">
            <UButton
              v-if="motivoNoPuedeComprometer(fila) === null"
              size="xs"
              color="primary"
              variant="soft"
              :loading="procesando === fila.id"
              @click="comprometer(fila)"
            >
              Comprometer
            </UButton>
            <span v-else class="text-xs text-neutral-400">{{ motivoNoPuedeComprometer(fila) }}</span>
          </template>

          <UButton
            v-if="['borrador', 'en_revision', 'aprobada'].includes(fila.estado)"
            size="xs"
            variant="ghost"
            :loading="procesando === fila.id"
            @click="anular(fila)"
          >
            Anular
          </UButton>
        </div>
      </template>
    </UiTabla>

    <FondosFondoSolicitudDrawer
      v-if="mostrarDrawerCrear && fondoId"
      :fondo-id="fondoId"
      @cerrar="mostrarDrawerCrear = false"
      @creada="mostrarDrawerCrear = false"
    />

    <UModal v-model:open="modalRechazoAbierto" title="Rechazar solicitud">
      <template #body>
        <UFormField label="Motivo del rechazo" name="motivo_rechazo">
          <UTextarea v-model="motivoRechazo" class="w-full" :rows="3" autofocus />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" @click="modalRechazoAbierto = false">Cancelar</UButton>
          <UButton color="error" :disabled="!motivoRechazo.trim()" @click="confirmarRechazo">Rechazar</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
