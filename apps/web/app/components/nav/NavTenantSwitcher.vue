<script setup lang="ts">
import { NAV_ICONOS } from '~/utils/navegacion'

const tenantStore = useTenantStore()

// Con una sola copropiedad no hay nada entre qué cambiar — el elemento se
// muestra como texto plano, sin botón ni menú (spec 2026-09-04).
const puedeCambiar = computed(() => tenantStore.memberships.length > 1)

const menuAbierto = useMenuHeaderAbierto()
const abierto = computed(() => menuAbierto.value === 'tenant')
const contenedorRef = ref<HTMLElement | null>(null)
const cambiando = ref(false)

function alternar(): void {
  menuAbierto.value = abierto.value ? null : 'tenant'
}

async function seleccionar(tenantId: string): Promise<void> {
  menuAbierto.value = null
  if (tenantId === tenantStore.activeTenant?.id) return
  cambiando.value = true
  await tenantStore.cambiarTenant(tenantId)
  // Recarga completa (no navigateTo/router.push): docenas de stores por
  // dominio (cuentaCorriente, documentos, coeficientes, presupuesto, etc.)
  // cargan datos scoped al tenant activo sin invalidarse entre sí al
  // cambiar de copropiedad — una navegación SPA dejaría instantáneas
  // viejas en cualquiera de ellos. /dashboard ya muestra el checklist de
  // "Primeros pasos" inline cuando el onboarding de esa copropiedad no
  // está completo (dashboard/index.vue), así que aterrizar ahí cubre
  // ambos casos sin lógica extra.
  window.location.href = '/dashboard'
}

function alPerderFoco(evento: FocusEvent): void {
  const siguiente = evento.relatedTarget as Node | null
  if (siguiente && contenedorRef.value?.contains(siguiente)) return
  if (abierto.value) menuAbierto.value = null
}
</script>

<template>
  <div ref="contenedorRef" class="relative" @focusout="alPerderFoco">
    <button
      v-if="tenantStore.activeTenant && puedeCambiar"
      type="button"
      class="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-800 px-2.5 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-900"
      @click="alternar"
    >
      <span
        class="w-6 h-6 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 flex items-center justify-center shrink-0"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5">
          <path :d="NAV_ICONOS.inmuebles" />
        </svg>
      </span>
      <span class="max-w-[12rem] truncate font-medium">{{ tenantStore.activeTenant.name }}</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 text-gray-400 shrink-0">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>

    <!-- Una sola copropiedad: texto plano, sin afordancia de cambio (nada
    entre qué elegir). -->
    <span
      v-else-if="tenantStore.activeTenant"
      class="flex items-center gap-2 px-2.5 py-1.5 text-sm text-gray-500 dark:text-gray-400"
    >
      <span
        class="w-6 h-6 rounded-md bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5">
          <path :d="NAV_ICONOS.inmuebles" />
        </svg>
      </span>
      <span class="max-w-[12rem] truncate font-medium">{{ tenantStore.activeTenant.name }}</span>
    </span>

    <div
      v-if="abierto"
      class="absolute top-full right-0 mt-2 w-72 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-xl z-40 overflow-hidden"
    >
      <p class="text-[10.5px] uppercase tracking-wide text-gray-400 font-mono px-3 pt-2.5 pb-1">
        Cambiar de copropiedad
      </p>
      <button
        v-for="m in tenantStore.memberships"
        :key="m.tenant_id"
        type="button"
        class="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
        :class="m.tenant_id === tenantStore.activeTenant?.id ? 'font-medium' : 'text-gray-600 dark:text-gray-300'"
        :disabled="cambiando"
        @click="seleccionar(m.tenant_id)"
      >
        <span class="truncate">{{ m.tenant.name }}</span>
        <svg
          v-if="m.tenant_id === tenantStore.activeTenant?.id"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="w-3.5 h-3.5 text-primary-600 dark:text-primary-400 shrink-0"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </button>
      <NuxtLink
        to="/copropiedades"
        class="block border-t border-gray-100 dark:border-gray-800 px-3 py-2 text-xs text-primary-600 dark:text-primary-400 hover:bg-gray-50 dark:hover:bg-gray-800"
        @click="menuAbierto = null"
      >
        Ver todas mis copropiedades →
      </NuxtLink>
    </div>
  </div>
</template>
