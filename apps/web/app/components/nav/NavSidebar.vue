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

// Acordeón: al desplegar un grupo, cualquier otro que estuviera desplegado
// se repliega — nunca queda más de uno abierto a la vez. Al replegar el
// grupo abierto, los demás quedan como estaban (todos cerrados).
function toggleGrupo(titulo: string): void {
  if (gruposCerrados.value.includes(titulo)) {
    gruposCerrados.value = gruposVisibles.value.map((g) => g.titulo).filter((t) => t !== titulo)
  } else {
    gruposCerrados.value = [...gruposCerrados.value, titulo]
  }
}

function puedeVer(item: NavItem): boolean {
  const tienePermiso = !item.permiso || tenantStore.puede(item.permiso)
  const tieneModulo = !item.modulo || tenantStore.puedeVerModulo(item.modulo)
  return tienePermiso && tieneModulo
}

const gruposVisibles = computed(() =>
  NAV_GRUPOS.map((grupo) => ({ ...grupo, items: grupo.items.filter(puedeVer) })).filter(
    (grupo) => grupo.items.length > 0,
  ),
)

function activo(to: string): boolean {
  return route.path === to || route.path.startsWith(`${to}/`)
}

// Sidebar oscuro fijo (no sigue el tema claro/oscuro de la app, a
// propósito — mismo criterio que el diseño de referencia: el sidebar es
// una franja de marca, no contenido). Un color de ícono por grupo, para
// escanear visualmente la sección sin leer la etiqueta — el ítem activo
// siempre pasa a blanco sobre el pill sólido, sin importar su color de
// grupo (la coloración es solo para el estado inactivo).
const COLOR_ICONO_GRUPO: Record<string, string> = {
  Copropiedad: 'text-teal-400',
  Presupuesto: 'text-violet-400',
  Facturación: 'text-emerald-400',
  'Recaudo y Cartera': 'text-blue-400',
  Contabilidad: 'text-orange-400',
  Configuración: 'text-slate-400',
  Seguridad: 'text-amber-400',
}
const COLOR_ICONO_TOP = 'text-cyan-400'
const COLOR_ICONO_PLATAFORMA = 'text-rose-400'
</script>

<template>
  <aside
    class="shrink-0 bg-slate-900 flex flex-col transition-[width] duration-150"
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
              ? 'bg-indigo-600 text-white font-medium'
              : 'text-slate-300 hover:bg-slate-800 hover:text-white'
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
            :class="activo(item.to) ? 'text-white' : COLOR_ICONO_TOP"
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
          <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {{ grupo.titulo }}
          </span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="w-3 h-3 text-slate-600 group-hover:text-slate-400 transition-transform"
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
            class="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px]"
            :class="
              activo(item.to)
                ? 'bg-indigo-600 text-white font-medium'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
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
              :class="activo(item.to) ? 'text-white' : (COLOR_ICONO_GRUPO[grupo.titulo] ?? 'text-slate-400')"
            >
              <path :d="item.icono" />
            </svg>
            <span v-if="!colapsado" class="truncate">{{ item.label }}</span>
          </NuxtLink>
        </div>
      </div>

      <div v-if="authStore.isPlatformAdmin" class="pt-2 border-t border-slate-800">
        <NuxtLink
          :to="NAV_PLATAFORMA.to"
          class="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm"
          :class="
            activo(NAV_PLATAFORMA.to)
              ? 'bg-indigo-600 text-white font-medium'
              : 'text-slate-300 hover:bg-slate-800 hover:text-white'
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
            :class="activo(NAV_PLATAFORMA.to) ? 'text-white' : COLOR_ICONO_PLATAFORMA"
          >
            <path :d="NAV_PLATAFORMA.icono" />
          </svg>
          <span v-if="!colapsado" class="truncate">{{ NAV_PLATAFORMA.label }}</span>
        </NuxtLink>
      </div>
    </nav>

    <button
      type="button"
      class="flex items-center justify-center gap-2 text-slate-500 hover:text-slate-300 border-t border-slate-800 py-2"
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
