<script setup lang="ts">
// PLAN §9.2 — entrada por token. `publico: true`: debe ser alcanzable sin
// sesión (para decidir login vs registro) y sin tenant activo (quien
// acepta puede no tener ninguna copropiedad todavía).
definePageMeta({ layout: 'auth', publico: true })

const route = useRoute()
const usuario = useSupabaseUser()
const authStore = useAuthStore()
const invitationsStore = useInvitationsStore()

const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''))
const rutaConToken = computed(() => `/invite?token=${encodeURIComponent(token.value)}`)

const procesando = ref(false)
const error = ref<string | null>(null)

async function aceptar(): Promise<void> {
  error.value = null
  procesando.value = true
  try {
    await invitationsStore.aceptar(token.value)
    await authStore.cargarPerfil({ forzar: true })
    await navigateTo('/dashboard')
  } catch (excepcion) {
    error.value =
      excepcion instanceof Error ? excepcion.message : 'No se pudo aceptar la invitación.'
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

    <div v-else-if="procesando" class="text-gray-500">Procesando invitación…</div>

    <div v-else-if="error" class="space-y-4">
      <UAlert color="error" variant="soft" :title="error" />
      <UButton block :loading="procesando" @click="aceptar">Reintentar</UButton>
    </div>

    <div v-else-if="!usuario" class="space-y-4">
      <p class="text-gray-500">
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
