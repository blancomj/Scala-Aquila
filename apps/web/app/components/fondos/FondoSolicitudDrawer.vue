<script setup lang="ts">
// Drawer "Nueva solicitud de uso" — nace en 'borrador'; el solicitante la envía a revisión
// aparte (D-37: cualquier auxiliar solicita, pero decide solo un administrador que no sea él
// mismo — ver FondosTabSolicitudes.vue).
const props = defineProps<{ fondoId: string }>()
const emit = defineEmits<{ cerrar: []; creada: [] }>()

const tenantStore = useTenantStore()
const authStore = useAuthStore()
const fondosStore = useFondosStore()

const objetivo = ref('')
const montoSolicitado = ref<number | null>(null)
const justificacion = ref('')
const guardando = ref(false)
const error = ref<string | null>(null)

async function guardar(): Promise<void> {
  error.value = null
  const tenantId = tenantStore.activeTenant?.id
  const solicitanteId = authStore.profile?.id
  if (!tenantId || !solicitanteId || !objetivo.value.trim() || montoSolicitado.value === null || montoSolicitado.value <= 0) {
    error.value = 'Completa el objetivo y un monto mayor que cero.'
    return
  }

  guardando.value = true
  try {
    await fondosStore.crearSolicitud({
      tenantId,
      fondoId: props.fondoId,
      solicitanteId,
      objetivo: objetivo.value.trim(),
      montoSolicitado: montoSolicitado.value,
      justificacion: justificacion.value.trim() || undefined,
    })
    emit('creada')
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo crear la solicitud.')
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div class="ficha-inmueble">
    <UiDrawer :abierto="true" titulo="Nueva solicitud de uso" subtitulo="Nace en borrador — envíala a revisión cuando esté lista" @cerrar="emit('cerrar')">
      <div class="grid grid-cols-2 gap-4 text-sm">
        <UFormField label="Objetivo" name="objetivo" class="col-span-2">
          <UTextarea v-model="objetivo" class="w-full" :rows="2" placeholder="Reparación de emergencia en tanque de agua" />
        </UFormField>
        <UFormField label="Monto solicitado" name="monto_solicitado">
          <UInput v-model.number="montoSolicitado" type="number" min="0" class="w-full" />
        </UFormField>
        <UFormField label="Justificación (opcional)" name="justificacion" class="col-span-2">
          <UTextarea v-model="justificacion" class="w-full" :rows="2" />
        </UFormField>
      </div>

      <UAlert v-if="error" color="error" variant="soft" :title="error" class="mt-4" />

      <template #foot>
        <UButton variant="ghost" @click="emit('cerrar')">Cancelar</UButton>
        <UButton :loading="guardando" @click="guardar">Crear solicitud</UButton>
      </template>
    </UiDrawer>
  </div>
</template>
