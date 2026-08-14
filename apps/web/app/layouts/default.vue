<script setup lang="ts">
const usuario = useSupabaseUser()
const cliente = useSupabaseClient()
const router = useRouter()
const authStore = useAuthStore()

async function cerrarSesion(): Promise<void> {
  await cliente.auth.signOut()
  authStore.limpiar()
  await router.push('/login')
}
</script>

<template>
  <div class="min-h-screen">
    <header
      class="border-b border-gray-200 dark:border-gray-800 px-4 py-3 flex items-center justify-between"
    >
      <span class="font-semibold">Aquila PH</span>
      <UButton v-if="usuario" variant="ghost" @click="cerrarSesion">Cerrar sesión</UButton>
    </header>
    <main class="p-4">
      <slot />
    </main>
  </div>
</template>
