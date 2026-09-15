<script setup lang="ts">
import {
  NAV_AYUDA,
  NAV_ASUNTOS,
  NAV_COPROPIEDADES,
  NAV_GRUPOS,
  NAV_INICIO,
  NAV_PLATAFORMA,
  type NavItem,
} from '~/utils/navegacion'

const tenantStore = useTenantStore()
const authStore = useAuthStore()
const route = useRoute()

// EXS-7 · el contador de «Mis asuntos». Mismo criterio que la campana: el
// número tiene que verse SIN entrar a la pantalla, porque su razón de ser
// es avisar de que hay trabajo. Comparte el store con /asuntos, así que
// abrir la bandeja no vuelve a consultar.
//
// Solo el total: desglosar por módulo en una franja de 14px no cabe, y el
// detalle ya está a un clic. Si el total es 0 no se pinta nada — una
// insignia en cero es ruido que enseña a ignorar la insignia.
const asuntosStore = useAsuntosStore()

async function cargarAsuntos(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (tenantId) await asuntosStore.cargar(tenantId)
}
onMounted(cargarAsuntos)
watch(() => tenantStore.activeTenant?.id, cargarAsuntos)

// Orden del menú personalizado por el administrador del tenant — se carga
// una sola vez por tenant activo, igual que Mis asuntos arriba.
const sidebarConfigStore = useSidebarConfigStore()
async function cargarConfiguracionMenu(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (tenantId) await sidebarConfigStore.cargar(tenantId)
}
onMounted(cargarConfiguracionMenu)
watch(() => tenantStore.activeTenant?.id, cargarConfiguracionMenu)

/** Colapsado, el punto no dice cuántos: el tooltip sí, que es lo único que
 *  queda para quien navega con teclado o lector de pantalla. */
function etiquetaConContador(item: NavItem): string {
  if (item.to !== NAV_ASUNTOS.to || asuntosStore.total === 0) return item.label
  return `${item.label} (${String(asuntosStore.total)})`
}

// Colapso del sidebar (icon-only) persistido en cookie (SSR-safe) —
// localStorage a secas produce hydration mismatch porque el server no lo
// puede leer en el primer render. Solo aplica >= md — en mobile el sidebar
// es un overlay de ancho completo, no una franja icon-only.
const colapsado = useCookie<boolean>('sidebar-colapsado', { default: () => false })

// Drawer en mobile (< md, useLayouts/default.vue lo abre desde el botón de
// hamburguesa en la cabecera): sin esto, el sidebar ocupaba permanentemente
// ~60% de un viewport de 375px sin ningún control para cerrarlo — no había
// ningún breakpoint que lo sacara del flujo normal.
const mobileAbierto = useSidebarMobile()

watch(
  () => route.path,
  () => {
    mobileAbierto.value = false
  },
)

// Grupos colapsados (acordeón) — guarda los TÍTULOS cerrados, no los
// abiertos. Por defecto (primer ingreso, cookie sin fijar) todos arrancan
// cerrados: un usuario nuevo no debe ver la barra lateral entera desplegada
// antes de haber elegido nada.
const gruposCerrados = useCookie<string[]>('sidebar-grupos-cerrados', {
  default: () => NAV_GRUPOS.map((g) => g.titulo),
})

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

/** Nodo de render dentro de un grupo: un ítem real, o un rótulo de sub-sección
 * puramente visual (no acordeón, no agrega clics). Se arma acá y no en
 * `navegacion.ts` porque depende de qué ítems quedaron visibles tras
 * `puedeVer` — un sub-grupo cuyos ítems se ocultaron todos no debe dejar un
 * rótulo huérfano. */
type NavNodo = { tipo: 'subgrupo'; texto: string } | { tipo: 'item'; item: NavItem }

function armarNodos(items: NavItem[]): NavNodo[] {
  const nodos: NavNodo[] = []
  let subgrupoActual: string | undefined
  for (const item of items) {
    if (item.subgrupo && item.subgrupo !== subgrupoActual) {
      nodos.push({ tipo: 'subgrupo', texto: item.subgrupo })
    }
    subgrupoActual = item.subgrupo
    nodos.push({ tipo: 'item', item })
  }
  return nodos
}

const { gruposPersonalizados } = useMenuPersonalizado()

const gruposVisibles = computed(() =>
  gruposPersonalizados.value
    .map((grupo) => {
      const items = grupo.items.filter((item) => !item.oculto && puedeVer(item))
      return { ...grupo, items, nodos: armarNodos(items) }
    })
    .filter((grupo) => grupo.items.length > 0),
)

function activo(to: string): boolean {
  return route.path === to
}

// Sidebar oscuro fijo (no sigue el tema claro/oscuro de la app, a
// propósito — mismo criterio que el diseño de referencia: el sidebar es
// una franja de marca, no contenido). Un color de ícono por grupo, para
// escanear visualmente la sección sin leer la etiqueta — el ítem activo
// siempre pasa a blanco sobre el pill sólido, sin importar su color de
// grupo (la coloración es solo para el estado inactivo).
const COLOR_ICONO_GRUPO: Record<string, string> = {
  Comunidad: 'text-cyan-400',
  Copropiedad: 'text-teal-400',
  Presupuesto: 'text-violet-400',
  'Facturación y Recaudo': 'text-emerald-400',
  'Cartera y Cobranza': 'text-blue-400',
  Contabilidad: 'text-orange-400',
  Finanzas: 'text-rose-400',
  Fondos: 'text-pink-400',
  Mantenimiento: 'text-lime-400',
  Gobierno: 'text-fuchsia-400',
  Comunicaciones: 'text-sky-400',
  Configuración: 'text-slate-400',
  Seguridad: 'text-amber-400',
}
const COLOR_ICONO_TOP = 'text-cyan-400'
const COLOR_ICONO_PLATAFORMA = 'text-rose-400'
</script>

<template>
  <!-- Backdrop del drawer en mobile — clic afuera cierra, igual que Esc. Solo existe < md;
       >= md el sidebar es una franja fija en el flujo y esto nunca se monta. -->
  <div
    v-if="mobileAbierto"
    class="md:hidden fixed inset-0 z-30 bg-black/50"
    @click="mobileAbierto = false"
  />
  <aside
    class="bg-slate-900 flex flex-col transition-transform duration-200 fixed inset-y-0 left-0 z-40 w-64 md:static md:inset-auto md:z-auto md:shrink-0 md:transition-[width] md:translate-x-0"
    :class="[
      mobileAbierto ? 'translate-x-0' : '-translate-x-full',
      colapsado ? 'md:w-14' : 'md:w-56',
    ]"
    @keydown.esc="mobileAbierto = false"
  >
    <nav class="flex-1 min-h-0 overflow-y-auto py-3 px-2 space-y-4 sidebar-scroll">
      <div class="space-y-0.5">
        <NuxtLink
          v-for="item in [NAV_INICIO, NAV_ASUNTOS, NAV_COPROPIEDADES, NAV_AYUDA]"
          :key="item.to"
          :to="item.to"
          class="relative flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm"
          :class="
            activo(item.to)
              ? 'bg-indigo-600 text-white font-medium'
              : 'text-slate-300 hover:bg-slate-800 hover:text-white'
          "
          :title="colapsado ? etiquetaConContador(item) : undefined"
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
          <!-- Colapsado no cabe un número: un punto dice «hay algo» y el
               número está a un clic. -->
          <span
            v-if="item.to === NAV_ASUNTOS.to && asuntosStore.total > 0 && colapsado"
            class="absolute left-6 top-1 w-1.5 h-1.5 rounded-full bg-amber-400"
            aria-hidden="true"
          />
          <span
            v-else-if="item.to === NAV_ASUNTOS.to && asuntosStore.total > 0"
            class="ml-auto rounded-full bg-amber-500 text-white text-[10px] leading-none px-1.5 py-0.5 font-medium"
          >
            {{ asuntosStore.total }}
          </span>
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
          <template v-for="nodo in grupo.nodos" :key="nodo.tipo === 'item' ? nodo.item.to : `sub-${nodo.texto}`">
            <!-- Rótulo de sub-sección: solo texto, sin ícono ni acordeón propio —
                 no cuenta como clic adicional, y no se pinta en modo colapsado
                 porque ahí no cabe ninguna etiqueta. -->
            <div
              v-if="nodo.tipo === 'subgrupo' && !colapsado"
              class="px-2 pt-2.5 pb-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-500 first:pt-0"
            >
              {{ nodo.texto }}
            </div>
            <NuxtLink
              v-else-if="nodo.tipo === 'item'"
              :to="nodo.item.to"
              class="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px]"
              :class="
                activo(nodo.item.to)
                  ? 'bg-indigo-600 text-white font-medium'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              "
              :title="colapsado ? nodo.item.label : undefined"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="w-4 h-4 shrink-0"
                :class="activo(nodo.item.to) ? 'text-white' : (COLOR_ICONO_GRUPO[grupo.titulo] ?? 'text-slate-400')"
              >
                <path :d="nodo.item.icono" />
              </svg>
              <span v-if="!colapsado" class="truncate">{{ nodo.item.label }}</span>
            </NuxtLink>
          </template>
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

    <!-- Accesos directos: solo cuando el sidebar está expandido -->
    <NavShortcuts v-if="!colapsado" />

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

<style scoped>
.sidebar-scroll {
  scrollbar-width: thin;
  scrollbar-color: rgba(100, 116, 139, 0.3) transparent;
}
.sidebar-scroll::-webkit-scrollbar {
  width: 4px;
}
.sidebar-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.sidebar-scroll::-webkit-scrollbar-thumb {
  background-color: rgba(100, 116, 139, 0.3);
  border-radius: 9999px;
}
.sidebar-scroll::-webkit-scrollbar-thumb:hover {
  background-color: rgba(100, 116, 139, 0.5);
}
</style>
