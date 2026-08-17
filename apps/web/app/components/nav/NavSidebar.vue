<script setup lang="ts">
import {
  NAV_COPROPIEDADES,
  NAV_GRUPOS,
  NAV_INICIO,
  NAV_PLATAFORMA,
  type NavItem,
} from '~/utils/navegacion'

const tenantStore = useTenantStore()
const authStore = useAuthStore()
const route = useRoute()

// Colapso del sidebar (icon-only) persistido en cookie (SSR-safe) —
// localStorage a secas produce hydration mismatch porque el server no lo
// puede leer en el primer render.
const colapsado = useCookie<boolean>('sidebar-colapsado', { default: () => false })

// Grupos colapsados (acordeón) — guarda los TÍTULOS cerrados, no los
// abiertos: por defecto (cookie vacía) todos los grupos están expandidos.
const gruposCerrados = useCookie<string[]>('sidebar-grupos-cerrados', { default: () => [] })

function toggleGrupo(titulo: string): void {
  gruposCerrados.value = gruposCerrados.value.includes(titulo)
    ? gruposCerrados.value.filter((t) => t !== titulo)
    : [...gruposCerrados.value, titulo]
}

function puedeVer(item: NavItem): boolean {
  return !item.permiso || tenantStore.puede(item.permiso)
}

const gruposVisibles = computed(() =>
  NAV_GRUPOS.map((grupo) => ({ ...grupo, items: grupo.items.filter(puedeVer) })).filter(
    (grupo) => grupo.items.length > 0,
  ),
)

function activo(to: string): boolean {
  return route.path === to || route.path.startsWith(`${to}/`)
}
</script>

<template>
  <aside
    class="shrink-0 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 flex flex-col transition-[width] duration-150"
    :class="colapsado ? 'w-14' : 'w-56'"
  >
    <nav class="flex-1 overflow-y-auto py-3 px-2 space-y-4">
      <div class="space-y-0.5">
        <NuxtLink
          v-for="item in [NAV_INICIO, NAV_COPROPIEDADES]"
          :key="item.to"
          :to="item.to"
          class="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm"
          :class="
            activo(item.to)
              ? 'bg-primary-50 dark:bg-primary-950 text-primary-700 dark:text-primary-400 font-medium'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900'
          "
          :title="colapsado ? item.label : undefined"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="w-4 h-4 shrink-0"
          >
            <path :d="item.icono" />
          </svg>
          <span v-if="!colapsado" class="truncate">{{ item.label }}</span>
        </NuxtLink>
      </div>

      <div v-for="grupo in gruposVisibles" :key="grupo.titulo">
        <button
          v-if="!colapsado"
          type="button"
          class="w-full flex items-center justify-between px-2 mb-1 group"
          @click="toggleGrupo(grupo.titulo)"
        >
          <span class="text-[10.5px] uppercase tracking-wide text-gray-400 font-mono">
            {{ grupo.titulo }}
          </span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="w-3 h-3 text-gray-300 group-hover:text-gray-400 transition-transform"
            :class="gruposCerrados.includes(grupo.titulo) ? '-rotate-90' : ''"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        <div
          v-if="colapsado || !gruposCerrados.includes(grupo.titulo)"
          class="space-y-0.5"
        >
          <NuxtLink
            v-for="item in grupo.items"
            :key="item.to"
            :to="item.to"
            class="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm"
            :class="
              activo(item.to)
                ? 'bg-primary-50 dark:bg-primary-950 text-primary-700 dark:text-primary-400 font-medium'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900'
            "
            :title="colapsado ? item.label : undefined"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="w-4 h-4 shrink-0"
            >
              <path :d="item.icono" />
            </svg>
            <span v-if="!colapsado" class="truncate">{{ item.label }}</span>
          </NuxtLink>
        </div>
      </div>

      <div v-if="authStore.isPlatformAdmin" class="pt-2 border-t border-gray-200 dark:border-gray-800">
        <NuxtLink
          :to="NAV_PLATAFORMA.to"
          class="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm"
          :class="
            activo(NAV_PLATAFORMA.to)
              ? 'bg-primary-50 dark:bg-primary-950 text-primary-700 dark:text-primary-400 font-medium'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900'
          "
          :title="colapsado ? NAV_PLATAFORMA.label : undefined"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="w-4 h-4 shrink-0"
          >
            <path :d="NAV_PLATAFORMA.icono" />
          </svg>
          <span v-if="!colapsado" class="truncate">{{ NAV_PLATAFORMA.label }}</span>
        </NuxtLink>
      </div>
    </nav>

    <button
      type="button"
      class="flex items-center justify-center gap-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 border-t border-gray-200 dark:border-gray-800 py-2"
      :title="colapsado ? 'Expandir' : 'Colapsar'"
      @click="colapsado = !colapsado"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="w-4 h-4 transition-transform"
        :class="colapsado ? 'rotate-180' : ''"
      >
        <path d="M15 6l-6 6 6 6" />
      </svg>
      <span v-if="!colapsado" class="text-xs">Colapsar</span>
    </button>
  </aside>
</template>
