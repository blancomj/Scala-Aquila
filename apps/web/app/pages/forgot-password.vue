<script setup lang="ts">
// PLAN §9.1 / F1 §E3 — recuperación de contraseña. Supabase no revela si el
// correo existe (protección anti-enumeración): el mensaje de éxito es
// siempre el mismo, haya o no cuenta con ese correo.
definePageMeta({ layout: 'auth', publico: true })

const cliente = useSupabaseClient()
const config = useRuntimeConfig()

const email = ref('')
const cargando = ref(false)
const error = ref<string | null>(null)
const enviado = ref(false)

async function enviarEnlace(): Promise<void> {
  error.value = null
  cargando.value = true
  try {
    const { error: errorReset } = await cliente.auth.resetPasswordForEmail(email.value, {
      redirectTo: `${config.public.appUrl}/reset-password`,
    })
    if (errorReset) {
      error.value = errorReset.message
      return
    }
    enviado.value = true
  } finally {
    cargando.value = false
  }
}
</script>

<template>
  <UCard>
    <template #header>
      <h1 class="text-lg font-semibold">Recuperar contraseña</h1>
    </template>

    <UAlert
      v-if="enviado"
      color="success"
      variant="soft"
      title="Revisa tu correo"
      description="Si existe una cuenta con ese correo, te enviamos un enlace para restablecer la contraseña."
    />

    <form v-else class="space-y-4" @submit.prevent="enviarEnlace">
      <UFormField label="Correo electrónico" name="email">
        <UInput v-model="email" type="email" required autocomplete="email" class="w-full" />
      </UFormField>

      <UAlert v-if="error" color="error" variant="soft" :title="error" />

      <UButton type="submit" block :loading="cargando">Enviar enlace</UButton>
    </form>

    <template #footer>
      <p class="text-sm text-muted">
        <NuxtLink to="/login" class="text-primary-500 font-medium"
          >Volver a iniciar sesión</NuxtLink
        >
      </p>
    </template>
  </UCard>
</template>
