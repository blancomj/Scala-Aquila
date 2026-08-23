<script setup lang="ts">
// Drawer "Nuevo presupuesto" — el contenedor sigue siendo <div
// class="ficha-inmueble"><UiDrawer> (sin ese ancestro el drawer se
// renderiza sin estilo — bug real ya documentado en MiembroDrawer.vue),
// pero el CONTENIDO usa componentes Nuxt UI (UFormField/UInput/UButton),
// no `.field`/`<input>` plano — mismo criterio que
// politicas/PoliticasVersionDrawer.vue (23-08-2026, decisión del usuario:
// que los drawers combinen con el resto de cada página, que ya es Nuxt UI).
const emit = defineEmits<{ cerrar: []; creado: [id: string] }>()

const tenantStore = useTenantStore()
const presupuestoStore = usePresupuestoStore()

const anio = ref<number | null>(new Date().getFullYear())
const montoTotal = ref<number | null>(null)
const guardando = ref(false)
const error = ref<string | null>(null)

async function guardar(): Promise<void> {
  error.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || anio.value === null || montoTotal.value === null) {
    error.value = 'Completa el año y el monto total.'
    return
  }

  guardando.value = true
  try {
    const creado = await presupuestoStore.crearPresupuesto({
      tenantId,
      anio: anio.value,
      montoTotal: montoTotal.value,
    })
    emit('creado', creado.id)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo crear el presupuesto.')
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div class="ficha-inmueble">
    <UiDrawer
      :abierto="true"
      titulo="Nuevo presupuesto"
      subtitulo="Año y monto total aprobado — los rubros se agregan después, en borrador"
      @cerrar="emit('cerrar')"
    >
      <div class="grid grid-cols-2 gap-4 text-sm">
        <UFormField label="Año" name="anio">
          <UInput v-model.number="anio" type="number" class="w-full" />
        </UFormField>
        <UFormField label="Monto total" name="monto_total">
          <UInput v-model.number="montoTotal" type="number" min="0" class="w-full" />
        </UFormField>
      </div>

      <UAlert v-if="error" color="error" variant="soft" :title="error" class="mt-4" />

      <template #foot>
        <UButton variant="ghost" @click="emit('cerrar')">Cancelar</UButton>
        <UButton :loading="guardando" @click="guardar">Crear presupuesto</UButton>
      </template>
    </UiDrawer>
  </div>
</template>
