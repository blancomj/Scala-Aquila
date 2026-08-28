<script setup lang="ts">
// Paso obligatorio de login para usuarios con más de una membresía —
// middleware/tenant.ts redirige aquí cuando memberships.length > 1 y la
// sesión (cookie 'copropiedad-confirmada-sesion') todavía no lo confirmó.
// Requiere sesión + active_tenant_id ya resuelto (por eso sí lleva
// middleware: ['tenant']: el guard interno de esa misma pieza se salta a sí
// mismo cuando to.path ya es esta ruta, así que no hay bucle).
definePageMeta({ layout: 'auth', middleware: ['tenant'] })

const tenantStore = useTenantStore()
const authStore = useAuthStore()
const route = useRoute()

const copropiedadConfirmada = useCookie<boolean>('copropiedad-confirmada-sesion', {
  default: () => false,
})

const destino = computed(() =>
  typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard',
)

// Si alguien llega aquí directo (o su membresía única se resolvió después
// de que el middleware ya había decidido redirigir) no hay nada que
// preguntar — se confirma sola y sigue, tal como si nunca hubiera pasado
// por aquí (§ "si el usuario solo está vinculado a una sola no pide nada").
if (tenantStore.memberships.length <= 1) {
  copropiedadConfirmada.value = true
  await navigateTo(destino.value)
}

// Preselección: la predeterminada del perfil — si no hay, la activa de la
// sesión anterior — si tampoco, la primera membresía. Siempre hay algo
// seleccionado, nunca arranca en blanco.
const seleccionada = ref<string>(
  tenantStore.tenantPredeterminadoId ??
    authStore.profile?.active_tenant_id ??
    tenantStore.memberships[0]?.tenant_id ??
    '',
)

const cargando = ref(false)
const error = ref<string | null>(null)

async function continuar(): Promise<void> {
  if (!seleccionada.value) return
  error.value = null
  cargando.value = true
  try {
    if (seleccionada.value !== authStore.profile?.active_tenant_id) {
      await tenantStore.cambiarTenant(seleccionada.value)
    }
    copropiedadConfirmada.value = true
    await navigateTo(destino.value)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo abrir esa copropiedad.')
  } finally {
    cargando.value = false
  }
}
</script>

<template>
  <UCard>
    <template #header>
      <h1 class="text-lg font-semibold">¿Con cuál copropiedad vas a trabajar?</h1>
    </template>

    <div class="space-y-4">
      <div class="space-y-2">
        <button
          v-for="m in tenantStore.memberships"
          :key="m.tenant_id"
          type="button"
          class="w-full flex items-center justify-between gap-2 rounded-md border px-3 py-2.5 text-sm text-left transition-colors"
          :class="
            seleccionada === m.tenant_id
              ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/40 font-medium'
              : 'border-default hover:bg-neutral-50 dark:hover:bg-neutral-900'
          "
          @click="seleccionada = m.tenant_id"
        >
          <span class="truncate">{{ m.tenant.name }}</span>
          <span v-if="m.tenant_id === tenantStore.tenantPredeterminadoId" class="text-xs text-muted shrink-0">
            Predeterminada
          </span>
        </button>
      </div>

      <UAlert v-if="error" color="error" variant="soft" :title="error" />

      <UButton block :loading="cargando" :disabled="!seleccionada" @click="continuar">
        Continuar
      </UButton>
    </div>
  </UCard>
</template>
