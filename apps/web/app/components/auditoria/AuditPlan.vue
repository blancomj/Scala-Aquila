<script setup lang="ts">
const tenantStore = useTenantStore()
const auditoriaStore = useAuditoriaStore()

const puedeEscribir = computed(() => tenantStore.role === 'auditor' || tenantStore.role === 'administrador')

const modalAbierto = ref(false)
const guardando = ref(false)
const errorGuardado = ref<string | null>(null)

const nombre = ref('')
const objetivo = ref('')
const alcance = ref('')
const periodo = ref('')
const tipo = ref<string | undefined>(undefined)
const prioridad = ref<'ALTA' | 'MEDIA' | 'BAJA'>('MEDIA')

const PRIORIDAD_ITEMS = [
  { label: 'Alta', value: 'ALTA' },
  { label: 'Media', value: 'MEDIA' },
  { label: 'Baja', value: 'BAJA' },
]

const tipoItems = computed(() =>
  auditoriaStore.tiposAuditoria.map((t) => ({ label: t.nombre, value: t.codigo })),
)

onMounted(() => {
  if (auditoriaStore.tiposAuditoria.length === 0) void auditoriaStore.cargarTiposAuditoria()
})

function abrirModal(): void {
  nombre.value = ''
  objetivo.value = ''
  alcance.value = ''
  periodo.value = ''
  tipo.value = auditoriaStore.tiposAuditoria[0]?.codigo
  prioridad.value = 'MEDIA'
  errorGuardado.value = null
  modalAbierto.value = true
}

async function guardar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !nombre.value.trim()) return
  guardando.value = true
  errorGuardado.value = null
  try {
    await auditoriaStore.crearEngagement(tenantId, {
      nombre: nombre.value.trim(),
      objetivo: objetivo.value.trim() || null,
      alcance: alcance.value.trim() || null,
      periodo: periodo.value.trim() || null,
      tipo: tipo.value ?? null,
      prioridad: prioridad.value,
      estado: 'BORRADOR',
      responsable: null,
      fecha_inicio: null,
      fecha_fin: null,
      conclusion: null,
      origen_tipo: null,
      origen_id: null,
    })
    modalAbierto.value = false
  } catch (error) {
    errorGuardado.value = mensajeError(error, 'No se pudo guardar la auditoría.')
  } finally {
    guardando.value = false
  }
}

const COLOR_ESTADO: Record<string, 'success' | 'warning' | 'error' | 'neutral' | 'info'> = {
  CERRADA: 'success',
  FINALIZADA: 'warning',
  CANCELADA: 'error',
  BORRADOR: 'neutral',
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex justify-end">
      <UButton v-if="puedeEscribir" icon="i-lucide-plus" size="sm" @click="abrirModal">
        Nueva auditoría
      </UButton>
    </div>

    <div v-if="auditoriaStore.engagements.length === 0" class="text-sm text-neutral-500 py-8 text-center">
      Sin auditorías programadas.
    </div>
    <div v-else class="space-y-2">
      <div
        v-for="engagement in auditoriaStore.engagements"
        :key="engagement.id"
        class="border border-neutral-200 dark:border-neutral-800 rounded-md p-4"
      >
        <div class="flex items-start justify-between gap-4">
          <div>
            <h3 class="text-sm font-medium text-neutral-900 dark:text-neutral-100">{{ engagement.nombre }}</h3>
            <p v-if="engagement.objetivo" class="text-xs text-neutral-500 dark:text-neutral-400">{{ engagement.objetivo }}</p>
            <div class="flex flex-wrap gap-2 mt-2">
              <UBadge v-if="engagement.tipo" color="neutral" variant="subtle" size="xs">{{ engagement.tipo }}</UBadge>
              <UBadge v-if="engagement.periodo" color="neutral" variant="subtle" size="xs">{{ engagement.periodo }}</UBadge>
              <UBadge v-if="engagement.origen_tipo" color="info" variant="subtle" size="xs">
                Desde {{ engagement.origen_tipo }}
              </UBadge>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <UBadge :color="COLOR_ESTADO[engagement.estado] ?? 'info'" variant="subtle">
              {{ engagement.estado.replace('_', ' ') }}
            </UBadge>
            <UButton
              :to="`/auditoria/informes/${engagement.id}`"
              target="_blank"
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide-file-text"
            >
              Informe
            </UButton>
          </div>
        </div>
      </div>
    </div>

    <UModal v-model:open="modalAbierto" title="Nueva auditoría">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Nombre" name="nombre" required>
            <UInput v-model="nombre" class="w-full" />
          </UFormField>
          <UFormField label="Objetivo" name="objetivo">
            <UTextarea v-model="objetivo" class="w-full" :rows="2" autoresize />
          </UFormField>
          <UFormField label="Alcance" name="alcance">
            <UTextarea v-model="alcance" class="w-full" :rows="2" autoresize />
          </UFormField>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Tipo" name="tipo">
              <USelect v-model="tipo" :items="tipoItems" value-key="value" class="w-full" />
            </UFormField>
            <UFormField label="Período" name="periodo">
              <UInput v-model="periodo" class="w-full" placeholder="2026, 2026-Q1..." />
            </UFormField>
          </div>
          <UFormField label="Prioridad" name="prioridad">
            <USelect v-model="prioridad" :items="PRIORIDAD_ITEMS" value-key="value" class="w-full" />
          </UFormField>
          <p v-if="errorGuardado" class="text-sm text-error-600">{{ errorGuardado }}</p>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="ghost" @click="modalAbierto = false">Cancelar</UButton>
        <UButton :loading="guardando" :disabled="!nombre.trim()" @click="guardar">Guardar</UButton>
      </template>
    </UModal>
  </div>
</template>
