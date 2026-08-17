<script setup lang="ts">
const tenantStore = useTenantStore()

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
      <div class="px-4 py-1.5 border-b border-gray-100 dark:border-gray-900">
        <NavBreadcrumb />
      </div>
      <div class="px-4 py-2.5 flex items-center gap-4">
        <span class="font-semibold shrink-0">Aquila PH</span>
        <BusquedaGlobal v-if="tenantStore.activeTenant" />
        <div class="flex items-center gap-2 ml-auto shrink-0">
          <NavTenantSwitcher />
          <NavNotificaciones v-if="tenantStore.activeTenant" />
          <NavUsuarioMenu />
        </div>
      </div>
    </header>
    <div class="flex-1 flex overflow-hidden">
      <NavSidebar />
      <main class="flex-1 overflow-y-auto p-4">
        <slot />
      </main>
    </div>
  </div>
</template>
