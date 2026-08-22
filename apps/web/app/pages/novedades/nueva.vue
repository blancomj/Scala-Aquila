<script setup lang="ts">
// Crear novedad — wrapper delgado de NovedadesEditor.vue, mismo criterio que
// /conceptos/nuevo: la lista vive bajo su sección (/estado-cuenta/novedades) y
// el editor tiene ruta propia de primer nivel.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:create' })
</script>

<template>
  <div>
    <NovedadesEditor />
  </div>
</template>
