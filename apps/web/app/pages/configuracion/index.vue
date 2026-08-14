<script setup lang="ts">
// Placeholder mínimo para probar rbac.ts de punta a punta (E4) — la página
// real de configuración de la copropiedad (nombre, moneda, zona horaria)
// es dominio, no parte de esta rebanada.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'settings:manage' })

const tenantStore = useTenantStore()
</script>

<template>
  <div>
    <h1 class="text-xl font-semibold mb-2">Configuración</h1>
    <p class="text-gray-500">Solo visible con permiso settings:manage (rol agent).</p>
    <p class="text-sm text-gray-400 mt-1">Copropiedad: {{ tenantStore.activeTenant?.name }}</p>
  </div>
</template>
