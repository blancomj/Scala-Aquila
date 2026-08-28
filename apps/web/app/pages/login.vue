<script setup lang="ts">
definePageMeta({ layout: 'auth', publico: true })

const cliente = useSupabaseClient()
const usuario = useSupabaseUser()
const route = useRoute()
const authStore = useAuthStore()
const tenantStore = useTenantStore()

// Mismo aviso que register.vue: si ya tenías cuenta pero con un correo
// distinto al invitado, iniciar sesión aquí no arregla nada — hay que
// entrar con la cuenta correcta (ver invite.vue, INV_EMAIL_MISMATCH).
const vieneDeInvitacion = computed(
  () => typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/invite'),
)

const email = ref('')
const password = ref('')
const cargando = ref(false)
const error = ref<string | null>(null)

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

async function iniciarSesion(): Promise<void> {
  error.value = null
  cargando.value = true
  try {
    const { error: errorAuth } = await cliente.auth.signInWithPassword({
      email: email.value,
      password: password.value,
    })
    if (errorAuth) {
      error.value = errorAuth.message
      return
    }
    // authStore.cargarPerfil() cachea profile.value y NO vuelve a consultar
    // si ya hay algo cargado (solo lo hace con { forzar: true }) — sin este
    // reset, iniciar sesión con OTRA cuenta en la misma pestaña sin pasar
    // antes por "cerrar sesión" (NavUsuarioMenu.vue/perfil.vue, que sí
    // limpian) deja corriendo el active_tenant_id/memberships del usuario
    // ANTERIOR. Bug real 2026-08-28: una cuenta con copropiedades de sobra
    // terminaba en /onboarding/create-tenant porque el active_tenant_id
    // null de la sesión previa seguía en caché.
    authStore.limpiar()
    tenantStore.limpiar()
    useCookie<boolean>('copropiedad-confirmada-sesion').value = false
    // Espera a que useSupabaseUser() refleje la sesión recién iniciada antes
    // de navegar — si se navega en el mismo tick, auth.global puede
    // ejecutarse con el estado reactivo todavía sin actualizar y rebotar a
    // /login (visto en pruebas manuales: la cookie de sesión ya existe, el
    // ref reactivo aún no).
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
      <h1 class="font-display text-lg font-semibold">Iniciar sesión</h1>
    </template>

    <form class="space-y-4" @submit.prevent="iniciarSesion">
      <UAlert
        v-if="vieneDeInvitacion"
        color="info"
        variant="soft"
        icon="i-lucide-info"
        title="Usa la cuenta con el correo al que te llegó la invitación"
        description="Si tu cuenta tiene otro correo, la invitación no se va a poder aceptar con esta sesión."
      />

      <UFormField label="Correo electrónico" name="email">
        <UInput v-model="email" type="email" required autocomplete="email" class="w-full" />
      </UFormField>

      <UFormField label="Contraseña" name="password">
        <UInput
          v-model="password"
          type="password"
          required
          autocomplete="current-password"
          class="w-full"
        />
      </UFormField>

      <UAlert v-if="error" color="error" variant="soft" :title="error" />

      <UButton type="submit" block :loading="cargando">Entrar</UButton>

      <p class="text-sm text-gray-500 text-center">
        <NuxtLink to="/forgot-password" class="text-primary-500 font-medium">
          ¿Olvidaste tu contraseña?
        </NuxtLink>
      </p>
    </form>

    <template #footer>
      <p class="text-sm text-gray-500">
        ¿No tienes cuenta?
        <NuxtLink to="/register" class="text-primary-500 font-medium">Regístrate</NuxtLink>
      </p>
    </template>
  </UCard>
</template>
