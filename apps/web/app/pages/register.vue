<script setup lang="ts">
// PLAN §9.1: /register → supabase.auth.signUp() → trigger on_auth_user_created
// (profiles + audit_log, ya existe de F1) → email de confirmación.
definePageMeta({ layout: 'auth', publico: true })

const cliente = useSupabaseClient()
const usuario = useSupabaseUser()
const route = useRoute()
const config = useRuntimeConfig()
const authStore = useAuthStore()
const tenantStore = useTenantStore()

// El enlace de invitación nunca lleva el correo en la URL (deliberado —
// no exponer PII en query strings/logs, ver email_invitation.ts). Sin esa
// pista, quien viene de /invite podía registrarse con cualquier correo y
// enterarse del error recién al volver — este aviso es lo único que puede
// prevenirlo de antemano.
const vieneDeInvitacion = computed(
  () => typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/invite'),
)

// Mismo destino usado dos veces: si signUp() ya deja sesión (confirmación de
// correo desactivada) se navega aquí mismo; si no, es a donde debe volver el
// enlace de confirmación (ver signUp() más abajo) — las dos rutas tienen que
// coincidir o la invitación se pierde en la vuelta.
const destino = computed(() =>
  typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard',
)

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
      options: {
        data: { full_name: nombreCompleto.value },
        // Sin esto, GoTrue manda el enlace de confirmación al Site URL
        // desnudo — quien venía de aceptar una invitación llega sin sesión Y
        // sin token, y termina en /onboarding/create-tenant como si nunca
        // hubiera pasado por /invite (bug reportado 2026-09-04: la
        // invitación nunca se acepta, accept_invitation() no llega a
        // llamarse). emailRedirectTo cierra ese hueco — mismo patrón que
        // forgot-password.vue con reset-password.
        emailRedirectTo: `${config.public.appUrl}${destino.value}`,
      },
    })
    if (errorAuth) {
      error.value = errorAuth.message
      return
    }
    if (!data.session) {
      confirmacionPendiente.value = true
      return
    }
    // Mismo motivo que login.vue: sin esto, registrarse estando ya
    // autenticado como otra cuenta en la misma pestaña deja el
    // active_tenant_id/memberships de la cuenta ANTERIOR en caché.
    authStore.limpiar()
    tenantStore.limpiar()
    useCookie<boolean>('copropiedad-confirmada-sesion').value = false
    await esperarSesion()
    await navigateTo(destino.value)
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
      <UAlert
        v-if="vieneDeInvitacion"
        color="info"
        variant="soft"
        icon="i-lucide-info"
        title="Usa el mismo correo al que te llegó la invitación"
        description="Tiene que coincidir exactamente — si te registras con otro, la cuenta se crea pero la invitación no se puede aceptar."
      />

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
