<script setup lang="ts">
// Selector de presupuesto — mismo comportamiento en las páginas que
// necesitan elegir un presupuesto activo (Presupuesto, Periodos y
// vigencia, Control y validaciones): opciones año/versión/estado,
// preselecciona la primera de la lista (la más reciente — ver
// cargarPresupuestos ORDER BY anio desc) en cuanto carga.
const modelValue = defineModel<string | null>({ required: true })
const presupuestoStore = usePresupuestoStore()

const opciones = computed(() =>
  presupuestoStore.presupuestos.map((p) => ({
    valor: p.id,
    etiqueta: `${p.anio} — v${p.version} (${p.estado})`,
  })),
)

watch(
  () => presupuestoStore.presupuestos,
  (lista) => {
    if (!modelValue.value && lista.length > 0) {
      modelValue.value = lista[0]!.id
    }
  },
  { immediate: true },
)
</script>

<template>
  <UFormField label="Presupuesto" name="presupuesto" class="w-[28rem]">
    <UiSelectorBuscable v-model="modelValue" :opciones="opciones" />
  </UFormField>
</template>
