<script setup lang="ts">
// Selector de fondo — mismo comportamiento que PresupuestoSelector.vue: opciones
// código/nombre/estado, preselecciona el primero de la lista en cuanto carga.
const modelValue = defineModel<string | null>({ required: true })
const fondosStore = useFondosStore()

const opciones = computed(() =>
  fondosStore.fondos.map((f) => ({
    valor: f.id,
    etiqueta: `${f.codigo} — ${f.nombre} (${ETIQUETA_ESTADO_FONDO[f.estado] ?? f.estado})`,
  })),
)

watch(
  () => fondosStore.fondos,
  (lista) => {
    if (!modelValue.value && lista.length > 0) {
      modelValue.value = lista[0]!.id
    }
  },
  { immediate: true },
)
</script>

<template>
  <UFormField label="Fondo" name="fondo" class="w-full sm:w-[28rem]">
    <UiSelectorBuscable v-model="modelValue" :opciones="opciones" />
  </UFormField>
</template>
