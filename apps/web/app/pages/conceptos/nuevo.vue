<script setup lang="ts">
// Crear concepto — wrapper delgado de ConceptosEditor.vue. Ver
// components/conceptos/ConceptosEditor.vue para el porqué de la separación
// catálogo (pestaña de Presupuesto) / editor (página completa).
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:create' })
</script>

<template>
  <div>
    <ConceptosEditor />
  </div>
</template>
