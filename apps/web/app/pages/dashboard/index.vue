<script setup lang="ts">
// Placeholder mínimo para probar el flujo de auth de punta a punta — el
// dashboard real (con datos de tenant) es E9, no parte de esta rebanada.
definePageMeta({ layout: 'default', middleware: ['tenant'] })

const usuario = useSupabaseUser()
const authStore = useAuthStore()
const tenantStore = useTenantStore()

await useAsyncData('perfil', () => authStore.cargarPerfil())
await useAsyncData('memberships', () => tenantStore.cargarMemberships())

const tenantActivo = computed(() =>
  tenantStore.memberships.find((m) => m.tenant_id === authStore.profile?.active_tenant_id)?.tenant,
)
</script>

<template>
  <div>
    <h1 class="text-xl font-semibold mb-2">Bienvenido</h1>
    <p class="text-gray-500">{{ usuario?.email }}</p>
    <p v-if="authStore.profile" class="text-sm text-gray-400 mt-1">
      {{ authStore.profile.full_name ?? 'Sin nombre registrado' }}
    </p>
    <p v-if="tenantActivo" class="text-sm text-gray-400 mt-1">
      Copropiedad activa: {{ tenantActivo.name }}
    </p>
  </div>
</template>
