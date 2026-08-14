<script setup lang="ts">
// Placeholder mínimo para probar platform.ts de punta a punta (E4) — la
// consola real de plataforma (§9.5, pages/(platform)/tenants/index.vue)
// es dominio de administración, no parte de esta rebanada.
definePageMeta({ layout: 'default', middleware: ['platform'] })
</script>

<template>
  <div>
    <h1 class="text-xl font-semibold mb-2">Consola de plataforma</h1>
    <p class="text-gray-500">Solo visible con is_platform_admin = true.</p>
  </div>
</template>
