<script setup lang="ts">
const tenantStore = useTenantStore()

// Misma cookie que NavSidebar.vue (mismo nombre de key = mismo ref
// reactivo compartido, sin necesidad de subir el estado a un store) —
// el header necesita el ancho actual del sidebar para alinear la
// búsqueda y el breadcrumb con el borde izquierdo del contenido interior,
// tanto expandido (14rem) como colapsado (3.5rem).
const colapsado = useCookie<boolean>('sidebar-colapsado', { default: () => false })
const anchoSidebar = computed(() => (colapsado.value ? '3.5rem' : '14rem'))

// Drawer del sidebar en mobile (< md): NavSidebar.vue lee el mismo estado
// compartido para decidir si se muestra fuera de pantalla o como overlay.
const sidebarMobileAbierto = useSidebarMobile()

// Misma key 'memberships' que usan las páginas (p. ej. dashboard/index.vue)
// — Nuxt deduplica useAsyncData por key dentro de la misma request, así que
// esto no dispara una segunda consulta, solo sincroniza el layout con la
// misma promesa/payload. Sin este await, el layout renderiza
// NavTenantSwitcher ANTES de que tenantStore.memberships esté poblado en
// SSR, pero el cliente hidrata después de que la página ya lo pobló —
// "Hydration node mismatch" (visto en pruebas manuales).
await useAsyncData('memberships', () => tenantStore.cargarMemberships())
</script>

<template>
  <div class="h-screen flex flex-col overflow-hidden">
    <header class="shrink-0 z-30 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800">
      <div class="flex items-center">
        <!-- >= md: mismo espaciador de siempre, del ancho exacto del sidebar fijo. -->
        <div class="hidden md:block shrink-0 pl-4" :style="{ width: anchoSidebar }">
          <span class="font-semibold">Aquila PH</span>
        </div>
        <!-- < md: el sidebar deja de reservar espacio en el flujo (pasa a overlay, ver
             NavSidebar.vue) — este botón lo abre. -->
        <div class="flex md:hidden items-center gap-2 shrink-0 pl-4">
          <button
            type="button"
            class="flex items-center justify-center size-8 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Abrir menú de navegación"
            :aria-expanded="sidebarMobileAbierto"
            @click="sidebarMobileAbierto = true"
          >
            <UIcon name="i-lucide-menu" class="size-5" />
          </button>
          <span class="font-semibold">Aquila PH</span>
        </div>
        <div class="flex-1 flex items-center gap-4 py-2.5 pr-4 pl-4 md:pl-10 min-w-0">
          <!-- Oculto de nuevo (2026-08-26): al ponerlo en la misma fila que
          la búsqueda, BusquedaGlobal no tiene min-w-0 (flex-1 solo no evita
          que un flex-item se niegue a encoger bajo su ancho intrínseco) y
          no cedía espacio — el breadcrumb empujaba el grupo de la derecha
          fuera del header en vez de truncar él mismo. Corregir dándole
          min-w-0 a BusquedaGlobal antes de reactivar esto. -->
          <BusquedaGlobal v-if="tenantStore.activeTenant" />
          <div class="flex items-center gap-2 ml-auto shrink-0">
            <NavTenantSwitcher />
            <NavNotificaciones v-if="tenantStore.activeTenant" />
            <NavUsuarioMenu />
          </div>
        </div>
      </div>
    </header>
    <div class="flex-1 flex overflow-hidden">
      <NavSidebar />
      <main class="flex-1 overflow-y-auto py-4 pr-4 pl-10">
        <slot />
      </main>
    </div>
  </div>
</template>
