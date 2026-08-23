<script setup lang="ts">
// Tab Documentos de la copropiedad (PROMPT_FICHA_COPROPIEDAD.md §8.1, ahora
// resuelto: reutiliza el mismo patrón de InmuebleDocumentos.vue —
// documentos.inmueble_id null = pertenece al tenant, no a un inmueble
// puntual). Lógica compartida en UiLibreriaDocumentos.vue.
</script>

<template>
  <UiLibreriaDocumentos
    :inmueble-id="null"
    descripcion="Reglamento, personería jurídica, actas de asamblea y pólizas de la copropiedad."
  />
</template>
