<script setup lang="ts">
// PLAN §9.1: /register → supabase.auth.signUp() → trigger on_auth_user_created
// (profiles + audit_log, ya existe de F1) → email de confirmación.
definePageMeta({ layout: 'auth', publico: true })

const cliente = useSupabaseClient()
const route = useRoute()
const config = useRuntimeConfig()

// El enlace de invitación nunca lleva el correo en la URL (deliberado —
// no exponer PII en query strings/logs, ver email_invitation.ts). Sin esa
// pista, quien viene de /invite podía registrarse con cualquier correo y
// enterarse del error recién al volver — este aviso es lo único que puede
// prevenirlo de antemano.
const vieneDeInvitacion = computed(
  () => typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/invite'),
)

// Nunca navegar (ni construir el emailRedirectTo) con lo que venga en la
// query sin validar — ver el mismo helper y su motivo en login.vue (new
// URL() en vez de comparar el string a mano, para no dejar pasar el bypass
// de "\" que algunos navegadores normalizan a "/").
function destinoSeguro(bruto: unknown): string {
  if (typeof bruto !== 'string') return '/dashboard'
  try {
    const resuelto = new URL(bruto, window.location.origin)
    if (resuelto.origin === window.location.origin) {
      return `${resuelto.pathname}${resuelto.search}${resuelto.hash}`
    }
  } catch {
    // bruto no era una URL válida ni siquiera relativa al origin — cae al default.
  }
  return '/dashboard'
}

// Mismo destino usado dos veces: si signUp() ya deja sesión (confirmación de
// correo desactivada) se navega aquí mismo; si no, es a donde debe volver el
// enlace de confirmación (ver signUp() más abajo) — las dos rutas tienen que
// coincidir o la invitación se pierde en la vuelta.
const destino = computed(() => destinoSeguro(route.query.redirect))

const nombreCompleto = ref('')
const email = ref('')
const emailTocado = ref(false)
const password = ref('')
const cargando = ref(false)
const error = ref<string | null>(null)
const confirmacionPendiente = ref(false)
const mostrarPassword = ref(false)

// Ver login.vue: mismo mensaje de formato, integrado al look del formulario
// en vez del tooltip nativo del navegador; no se muestra hasta salir del campo.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const errorEmail = computed(() => {
  if (!emailTocado.value || !email.value) return undefined
  return EMAIL_REGEX.test(email.value) ? undefined : 'Ingresa un correo con formato válido.'
})

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
    // Ver login.vue: un inicio de sesión nuevo arranca con el acordeón del
    // sidebar cerrado, no con lo que quedara de una cuenta anterior en la
    // misma pestaña.
    useCookie('sidebar-grupos-cerrados').value = null
    // Recarga completa, no navigateTo() — mismo motivo que login.vue: evita
    // la condición de carrera justo después de autenticar (visto en vivo
    // 2026-08-28) y cualquier caché de authStore/tenantStore de una cuenta
    // anterior en la misma pestaña, sin necesidad de limpiarlos a mano.
    window.location.href = destino.value
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
        <UInput
          v-model="nombreCompleto"
          required
          autocomplete="name"
          icon="i-lucide-user"
          class="w-full"
        />
      </UFormField>

      <UFormField label="Correo electrónico" name="email" :error="errorEmail">
        <UInput
          v-model="email"
          type="email"
          required
          autocomplete="email"
          icon="i-lucide-mail"
          class="w-full"
          @blur="emailTocado = true"
        />
      </UFormField>

      <UFormField label="Contraseña" name="password">
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

      <UAlert v-if="error" color="error" variant="soft" :title="error" />

      <UButton type="submit" block :loading="cargando">Crear cuenta</UButton>
    </form>

    <template #footer>
      <p class="text-sm text-muted">
        ¿Ya tienes cuenta?
        <NuxtLink to="/login" class="text-primary-500 font-medium">Inicia sesión</NuxtLink>
      </p>
    </template>
  </UCard>
</template>
