<script setup lang="ts">
// Placeholder mínimo para probar el flujo de auth de punta a punta — el
// dashboard real (con datos de tenant) es E9, no parte de esta rebanada.
definePageMeta({ layout: 'default', middleware: ['tenant'] })

const usuario = useSupabaseUser()
const authStore = useAuthStore()
const tenantStore = useTenantStore()

await useAsyncData('perfil', () => authStore.cargarPerfil())
await useAsyncData('memberships', () => tenantStore.cargarMemberships())
</script>

<template>
  <div>
    <h1 class="text-xl font-semibold mb-2">Bienvenido</h1>
    <p class="text-gray-500">{{ usuario?.email }}</p>
    <p v-if="authStore.profile" class="text-sm text-gray-400 mt-1">
      {{ authStore.profile.full_name ?? 'Sin nombre registrado' }}
    </p>
    <p v-if="tenantStore.activeTenant" class="text-sm text-gray-400 mt-1">
      Copropiedad activa: {{ tenantStore.activeTenant.name }} ({{ tenantStore.role }})
    </p>
  </div>
</template>
