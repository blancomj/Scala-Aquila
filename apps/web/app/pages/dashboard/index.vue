<script setup lang="ts">
// Placeholder mínimo para probar el flujo de auth de punta a punta — el
// dashboard real (con datos de tenant) es E9, no parte de esta rebanada.
definePageMeta({ layout: 'default' })

const usuario = useSupabaseUser()
const authStore = useAuthStore()

await useAsyncData('perfil', () => authStore.cargarPerfil())
</script>

<template>
  <div>
    <h1 class="text-xl font-semibold mb-2">Bienvenido</h1>
    <p class="text-gray-500">{{ usuario?.email }}</p>
    <p v-if="authStore.profile" class="text-sm text-gray-400 mt-1">
      {{ authStore.profile.full_name ?? 'Sin nombre registrado' }}
    </p>
  </div>
</template>
