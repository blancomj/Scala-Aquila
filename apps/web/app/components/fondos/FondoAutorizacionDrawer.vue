<script setup lang="ts">
// Drawer "Registrar autorización" — append-only (Modelo §7): registra un hecho jurídico ya
// ocurrido (decisión del órgano competente), no una configuración editable después.
const props = defineProps<{ fondoId: string }>()
const emit = defineEmits<{ cerrar: []; creado: [] }>()

const tenantStore = useTenantStore()
const fondosStore = useFondosStore()

const organos = ref<{ valor: number; etiqueta: string }[]>([])
onMounted(async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  const tipos = await cargarListaTipos(tenantId, 'ORGANO_DECISORIO')
  organos.value = tipos.map((t) => ({ valor: t.id, etiqueta: t.nombre }))
})

const organoId = ref<number | null>(null)
const tipoDecision = ref('')
const decision = ref('')
const numeroActa = ref('')
const fechaActa = ref('')
const alcance = ref('')
const vigenciaDesde = ref('')
const vigenciaHasta = ref('')
const guardando = ref(false)
const error = ref<string | null>(null)

async function guardar(): Promise<void> {
  error.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || organoId.value === null || !tipoDecision.value.trim() || !decision.value.trim()) {
    error.value = 'Completa el órgano decisorio, el tipo de decisión y la decisión.'
    return
  }
  if (vigenciaDesde.value && vigenciaHasta.value && vigenciaDesde.value > vigenciaHasta.value) {
    error.value = 'La fecha "Vigente desde" no puede ser posterior a "Vigente hasta".'
    return
  }

  guardando.value = true
  try {
    await fondosStore.registrarAutorizacion({
      tenantId,
      fondoId: props.fondoId,
      organoId: organoId.value,
      tipoDecision: tipoDecision.value.trim(),
      decision: decision.value.trim(),
      numeroActa: numeroActa.value.trim() || undefined,
      fechaActa: fechaActa.value || undefined,
      alcance: alcance.value.trim() || undefined,
      vigenciaDesde: vigenciaDesde.value || undefined,
      vigenciaHasta: vigenciaHasta.value || undefined,
    })
    emit('creado')
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo registrar la autorización.')
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div class="ficha-inmueble">
    <UiDrawer
      :abierto="true"
      titulo="Registrar autorización"
      subtitulo="Decisión ya adoptada por el órgano competente — no editable después"
      @cerrar="emit('cerrar')"
    >
      <div class="grid grid-cols-2 gap-4 text-sm">
        <UFormField label="Órgano decisorio" name="organo_id">
          <UiSelectorBuscable v-model="organoId" :opciones="organos" />
        </UFormField>
        <UFormField label="Tipo de decisión" name="tipo_decision">
          <UInput v-model="tipoDecision" class="w-full" placeholder="Creación del fondo" />
        </UFormField>
        <UFormField label="Decisión" name="decision" class="col-span-2">
          <UTextarea v-model="decision" class="w-full" :rows="3" />
        </UFormField>
        <UFormField label="N.º de acta" name="numero_acta">
          <UInput v-model="numeroActa" class="w-full" />
        </UFormField>
        <UFormField label="Fecha del acta" name="fecha_acta">
          <UInput v-model="fechaActa" type="date" class="w-full" />
        </UFormField>
        <UFormField label="Alcance (opcional)" name="alcance" class="col-span-2">
          <UTextarea v-model="alcance" class="w-full" :rows="2" />
        </UFormField>
        <UFormField label="Vigente desde" name="vigencia_desde">
          <UInput v-model="vigenciaDesde" type="date" class="w-full" />
        </UFormField>
        <UFormField label="Vigente hasta" name="vigencia_hasta">
          <UInput v-model="vigenciaHasta" type="date" class="w-full" />
        </UFormField>
      </div>

      <UAlert v-if="error" color="error" variant="soft" :title="error" class="mt-4" />

      <template #foot>
        <UButton variant="ghost" @click="emit('cerrar')">Cancelar</UButton>
        <UButton :loading="guardando" @click="guardar">Registrar</UButton>
      </template>
    </UiDrawer>
  </div>
</template>
