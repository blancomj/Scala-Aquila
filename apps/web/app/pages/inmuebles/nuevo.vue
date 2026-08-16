<script setup lang="ts">
// Modo creación — PROMPT_FICHA_INMUEBLE.md §5.1, §6.1. Mismo componente
// compartido que [id].vue; sin inmuebleId, InmuebleFicha deriva el modo.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:create' })
</script>

<template>
  <InmueblesInmuebleFicha />
</template>
