<script setup lang="ts">
// PLAN §9.2 — entrada por token. `publico: true`: debe ser alcanzable sin
// sesión (para decidir login vs registro) y sin tenant activo (quien
// acepta puede no tener ninguna copropiedad todavía).
definePageMeta({ layout: 'auth', publico: true })

const route = useRoute()
const cliente = useSupabaseClient()
const usuario = useSupabaseUser()
const authStore = useAuthStore()
const tenantStore = useTenantStore()
const invitationsStore = useInvitationsStore()

const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''))
const rutaConToken = computed(() => `/invite?token=${encodeURIComponent(token.value)}`)

const procesando = ref(false)
const error = ref<string | null>(null)
const sesionCerradaPorOtroCorreo = ref(false)

async function aceptar(): Promise<void> {
  error.value = null
  procesando.value = true
  try {
    await invitationsStore.aceptar(token.value)
    await authStore.cargarPerfil({ forzar: true })
    await navigateTo('/dashboard')
  } catch (excepcion) {
    // La sesión activa en este navegador no es la del correo invitado (p.
    // ej. quedó abierta de una cuenta distinta). "Reintentar" con la misma
    // sesión repetiría el mismo rechazo para siempre — hay que cerrarla y
    // dejar que el usuario inicie sesión (o se registre) con el correo
    // correcto, que es la pantalla que ya existe para cuando no hay sesión.
    if ((excepcion as { code?: string } | undefined)?.code === 'INV_EMAIL_MISMATCH') {
      sesionCerradaPorOtroCorreo.value = true
      await cliente.auth.signOut()
      authStore.limpiar()
      tenantStore.limpiar()
      // Mismo criterio que NavUsuarioMenu.vue/perfil.vue: un login nuevo
      // (ahora con el correo correcto) debe volver a preguntar con cuál
      // copropiedad trabajar si esa cuenta tiene más de una — sin esto, una
      // confirmación fantasma de ESTA sesión saltaría esa pregunta.
      useCookie<boolean>('copropiedad-confirmada-sesion').value = false
      return
    }
    error.value = mensajeError(excepcion, 'No se pudo aceptar la invitación.')
  } finally {
    procesando.value = false
  }
}

onMounted(async () => {
  if (!token.value) {
    error.value = 'Falta el token de invitación.'
    return
  }
  if (usuario.value) {
    await aceptar()
  }
})
</script>

<template>
  <UCard>
    <template #header>
      <h1 class="text-lg font-semibold">Invitación</h1>
    </template>

    <div v-if="!token">
      <UAlert color="error" variant="soft" title="Falta el token de invitación en el enlace." />
    </div>

    <div v-else-if="procesando" class="text-muted">Procesando invitación…</div>

    <div v-else-if="error" class="space-y-4">
      <UAlert color="error" variant="soft" :title="error" />
      <UButton block :loading="procesando" @click="aceptar">Reintentar</UButton>
    </div>

    <div v-else-if="!usuario || sesionCerradaPorOtroCorreo" class="space-y-4">
      <UAlert
        v-if="sesionCerradaPorOtroCorreo"
        color="warning"
        variant="soft"
        title="Cerramos la sesión que tenías abierta"
        description="No era la del correo al que enviaron esta invitación. Inicia sesión o crea una cuenta con ese correo para continuar."
      />
      <p v-else class="text-muted">
        Para aceptar la invitación, inicia sesión o crea una cuenta con el correo al que te
        invitaron.
      </p>
      <UButton block :to="{ path: '/login', query: { redirect: rutaConToken } }"
        >Ya tengo cuenta</UButton
      >
      <UButton
        block
        variant="outline"
        :to="{ path: '/register', query: { redirect: rutaConToken } }"
      >
        Soy nuevo
      </UButton>
    </div>
  </UCard>
</template>
