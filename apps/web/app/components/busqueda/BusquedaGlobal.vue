<script setup lang="ts">
import type { CategoriaBusqueda } from '~/stores/busqueda'

const busquedaStore = useBusquedaStore()
const tenantStore = useTenantStore()
const router = useRouter()

const query = ref('')
const categoriaSeleccionada = ref<CategoriaBusqueda | 'todos'>('todos')
const abierto = ref(false)
const indiceActivo = ref(-1)
const inputRef = ref<HTMLInputElement | null>(null)
const contenedorRef = ref<HTMLElement | null>(null)

const mostrarAccesos = computed(() => abierto.value && query.value.trim().length === 0)
const mostrarPanel = computed(() => abierto.value && (mostrarAccesos.value || query.value.trim().length > 0))

let debounceId: ReturnType<typeof setTimeout> | undefined

// Debounce vive aquí, no en el store (§6.3 del prompt: "el store no sabe
// de tiempo, solo de datos"). Cambio de categoría con texto ya escrito =
// re-consulta inmediata, sin esperar el debounce (§7).
function onInput(): void {
  indiceActivo.value = -1
  if (debounceId) clearTimeout(debounceId)
  const texto = query.value.trim()
  if (!texto) {
    busquedaStore.limpiar()
    return
  }
  debounceId = setTimeout(ejecutarBusqueda, 300)
}

function onCambioCategoria(): void {
  indiceActivo.value = -1
  if (query.value.trim()) ejecutarBusqueda()
}

async function ejecutarBusqueda(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  const categoria = categoriaSeleccionada.value === 'todos' ? null : categoriaSeleccionada.value
  await busquedaStore.buscar(tenantId, query.value, categoria)
}

function limpiar(): void {
  query.value = ''
  indiceActivo.value = -1
  busquedaStore.limpiar()
  inputRef.value?.focus()
}

function alEnfocar(): void {
  abierto.value = true
}

function alPerderFoco(evento: FocusEvent): void {
  // Si el foco se mueve DENTRO del propio contenedor (un link del panel),
  // no cerrar — solo cerrar cuando realmente sale del componente.
  const siguiente = evento.relatedTarget as Node | null
  if (siguiente && contenedorRef.value?.contains(siguiente)) return
  abierto.value = false
}

function navegar(ruta: string): void {
  abierto.value = false
  router.push(ruta)
}

function onArrow(direccion: 1 | -1): void {
  const total = busquedaStore.resultados.length
  if (total === 0) return
  const siguiente = indiceActivo.value + direccion
  indiceActivo.value = ((siguiente % total) + total) % total
}

function onEnter(): void {
  if (indiceActivo.value < 0) return
  const resultado = busquedaStore.resultados[indiceActivo.value]
  if (!resultado) return
  const rutas: Record<CategoriaBusqueda, string | null> = {
    tercero: '/terceros',
    inmueble: `/inmuebles/${resultado.entidadId}`,
    documento: resultado.inmuebleId ? `/inmuebles/${resultado.inmuebleId}` : null,
    novedad: resultado.inmuebleId ? `/inmuebles/${resultado.inmuebleId}` : null,
  }
  const ruta = rutas[resultado.categoria]
  if (ruta) navegar(ruta)
}

function onEscape(): void {
  abierto.value = false
  inputRef.value?.blur()
}

function onAtajoGlobal(evento: KeyboardEvent): void {
  const esCtrlK = (evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === 'k'
  if (!esCtrlK) return
  evento.preventDefault()
  inputRef.value?.focus()
}

onMounted(() => window.addEventListener('keydown', onAtajoGlobal))
onUnmounted(() => {
  window.removeEventListener('keydown', onAtajoGlobal)
  if (debounceId) clearTimeout(debounceId)
})
</script>

<template>
  <div ref="contenedorRef" class="relative flex-1 max-w-xl" @focusout="alPerderFoco">
    <div
      class="flex items-center gap-2 rounded-full border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 pl-3.5 pr-1.5 py-1.5 focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-100 dark:focus-within:ring-primary-900 focus-within:bg-white dark:focus-within:bg-gray-900"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" class="w-4 h-4 text-gray-400 shrink-0">
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.3-4.3" />
      </svg>
      <input
        ref="inputRef"
        v-model="query"
        type="text"
        placeholder="Buscar inmuebles, terceros, documentos…"
        class="flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-gray-400"
        @input="onInput"
        @focus="alEnfocar"
        @keydown.down.prevent="onArrow(1)"
        @keydown.up.prevent="onArrow(-1)"
        @keydown.enter.prevent="onEnter"
        @keydown.esc="onEscape"
      >
      <span v-if="!query" class="text-[10.5px] font-mono text-gray-400 border border-gray-300 dark:border-gray-700 rounded px-1.5 py-0.5 shrink-0">
        Ctrl K
      </span>
      <button
        v-else
        type="button"
        class="text-xs text-primary-600 dark:text-primary-400 shrink-0 px-1"
        @click="limpiar"
      >
        Limpiar
      </button>
      <select
        v-model="categoriaSeleccionada"
        class="text-xs bg-white dark:bg-gray-900 border-l border-gray-300 dark:border-gray-700 pl-2 pr-1 py-1 text-gray-500 outline-none shrink-0"
        @change="onCambioCategoria"
      >
        <option value="todos">Todas las categorías</option>
        <option value="tercero">Terceros</option>
        <option value="inmueble">Inmuebles</option>
        <option value="documento">Documentos</option>
        <option value="novedad">Novedades</option>
      </select>
    </div>

    <BusquedaResultados
      v-if="mostrarPanel"
      :resultados="busquedaStore.resultados"
      :query="query"
      :cargando="busquedaStore.buscando"
      :mostrar-accesos="mostrarAccesos"
      :indice-activo="indiceActivo"
      @navegar="navegar"
    />
  </div>
</template>
