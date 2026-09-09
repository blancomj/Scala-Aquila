<script setup lang="ts">
// MANT-6 §4.1: crear un almacén. zona_comun_id (opcional) reutiliza zonas_comunes ya existente —
// el detalle fino ("Estante A - Nivel 2") va en descripcion, texto libre.
const emit = defineEmits<{ cerrar: []; guardado: [] }>()

const tenantStore = useTenantStore()
const inventarioStore = useMantenimientoInventarioStore()
const zonasStore = useZonasComunesStore()

const nombre = ref('')
const zonaComunId = ref<string | undefined>(undefined)
const descripcion = ref('')
const error = ref<string | null>(null)

onMounted(() => {
  const tenantId = tenantStore.activeTenant?.id
  if (tenantId) zonasStore.cargarZonasComunes(tenantId)
})

async function guardar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !nombre.value.trim()) return
  error.value = null
  try {
    await inventarioStore.crearAlmacen({
      tenant_id: tenantId,
      nombre: nombre.value.trim(),
      zona_comun_id: zonaComunId.value ?? null,
      descripcion: descripcion.value.trim() || null,
    })
    emit('guardado')
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo guardar el almacén.')
  }
}
</script>

<template>
  <UiDrawer :abierto="true" titulo="Nuevo almacén" @cerrar="emit('cerrar')">
    <div class="space-y-4">
      <UFormField label="Nombre" name="nombre">
        <UInput v-model="nombre" class="w-full" placeholder="Almacén principal" />
      </UFormField>
      <UFormField label="Zona común (opcional)" name="zona_comun">
        <USelect
          v-model="zonaComunId"
          class="w-full"
          placeholder="— Sin asignar —"
          :items="zonasStore.zonasComunes.map((z) => ({ label: z.nombre, value: z.id }))"
        />
      </UFormField>
      <UFormField label="Detalle (opcional)" name="descripcion">
        <UTextarea
          v-model="descripcion"
          class="w-full"
          :rows="2"
          placeholder="Estante A - Nivel 2"
        />
      </UFormField>
      <UAlert v-if="error" color="error" variant="soft" :title="error" />
    </div>
    <template #foot>
      <div class="flex justify-end gap-2 w-full">
        <UButton variant="ghost" @click="emit('cerrar')">Cancelar</UButton>
        <UButton :loading="inventarioStore.guardando" :disabled="!nombre.trim()" @click="guardar()"
          >Guardar</UButton
        >
      </div>
    </template>
  </UiDrawer>
</template>
