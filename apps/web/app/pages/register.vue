<script setup lang="ts">
// PLAN §9.1: /register → supabase.auth.signUp() → trigger on_auth_user_created
// (profiles + audit_log, ya existe de F1) → email de confirmación.
definePageMeta({ layout: 'auth', publico: true })

const cliente = useSupabaseClient()
const usuario = useSupabaseUser()
const route = useRoute()

const nombreCompleto = ref('')
const email = ref('')
const password = ref('')
const cargando = ref(false)
const error = ref<string | null>(null)
const confirmacionPendiente = ref(false)

// Mismo ajuste que login.vue: esperar a que useSupabaseUser() refleje la
// sesión antes de navegar, para que auth.global no rebote a /login.
async function esperarSesion(): Promise<void> {
  if (usuario.value) return
  await new Promise<void>((resolve) => {
    const detener = watch(usuario, (valor) => {
      if (valor) {
        detener()
        resolve()
      }
    })
  })
}

async function registrar(): Promise<void> {
  error.value = null
  cargando.value = true
  try {
    const { data, error: errorAuth } = await cliente.auth.signUp({
      email: email.value,
      password: password.value,
      options: { data: { full_name: nombreCompleto.value } },
    })
    if (errorAuth) {
      error.value = errorAuth.message
      return
    }
    if (!data.session) {
      confirmacionPendiente.value = true
      return
    }
    await esperarSesion()
    const destino = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard'
    await navigateTo(destino)
  } finally {
    cargando.value = false
  }
}
</script>

<template>
  <UCard>
    <template #header>
      <h1 class="text-lg font-semibold">Crear cuenta</h1>
    </template>

    <UAlert
      v-if="confirmacionPendiente"
      color="success"
      variant="soft"
      title="Revisa tu correo"
      description="Te enviamos un enlace para confirmar tu cuenta antes de iniciar sesión."
    />

    <form v-else class="space-y-4" @submit.prevent="registrar">
      <UFormField label="Nombre completo" name="full_name">
        <UInput v-model="nombreCompleto" required autocomplete="name" class="w-full" />
      </UFormField>

      <UFormField label="Correo electrónico" name="email">
        <UInput v-model="email" type="email" required autocomplete="email" class="w-full" />
      </UFormField>

      <UFormField label="Contraseña" name="password">
        <UInput
          v-model="password"
          type="password"
          required
          autocomplete="new-password"
          minlength="8"
          class="w-full"
        />
      </UFormField>

      <UAlert v-if="error" color="error" variant="soft" :title="error" />

      <UButton type="submit" block :loading="cargando">Crear cuenta</UButton>
    </form>

    <template #footer>
      <p class="text-sm text-gray-500">
        ¿Ya tienes cuenta?
        <NuxtLink to="/login" class="text-primary-500 font-medium">Inicia sesión</NuxtLink>
      </p>
    </template>
  </UCard>
</template>
