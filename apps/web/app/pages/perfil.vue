<script setup lang="ts">
// "Mi perfil" (menú de usuario, 2026-08-26) — datos de la cuenta, no de una
// copropiedad: sin middleware tenant/rbac (auth.global.ts ya exige sesión).
// Solo full_name/phone son auto-editables (authStore.actualizarPerfil,
// SEC-06) — email es espejo de auth.users, is_platform_admin/status quedan
// fuera por diseño.
definePageMeta({ layout: 'default' })

const usuario = useSupabaseUser()
const authStore = useAuthStore()

const fullName = ref('')
const phone = ref('')
const guardando = ref(false)
const error = ref<string | null>(null)
const guardado = ref(false)

function poblarDesdePerfil(): void {
  fullName.value = authStore.profile?.full_name ?? ''
  phone.value = authStore.profile?.phone ?? ''
}

await useAsyncData('mi-perfil', () => authStore.cargarPerfil())
poblarDesdePerfil()
watch(() => authStore.profile, poblarDesdePerfil)

async function guardar(): Promise<void> {
  error.value = null
  guardado.value = false
  guardando.value = true
  try {
    await authStore.actualizarPerfil({
      fullName: fullName.value.trim() || null,
      phone: phone.value.trim() || null,
    })
    guardado.value = true
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo guardar el perfil.')
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div class="max-w-sm space-y-6">
    <div>
      <h1 class="text-xl font-semibold mb-2">Mi perfil</h1>
      <p class="text-sm text-gray-500">Datos de tu cuenta. Visibles para los demás miembros de tus copropiedades.</p>
    </div>

    <form class="space-y-4" @submit.prevent="guardar">
      <UFormField label="Correo" name="email">
        <UInput :model-value="usuario?.email ?? ''" disabled class="w-full" />
      </UFormField>

      <UFormField label="Nombre completo" name="fullName">
        <UInput v-model="fullName" class="w-full" />
      </UFormField>

      <UFormField label="Teléfono" name="phone">
        <UInput v-model="phone" class="w-full" />
      </UFormField>

      <UAlert v-if="error" color="error" variant="soft" :title="error" />
      <UAlert v-if="guardado" color="success" variant="soft" title="Guardado." />

      <UButton type="submit" :loading="guardando">Guardar cambios</UButton>
    </form>
  </div>
</template>
