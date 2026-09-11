<script setup lang="ts">
// Destino del enlace de recuperación (forgot-password.vue → redirectTo).
// El SDK de Supabase procesa el token del hash de la URL en el cliente y
// establece una sesión de tipo "recovery" antes de que este componente
// pueda usarla — por eso `publico: true` (no depende del middleware de
// sesión normal) y por eso `updateUser` puede fallar con "Auth session
// missing" si el usuario llega aquí sin pasar por el enlace del correo.
definePageMeta({ layout: 'auth', publico: true })

const cliente = useSupabaseClient()

const password = ref('')
const confirmarPassword = ref('')
const cargando = ref(false)
const error = ref<string | null>(null)
const exito = ref(false)
const mostrarPassword = ref(false)
const mostrarConfirmarPassword = ref(false)

async function restablecer(): Promise<void> {
  error.value = null
  if (password.value !== confirmarPassword.value) {
    error.value = 'Las contraseñas no coinciden.'
    return
  }
  cargando.value = true
  try {
    const { error: errorUpdate } = await cliente.auth.updateUser({ password: password.value })
    if (errorUpdate) {
      error.value = errorUpdate.message
      return
    }
    exito.value = true
  } finally {
    cargando.value = false
  }
}
</script>

<template>
  <UCard>
    <template #header>
      <h1 class="text-lg font-semibold">Restablecer contraseña</h1>
    </template>

    <template v-if="exito">
      <UAlert
        color="success"
        variant="soft"
        title="Contraseña actualizada"
        description="Ya puedes continuar."
      />
      <UButton class="mt-4" block @click="navigateTo('/dashboard')">Ir al panel</UButton>
    </template>

    <form v-else class="space-y-4" @submit.prevent="restablecer">
      <UFormField label="Nueva contraseña" name="password">
        <UInput
          v-model="password"
          :type="mostrarPassword ? 'text' : 'password'"
          required
          autocomplete="new-password"
          minlength="8"
          icon="i-lucide-lock"
          :ui="{ trailing: 'pe-1' }"
          class="w-full"
        >
          <template #trailing>
            <UButton
              color="neutral"
              variant="link"
              size="sm"
              :icon="mostrarPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'"
              :aria-label="mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'"
              :aria-pressed="mostrarPassword"
              @click="mostrarPassword = !mostrarPassword"
            />
          </template>
        </UInput>
      </UFormField>

      <UFormField label="Confirmar contraseña" name="confirmar_password">
        <UInput
          v-model="confirmarPassword"
          :type="mostrarConfirmarPassword ? 'text' : 'password'"
          required
          autocomplete="new-password"
          minlength="8"
          icon="i-lucide-lock"
          :ui="{ trailing: 'pe-1' }"
          class="w-full"
        >
          <template #trailing>
            <UButton
              color="neutral"
              variant="link"
              size="sm"
              :icon="mostrarConfirmarPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'"
              :aria-label="mostrarConfirmarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'"
              :aria-pressed="mostrarConfirmarPassword"
              @click="mostrarConfirmarPassword = !mostrarConfirmarPassword"
            />
          </template>
        </UInput>
      </UFormField>

      <UAlert v-if="error" color="error" variant="soft" :title="error" />

      <UButton type="submit" block :loading="cargando">Guardar</UButton>
    </form>
  </UCard>
</template>
