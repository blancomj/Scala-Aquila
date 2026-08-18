<script setup lang="ts">
const tenantStore = useTenantStore()

// Misma cookie que NavSidebar.vue (mismo nombre de key = mismo ref
// reactivo compartido, sin necesidad de subir el estado a un store) —
// el header necesita el ancho actual del sidebar para alinear la
// búsqueda y el breadcrumb con el borde izquierdo del contenido interior,
// tanto expandido (14rem) como colapsado (3.5rem).
const colapsado = useCookie<boolean>('sidebar-colapsado', { default: () => false })
const anchoSidebar = computed(() => (colapsado.value ? '3.5rem' : '14rem'))

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
        <div class="shrink-0 pl-4" :style="{ width: anchoSidebar }">
          <span class="font-semibold">Aquila PH</span>
        </div>
        <div class="flex-1 flex items-center gap-4 py-2.5 pr-4 pl-10">
          <BusquedaGlobal v-if="tenantStore.activeTenant" />
          <div class="flex items-center gap-2 ml-auto shrink-0">
            <NavTenantSwitcher />
            <NavNotificaciones v-if="tenantStore.activeTenant" />
            <NavUsuarioMenu />
          </div>
        </div>
      </div>
      <!-- Oculto temporalmente (decisión del usuario, 2026-08-18) mientras
      se define su ubicación definitiva en el header. -->
      <div v-if="false" class="flex items-center border-t border-gray-100 dark:border-gray-900">
        <div class="shrink-0" :style="{ width: anchoSidebar }" />
        <div class="flex-1 py-1.5 pr-4 pl-10">
          <NavBreadcrumb />
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
