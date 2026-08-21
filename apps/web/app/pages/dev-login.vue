<script setup lang="ts">
// Ruta SOLO dev (D-25: nunca contra prod) para completar el login sin que
// nadie escriba una contraseña en ningún formulario — el par access_token/
// refresh_token llega por query string, generado con
// `pnpm dev:login [email]` (scripts/dev-login.mjs, service_role +
// admin.generateLink). Aquí solo se le entrega al MISMO cliente Supabase
// que usa el resto de la app (useSupabaseClient), para que el storage de
// sesión quede exactamente como si el usuario hubiera iniciado sesión por
// el formulario normal — nada de reinventar el mecanismo de persistencia.
definePageMeta({ layout: 'auth', publico: true })

if (import.meta.server && !import.meta.dev) {
  throw createError({ statusCode: 404, statusMessage: 'Not Found' })
}

const cliente = useSupabaseClient()
const route = useRoute()
const error = ref<string | null>(null)

onMounted(async () => {
  if (!import.meta.dev) return
  const accessToken = route.query.access_token
  const refreshToken = route.query.refresh_token
  if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') {
    error.value = 'Faltan access_token/refresh_token en la URL — genera el link con pnpm dev:login.'
    return
  }

  const { error: errorSesion } = await cliente.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  })
  if (errorSesion) {
    error.value = errorSesion.message
    return
  }
  await navigateTo('/')
})
</script>

<template>
  <div class="ficha-inmueble">
    <p v-if="error" class="note" style="color: var(--ladrillo-text)">{{ error }}</p>
    <p v-else>Iniciando sesión de desarrollo…</p>
  </div>
</template>
