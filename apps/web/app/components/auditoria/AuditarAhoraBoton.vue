<script setup lang="ts">
// "Auditar ahora" (PROMPT AUDITORÍA §57) — crea un engagement focalizado
// desde el registro que se está mirando (liquidación, cargo, etc.), en vez
// de obligar a ir al módulo de auditoría y armar la auditoría desde cero.
// Queda vinculado a su origen vía auditoria_engagements.origen_tipo/origen_id
// (AuditPlan.vue ya muestra ese vínculo con el badge "Desde <origen_tipo>").
const props = defineProps<{
  origenTipo: string
  origenId: string
  nombreSugerido: string
  objetivoSugerido?: string
  tipoSugerido?: string
  periodoSugerido?: string
}>()

const tenantStore = useTenantStore()
const auditoriaStore = useAuditoriaStore()
const toast = useToast()

// Mismo criterio que auditoria_engagements_insert (RLS): solo auditor/
// administrador pueden crear un engagement.
const puedeAuditar = computed(() => tenantStore.role === 'auditor' || tenantStore.role === 'administrador')

const modalAbierto = ref(false)
const guardando = ref(false)
const errorGuardado = ref<string | null>(null)
const nombre = ref('')
const objetivo = ref('')

function abrirModal(): void {
  nombre.value = props.nombreSugerido
  objetivo.value = props.objetivoSugerido ?? ''
  errorGuardado.value = null
  modalAbierto.value = true
}

async function crear(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !nombre.value.trim()) return
  guardando.value = true
  errorGuardado.value = null
  try {
    await auditoriaStore.crearEngagementDesdeOrigen(tenantId, props.origenTipo, props.origenId, {
      nombre: nombre.value.trim(),
      objetivo: objetivo.value.trim() || null,
      alcance: null,
      periodo: props.periodoSugerido ?? null,
      tipo: props.tipoSugerido ?? null,
      prioridad: 'MEDIA',
      estado: 'BORRADOR',
      responsable: null,
      fecha_inicio: null,
      fecha_fin: null,
      conclusion: null,
    })
    modalAbierto.value = false
    toast.add({ title: 'Auditoría creada.', description: 'Disponible en Auditoría › Auditorías.', color: 'success' })
  } catch (error) {
    errorGuardado.value = mensajeError(error, 'No se pudo crear la auditoría.')
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <UButton
    v-if="puedeAuditar"
    color="neutral"
    variant="outline"
    size="sm"
    icon="i-lucide-shield-search"
    @click="abrirModal"
  >
    Auditar ahora
  </UButton>

  <UModal v-model:open="modalAbierto" title="Auditar ahora">
    <template #body>
      <div class="space-y-4">
        <p class="text-sm text-muted">
          Crea una auditoría enfocada en este registro — queda vinculada como su origen.
        </p>
        <UFormField label="Nombre" name="nombre" required>
          <UInput v-model="nombre" class="w-full" />
        </UFormField>
        <UFormField label="Objetivo" name="objetivo">
          <UTextarea v-model="objetivo" class="w-full" :rows="2" autoresize />
        </UFormField>
        <UAlert v-if="errorGuardado" color="error" variant="soft" :title="errorGuardado" />
      </div>
    </template>
    <template #footer>
      <UButton color="neutral" variant="ghost" @click="modalAbierto = false">Cancelar</UButton>
      <UButton :loading="guardando" :disabled="!nombre.trim()" @click="crear">Crear auditoría</UButton>
    </template>
  </UModal>
</template>
