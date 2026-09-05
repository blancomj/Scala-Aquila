<script setup lang="ts">
// Drawer "Nuevo compromiso" — nace en 'proyectado' (no resta del disponible todavía, Modelo
// §14). Pasar a 'comprometido' es una acción aparte en la tabla (R9 lo valida en ese momento).
const props = defineProps<{ fondoId: string }>()
const emit = defineEmits<{ cerrar: []; creado: [] }>()

const tenantStore = useTenantStore()
const fondosStore = useFondosStore()

const concepto = ref('')
const monto = ref<number | null>(null)
const fecha = ref('')
const fechaLimite = ref('')
const guardando = ref(false)
const error = ref<string | null>(null)

async function guardar(): Promise<void> {
  error.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !concepto.value.trim() || monto.value === null || monto.value <= 0) {
    error.value = 'Completa el concepto y un monto mayor que cero.'
    return
  }

  guardando.value = true
  try {
    await fondosStore.crearCompromiso({
      tenantId,
      fondoId: props.fondoId,
      concepto: concepto.value.trim(),
      monto: monto.value,
      fecha: fecha.value || undefined,
      fechaLimite: fechaLimite.value || undefined,
    })
    emit('creado')
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo crear el compromiso.')
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div class="ficha-inmueble">
    <UiDrawer :abierto="true" titulo="Nuevo compromiso" subtitulo="Reserva de recursos para una obligación" @cerrar="emit('cerrar')">
      <div class="grid grid-cols-2 gap-4 text-sm">
        <UFormField label="Concepto" name="concepto" class="col-span-2">
          <UTextarea v-model="concepto" class="w-full" :rows="2" placeholder="Contrato de impermeabilización de cubiertas" />
        </UFormField>
        <UFormField label="Monto" name="monto">
          <UInput v-model.number="monto" type="number" min="0" class="w-full" />
        </UFormField>
        <UFormField label="Fecha" name="fecha">
          <UInput v-model="fecha" type="date" class="w-full" />
        </UFormField>
        <UFormField label="Fecha límite (opcional)" name="fecha_limite" class="col-span-2">
          <UInput v-model="fechaLimite" type="date" class="w-full" />
        </UFormField>
      </div>

      <UAlert v-if="error" color="error" variant="soft" :title="error" class="mt-4" />

      <template #foot>
        <UButton variant="ghost" @click="emit('cerrar')">Cancelar</UButton>
        <UButton :loading="guardando" @click="guardar">Crear compromiso</UButton>
      </template>
    </UiDrawer>
  </div>
</template>
