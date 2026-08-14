<script setup lang="ts">
const usuario = useSupabaseUser()
const cliente = useSupabaseClient()
const router = useRouter()
const authStore = useAuthStore()
const tenantStore = useTenantStore()

// <select> nativo en vez de USelect: los genéricos de SelectProps/SelectEmits
// de Nuxt UI v4 disparan "Type instantiation is excessively deep" en vue-tsc
// con este binding (items dinámicos + v-model tipado); no vale la pena
// pelear los genéricos de la librería para un selector simple.
async function cambiarTenant(evento: Event): Promise<void> {
  const tenantId = (evento.target as HTMLSelectElement).value
  await tenantStore.cambiarTenant(tenantId)
}

async function cerrarSesion(): Promise<void> {
  await cliente.auth.signOut()
  authStore.limpiar()
  tenantStore.limpiar()
  await router.push('/login')
}
</script>

<template>
  <div class="min-h-screen">
    <header
      class="border-b border-gray-200 dark:border-gray-800 px-4 py-3 flex items-center justify-between gap-4"
    >
      <span class="font-semibold">Aquila PH</span>
      <div class="flex items-center gap-3">
        <select
          v-if="tenantStore.memberships.length > 0"
          :value="authStore.profile?.active_tenant_id ?? ''"
          class="rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-sm w-48"
          @change="cambiarTenant"
        >
          <option v-for="m in tenantStore.memberships" :key="m.tenant_id" :value="m.tenant_id">
            {{ m.tenant.name }}
          </option>
        </select>
        <UButton v-if="usuario" variant="ghost" @click="cerrarSesion">Cerrar sesión</UButton>
      </div>
    </header>
    <main class="p-4">
      <slot />
    </main>
  </div>
</template>
