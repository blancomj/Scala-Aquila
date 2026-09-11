<script setup lang="ts">
definePageMeta({ layout: 'auth', publico: true })

const cliente = useSupabaseClient()
const route = useRoute()

// Mismo aviso que register.vue: si ya tenías cuenta pero con un correo
// distinto al invitado, iniciar sesión aquí no arregla nada — hay que
// entrar con la cuenta correcta (ver invite.vue, INV_EMAIL_MISMATCH).
const vieneDeInvitacion = computed(
  () => typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/invite'),
)

const email = ref('')
const emailTocado = ref(false)
const password = ref('')
const cargando = ref(false)
const error = ref<string | null>(null)
const mostrarPassword = ref(false)

// Validación de formato en el cliente, además del `type="email"` nativo del
// input (que ya bloquea el submit pero solo muestra el tooltip del
// navegador) — este mensaje se integra al look del formulario. No se
// muestra hasta que el usuario sale del campo, para no marcar error apenas
// escribe la primera letra.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const errorEmail = computed(() => {
  if (!emailTocado.value || !email.value) return undefined
  return EMAIL_REGEX.test(email.value) ? undefined : 'Ingresa un correo con formato válido.'
})

// Nunca navegar a lo que venga en la query sin validar: sin esto, un enlace
// tipo /login?redirect=https://evil.test lo aceptaría window.location.href
// tal cual (a diferencia de navigateTo(), que por defecto rechaza URLs
// externas). Se resuelve con new URL(), no comparando el string a mano
// (p. ej. "empieza con / y no con //"): algunos navegadores normalizan "\"
// a "/" al parsear una URL relativa, así que "/\evil.test" pasaría ese
// chequeo de texto y terminaría igual saliendo del origin — new URL() ya
// aplica esa misma normalización antes de comparar, así que no hay bypass
// que valga.
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
    // Recarga completa, no navigateTo() — mismo motivo que
    // NavTenantSwitcher.vue/copropiedades/index.vue al cambiar de
    // copropiedad: justo después de signInWithPassword() hay una ventana de
    // carrera real donde el ref reactivo de sesión ya está listo pero el
    // resto del cliente (el que usan las consultas de authStore/tenantStore)
    // todavía no — visto en vivo el 2026-08-28: middleware/tenant.ts leía
    // memberships=0 en el primer intento (mandaba a crear copropiedad
    // aunque la cuenta tuviera varias) y solo se veía bien al navegar de
    // nuevo. Una recarga completa parte de cero: sin cachés viejos de otra
    // cuenta en la misma pestaña, sin condición de carrera con el cliente
    // recién autenticado.
    window.location.href = destinoSeguro(route.query.redirect)
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
          autocomplete="current-password"
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

      <UButton type="submit" block :loading="cargando">Entrar</UButton>

      <p class="text-sm text-muted text-center">
        <NuxtLink to="/forgot-password" class="text-primary-500 font-medium">
          ¿Olvidaste tu contraseña?
        </NuxtLink>
      </p>
    </form>

    <template #footer>
      <p class="text-sm text-muted">
        ¿No tienes cuenta?
        <NuxtLink to="/register" class="text-primary-500 font-medium">Regístrate</NuxtLink>
      </p>
    </template>
  </UCard>
</template>
