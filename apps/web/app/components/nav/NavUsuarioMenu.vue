<script setup lang="ts">
import { ROL_LABEL } from '~/utils/rol-labels'

const usuario = useSupabaseUser()
const cliente = useSupabaseClient()
const router = useRouter()
const authStore = useAuthStore()
const tenantStore = useTenantStore()
const colorMode = useColorMode()

const TEMA_OPCIONES = [
  { valor: 'light', etiqueta: 'Claro', icono: 'sol' },
  { valor: 'dark', etiqueta: 'Oscuro', icono: 'luna' },
  { valor: 'system', etiqueta: 'Sistema', icono: 'sistema' },
] as const

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
  // Un login nuevo (mismo usuario u otro) en este navegador debe volver a
  // preguntar con cuál copropiedad trabajar — ver middleware/tenant.ts.
  useCookie<boolean>('copropiedad-confirmada-sesion').value = false
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

      <NuxtLink
        to="/perfil"
        class="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-100 dark:border-gray-800"
        @click="menuAbierto = null"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-blue-500 shrink-0">
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        Mi perfil
      </NuxtLink>

      <div class="px-3 py-2.5 border-b border-gray-100 dark:border-gray-800">
        <p class="flex items-center gap-2.5 text-xs text-gray-400 mb-1.5">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-violet-500 shrink-0">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 18a6 6 0 0 0 0-12v12z" fill="currentColor" stroke="none" />
          </svg>
          Tema
        </p>
        <div class="flex items-center gap-1 rounded-md bg-gray-100 dark:bg-gray-800 p-0.5">
          <button
            v-for="opcion in TEMA_OPCIONES"
            :key="opcion.valor"
            type="button"
            :title="opcion.etiqueta"
            :aria-label="opcion.etiqueta"
            :aria-pressed="colorMode.preference === opcion.valor"
            class="flex-1 flex items-center justify-center rounded px-1.5 py-1.5 transition-colors"
            :class="
              colorMode.preference === opcion.valor
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            "
            @click="colorMode.preference = opcion.valor"
          >
            <svg v-if="opcion.icono === 'sol'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-amber-500">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2" />
              <path d="M12 20v2" />
              <path d="m4.93 4.93 1.41 1.41" />
              <path d="m17.66 17.66 1.41 1.41" />
              <path d="M2 12h2" />
              <path d="M20 12h2" />
              <path d="m6.34 17.66-1.41 1.41" />
              <path d="m19.07 4.93-1.41 1.41" />
            </svg>
            <svg v-else-if="opcion.icono === 'luna'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-indigo-400">
              <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-sky-500">
              <rect width="20" height="14" x="2" y="3" rx="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          </button>
        </div>
      </div>

      <button
        type="button"
        class="w-full flex items-center gap-2.5 text-left px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
        @click="cerrarSesion"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-rose-500 shrink-0">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        Cerrar sesión
      </button>
    </div>
  </div>
</template>
