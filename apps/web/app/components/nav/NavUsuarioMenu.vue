<script setup lang="ts">
const usuario = useSupabaseUser()
const cliente = useSupabaseClient()
const router = useRouter()
const authStore = useAuthStore()
const tenantStore = useTenantStore()
const colorMode = useColorMode()

const TEMA_OPCIONES = [
  { valor: 'light', etiqueta: 'Claro' },
  { valor: 'dark', etiqueta: 'Oscuro' },
  { valor: 'system', etiqueta: 'Sistema' },
] as const

const ROL_LABEL: Record<string, string> = {
  agent: 'Administrador',
  auditor: 'Auditor',
}

const menuAbierto = useMenuHeaderAbierto()
const abierto = computed(() => menuAbierto.value === 'usuario')
const contenedorRef = ref<HTMLElement | null>(null)

const nombre = computed(
  () => authStore.profile?.full_name ?? usuario.value?.email ?? 'Usuario',
)

const iniciales = computed(() => {
  const partes = nombre.value.trim().split(/\s+/)
  const letras =
    partes.length >= 2
      ? partes[0]!.charAt(0) + partes[1]!.charAt(0)
      : nombre.value.slice(0, 2)
  return letras.toUpperCase()
})

function alternar(): void {
  menuAbierto.value = abierto.value ? null : 'usuario'
}

function alPerderFoco(evento: FocusEvent): void {
  const siguiente = evento.relatedTarget as Node | null
  if (siguiente && contenedorRef.value?.contains(siguiente)) return
  if (abierto.value) menuAbierto.value = null
}

async function cerrarSesion(): Promise<void> {
  await cliente.auth.signOut()
  authStore.limpiar()
  tenantStore.limpiar()
  await router.push('/login')
}
</script>

<template>
  <div ref="contenedorRef" class="relative" @focusout="alPerderFoco">
    <button
      v-if="usuario"
      type="button"
      class="flex items-center gap-2.5 rounded-lg px-1.5 py-1 hover:bg-gray-50 dark:hover:bg-gray-900"
      @click="alternar"
    >
      <img
        v-if="authStore.profile?.avatar_url"
        :src="authStore.profile.avatar_url"
        alt=""
        class="w-8 h-8 rounded-full object-cover shrink-0"
      >
      <span
        v-else
        class="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-xs font-semibold flex items-center justify-center shrink-0"
      >
        {{ iniciales }}
      </span>
      <span class="hidden sm:flex flex-col items-start leading-tight">
        <span class="text-sm font-medium truncate max-w-[9rem]">{{ nombre }}</span>
        <span v-if="tenantStore.role" class="text-xs text-gray-400">{{ ROL_LABEL[tenantStore.role] }}</span>
      </span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 text-gray-400 shrink-0">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>

    <div
      v-if="abierto"
      class="absolute top-full right-0 mt-2 w-56 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-xl z-40 overflow-hidden"
    >
      <div class="px-3 py-2.5 border-b border-gray-100 dark:border-gray-800">
        <p class="text-sm font-medium truncate">{{ nombre }}</p>
        <p class="text-xs text-gray-400 truncate">{{ usuario?.email }}</p>
      </div>

      <div class="px-3 py-2.5 border-b border-gray-100 dark:border-gray-800">
        <p class="text-xs text-gray-400 mb-1.5">Tema</p>
        <div class="flex items-center gap-1 rounded-md bg-gray-100 dark:bg-gray-800 p-0.5">
          <button
            v-for="opcion in TEMA_OPCIONES"
            :key="opcion.valor"
            type="button"
            class="flex-1 rounded px-1.5 py-1 text-xs font-medium transition-colors"
            :class="
              colorMode.preference === opcion.valor
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            "
            @click="colorMode.preference = opcion.valor"
          >
            {{ opcion.etiqueta }}
          </button>
        </div>
      </div>

      <button
        type="button"
        class="w-full text-left px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
        @click="cerrarSesion"
      >
        Cerrar sesión
      </button>
    </div>
  </div>
</template>
