<script setup lang="ts">
// Tab Documentos (PROMPT_FICHA_INMUEBLE.md §1.1 I9, §8.1). Lógica compartida
// en UiLibreriaDocumentos.vue — la subida pasa por la Edge Function
// subir-documento (bucket documentos-inmueble, privado), nunca por un
// insert directo del cliente.
const props = defineProps<{ inmuebleId: string }>()
</script>

<template>
  <UiLibreriaDocumentos
    :inmueble-id="props.inmuebleId"
    descripcion="Escrituras, certificados, contratos y actas asociadas a este inmueble."
  />
</template>
