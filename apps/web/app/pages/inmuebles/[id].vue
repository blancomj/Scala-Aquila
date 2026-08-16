<script setup lang="ts">
// Modo ficha completa — PROMPT_FICHA_INMUEBLE.md §5.1, §6.1. Mismo
// componente compartido que nuevo.vue; con inmuebleId, InmuebleFicha
// deriva el modo y carga los datos reales.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const route = useRoute()
const inmuebleId = computed(() => String(route.params.id))
</script>

<template>
  <InmueblesInmuebleFicha :inmueble-id="inmuebleId" />
</template>
