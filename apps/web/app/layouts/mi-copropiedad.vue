<script setup lang="ts">
// EXT-05 §6.2 — shell mobile-first de "AQUILA Mi Copropiedad". A propósito NO reutiliza
// layouts/default.vue: ese layout es el sidebar/header administrativo (NavSidebar, roles de
// tenant) — esta superficie es para un actor externo, que nunca es tenant_member (AD-37) y no
// debe heredar navegación pensada para auxiliar/administrador (PLAN_MI_COPROPIEDAD.md §6,
// "que el layout nuevo no termine heredando navegación administrativa").
const actorExterno = useActorExternoStore()
const route = useRoute()

interface ItemNav {
  to: string
  label: string
  icon: string
}

// Inicio/Finanzas (Ola 1 U6) y Solicitudes (Ola 2 M10) ya tienen listado propio bajo
// /mi-copropiedad/solicitudes — "nueva.vue" queda accesible desde ahí (botón "+"), no desde el
// bottom nav. "Más" sigue sin página propia (perfil/cerrar sesión ya vive en el botón del header)
// — no es un entregable de esta ola, se deja para cuando haya contenido real que justifique un
// menú aparte.
const NAV_ITEMS: ItemNav[] = [
  { to: '/mi-copropiedad', label: 'Inicio', icon: 'i-lucide-house' },
  { to: '/mi-copropiedad/finanzas', label: 'Finanzas', icon: 'i-lucide-wallet' },
  { to: '/mi-copropiedad/solicitudes', label: 'Solicitudes', icon: 'i-lucide-message-square' },
  { to: '/mi-copropiedad/mas', label: 'Más', icon: 'i-lucide-menu' },
]

function esRutaActiva(to: string): boolean {
  return to === '/mi-copropiedad' ? route.path === to : route.path.startsWith(to)
}

async function cerrarSesion(): Promise<void> {
  await actorExterno.cerrarSesion()
  await navigateTo('/mi-copropiedad/login')
}
</script>

<template>
  <div class="min-h-screen flex flex-col bg-muted">
    <header
      class="shrink-0 sticky top-0 z-20 bg-default border-b border-default px-4 py-3 flex items-center justify-between gap-3"
    >
      <div class="min-w-0">
        <MiCopropiedadSelectorVinculo v-if="actorExterno.tieneMultiplesVinculos" />
        <span
          v-else
          class="block truncate text-sm font-medium text-highlighted"
        >
          {{ actorExterno.vinculoActivo?.tenant_nombre ?? 'Mi Copropiedad' }}
        </span>
      </div>
      <div class="flex items-center gap-1 shrink-0">
        <MiCopropiedadNotificacionBell />
        <UButton
          icon="i-lucide-log-out"
          color="neutral"
          variant="ghost"
          size="sm"
          aria-label="Cerrar sesión"
          @click="cerrarSesion"
        />
      </div>
    </header>

    <main class="flex-1 overflow-y-auto pb-20">
      <slot />
    </main>

    <nav
      class="shrink-0 fixed bottom-0 inset-x-0 z-20 bg-default border-t border-default grid grid-cols-4"
      style="padding-bottom: env(safe-area-inset-bottom, 0px)"
    >
      <NuxtLink
        v-for="item in NAV_ITEMS"
        :key="item.to"
        :to="item.to"
        class="flex flex-col items-center justify-center gap-0.5 py-2 text-xs"
        :class="
          esRutaActiva(item.to)
            ? 'text-primary-600 dark:text-primary-400'
            : 'text-muted'
        "
      >
        <UIcon :name="item.icon" class="size-5" />
        {{ item.label }}
      </NuxtLink>
    </nav>
  </div>
</template>
