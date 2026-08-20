<script setup lang="ts">
// Editar concepto — wrapper delgado de ConceptosEditor.vue. Ver
// components/conceptos/ConceptosEditor.vue para el porqué de la
// separación catálogo (pestaña de Presupuesto) / editor (página
// completa). Rutas estáticas como /conceptos/nuevo y
// /conceptos/dependencias tienen prioridad sobre esta dinámica en el
// router de Nuxt — sin conflicto.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:create' })

const route = useRoute()
const conceptoId = computed(() => route.params.id as string)
</script>

<template>
  <div>
    <ConceptosEditor :concepto-id="conceptoId" />
  </div>
</template>
