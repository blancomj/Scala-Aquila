<script setup lang="ts">
const tenantStore = useTenantStore()
const auditoriaStore = useAuditoriaStore()

const puedeEscribir = computed(() => tenantStore.role === 'auditor' || tenantStore.role === 'administrador')

const modalAbierto = ref(false)
const guardando = ref(false)
const errorGuardado = ref<string | null>(null)
const erroresCierre = reactive<Record<string, string>>({})
const evidenciaCierrePorAccion = reactive<Record<string, string>>({})

const hallazgoId = ref<string | undefined>(undefined)
const accionTexto = ref('')
const prioridad = ref<'ALTA' | 'MEDIA' | 'BAJA'>('MEDIA')
const fechaCompromiso = ref('')

const PRIORIDAD_ITEMS = [
  { label: 'Alta', value: 'ALTA' },
  { label: 'Media', value: 'MEDIA' },
  { label: 'Baja', value: 'BAJA' },
]

const hallazgoItems = computed(() =>
  auditoriaStore.hallazgos.map((h) => ({ label: h.proceso, value: h.id })),
)

const COLOR_ESTADO: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  CERRADA: 'success',
  EN_VERIFICACION: 'warning',
  RECHAZADA: 'error',
  BLOQUEADA: 'error',
}

function abrirModal(): void {
  hallazgoId.value = auditoriaStore.hallazgos[0]?.id
  accionTexto.value = ''
  prioridad.value = 'MEDIA'
  fechaCompromiso.value = ''
  errorGuardado.value = null
  modalAbierto.value = true
}

async function guardar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !hallazgoId.value || !accionTexto.value.trim()) return
  guardando.value = true
  errorGuardado.value = null
  try {
    await auditoriaStore.crearAccion(tenantId, {
      hallazgo_id: hallazgoId.value,
      accion: accionTexto.value.trim(),
      prioridad: prioridad.value,
      fecha_compromiso: fechaCompromiso.value || null,
      fecha_inicio: null,
      responsable: null,
      estado: 'PENDIENTE',
      evidencia_cierre: null,
    })
    modalAbierto.value = false
  } catch (error) {
    errorGuardado.value = mensajeError(error, 'No se pudo guardar la acción.')
  } finally {
    guardando.value = false
  }
}

async function avanzar(accionId: string, estado: string): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  erroresCierre[accionId] = ''
  try {
    await auditoriaStore.actualizarAccion(tenantId, accionId, { estado })
  } catch (error) {
    erroresCierre[accionId] = mensajeError(error, 'No se pudo actualizar la acción.')
  }
}

async function cerrar(accionId: string): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  const evidencia = evidenciaCierrePorAccion[accionId]?.trim()
  if (!tenantId || !evidencia) {
    erroresCierre[accionId] = 'Escribe una referencia de evidencia de cierre antes de cerrar.'
    return
  }
  erroresCierre[accionId] = ''
  try {
    await auditoriaStore.actualizarAccion(tenantId, accionId, {
      estado: 'CERRADA',
      evidencia_cierre: [evidencia],
    })
    evidenciaCierrePorAccion[accionId] = ''
  } catch (error) {
    const mensaje = mensajeError(error, 'No se pudo cerrar la acción.')
    erroresCierre[accionId] = mensaje.includes('AUD-CIERRE')
      ? 'No se puede cerrar sin evidencia de cierre.'
      : mensaje
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex justify-end">
      <UButton
        v-if="puedeEscribir"
        icon="i-lucide-plus"
        size="sm"
        :disabled="auditoriaStore.hallazgos.length === 0"
        :title="auditoriaStore.hallazgos.length === 0 ? 'Crea un hallazgo primero' : undefined"
        @click="abrirModal"
      >
        Nueva acción
      </UButton>
    </div>

    <div v-if="auditoriaStore.acciones.length === 0" class="text-sm text-neutral-500 py-8 text-center">
      Sin acciones de seguimiento registradas.
    </div>
    <div v-else class="space-y-2">
      <div
        v-for="accion in auditoriaStore.acciones"
        :key="accion.id"
        class="border border-neutral-200 dark:border-neutral-800 rounded-md p-4 space-y-2"
      >
        <div class="flex items-start justify-between gap-4">
          <h3 class="text-sm font-medium text-neutral-900 dark:text-neutral-100">{{ accion.accion }}</h3>
          <UBadge :color="COLOR_ESTADO[accion.estado] ?? 'neutral'" variant="subtle">{{ accion.estado.replace('_', ' ') }}</UBadge>
        </div>
        <p class="text-xs text-neutral-500 dark:text-neutral-400">
          Vencimiento: {{ accion.fecha_compromiso ? new Date(accion.fecha_compromiso).toLocaleDateString('es-CO') : 'No definido' }}
        </p>

        <div v-if="accion.estado !== 'CERRADA' && accion.estado !== 'RECHAZADA'" class="flex flex-wrap items-center gap-2 pt-1">
          <USelect
            :model-value="accion.estado"
            :items="['PENDIENTE', 'EN_PROGRESO', 'BLOQUEADA', 'IMPLEMENTADA', 'EN_VERIFICACION'].map((v) => ({ label: v.replace('_', ' '), value: v }))"
            value-key="value"
            size="xs"
            class="w-44"
            @update:model-value="(v) => avanzar(accion.id, String(v))"
          />
          <UInput
            v-model="evidenciaCierrePorAccion[accion.id]"
            size="xs"
            placeholder="Referencia de evidencia de cierre"
            class="w-56"
          />
          <UButton size="xs" color="neutral" variant="outline" @click="cerrar(accion.id)">Cerrar</UButton>
        </div>
        <p v-if="erroresCierre[accion.id]" class="text-xs text-error-600">{{ erroresCierre[accion.id] }}</p>
      </div>
    </div>

    <UModal v-model:open="modalAbierto" title="Nueva acción de seguimiento">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Hallazgo" name="hallazgoId" required>
            <USelect v-model="hallazgoId" :items="hallazgoItems" value-key="value" class="w-full" />
          </UFormField>
          <UFormField label="Acción" name="accionTexto" required>
            <UTextarea v-model="accionTexto" class="w-full" :rows="2" autoresize />
          </UFormField>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Prioridad" name="prioridad">
              <USelect v-model="prioridad" :items="PRIORIDAD_ITEMS" value-key="value" class="w-full" />
            </UFormField>
            <UFormField label="Fecha de compromiso" name="fechaCompromiso">
              <UInput v-model="fechaCompromiso" type="date" class="w-full" />
            </UFormField>
          </div>
          <p v-if="errorGuardado" class="text-sm text-error-600">{{ errorGuardado }}</p>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="ghost" @click="modalAbierto = false">Cancelar</UButton>
        <UButton :loading="guardando" :disabled="!hallazgoId || !accionTexto.trim()" @click="guardar">Guardar</UButton>
      </template>
    </UModal>
  </div>
</template>
