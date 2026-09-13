<script setup lang="ts">
import type { CategoriaBusqueda } from '~/stores/busqueda'

const busquedaStore = useBusquedaStore()
const tenantStore = useTenantStore()
const router = useRouter()

const query = ref('')
const categoriaSeleccionada = ref<CategoriaBusqueda | 'todos'>('todos')
const expandido = ref(false)
const indiceActivo = ref(-1)
const inputRef = ref<HTMLInputElement | null>(null)
const contenedorRef = ref<HTMLElement | null>(null)

const mostrarAccesos = computed(() => expandido.value && query.value.trim().length === 0)
const mostrarPanel = computed(() => expandido.value && (mostrarAccesos.value || query.value.trim().length > 0))

let debounceId: ReturnType<typeof setTimeout> | undefined

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

function alPerderFoco(evento: FocusEvent): void {
  const siguiente = evento.relatedTarget as Node | null
  if (siguiente && contenedorRef.value?.contains(siguiente)) return
  expandido.value = false
}

function navegar(ruta: string): void {
  expandido.value = false
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
    concepto: `/conceptos/${resultado.entidadId}`,
    cuenta_presupuestal: '/presupuesto',
    caso_juridico: resultado.inmuebleId ? `/inmuebles/${resultado.inmuebleId}` : '/cartera',
    agrupacion: '/configuracion/agrupaciones',
    zona_comun: '/configuracion/zonas-comunes',
    riesgo: '/auditoria',
    control: '/auditoria',
    hallazgo: '/auditoria',
    evidencia: '/auditoria',
    anuncio: `/anuncios/${resultado.entidadId}`,
    vehiculo: `/movilidad?vehiculo=${resultado.entidadId}`,
    organo_gobierno: '/gobierno/organos',
    reunion_gobierno: `/gobierno/reuniones/${resultado.entidadId}`,
    decision_gobierno: `/gobierno/decisiones/${resultado.entidadId}`,
    orden_trabajo: `/mantenimiento/ordenes-trabajo/${resultado.entidadId}`,
    hallazgo_mantenimiento: '/mantenimiento/inspecciones',
    accion_cobranza: resultado.inmuebleId ? `/inmuebles/${resultado.inmuebleId}` : '/cartera/acciones',
    solicitud: `/atencion/${resultado.entidadId}`,
  }
  const ruta = rutas[resultado.categoria]
  if (ruta) navegar(ruta)
}

function onEscape(): void {
  expandido.value = false
  inputRef.value?.blur()
}

function onAtajoGlobal(evento: KeyboardEvent): void {
  const esCtrlK = (evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === 'k'
  if (!esCtrlK) return
  evento.preventDefault()
  if (expandido.value) {
    inputRef.value?.focus()
  } else {
    expandido.value = true
    nextTick(() => inputRef.value?.focus())
  }
}

function alEntrarMouse(): void {
  if (!expandido.value) expandido.value = true
}

function alSalirMouse(): void {
  if (query.value.trim()) return
  if (document.activeElement === inputRef.value) return
  expandido.value = false
}

function alClickIcono(): void {
  if (expandido.value) {
    inputRef.value?.focus()
  } else {
    expandido.value = true
    nextTick(() => inputRef.value?.focus())
  }
}

onMounted(() => window.addEventListener('keydown', onAtajoGlobal))
onUnmounted(() => {
  window.removeEventListener('keydown', onAtajoGlobal)
  if (debounceId) clearTimeout(debounceId)
})
</script>

<template>
  <div
    ref="contenedorRef"
    class="relative flex-1 max-w-xl"
    @focusout="alPerderFoco"
    @mouseenter="alEntrarMouse"
    @mouseleave="alSalirMouse"
  >
    <div class="flex items-center">
      <!-- Lupa DENTRO de la pill, animada junto con el borde -->
      <div
        class="flex items-center rounded-full border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 transition-all duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)] overflow-hidden focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-100 dark:focus-within:ring-primary-900 focus-within:bg-white dark:focus-within:bg-gray-900"
        :class="expandido ? 'w-full' : 'w-9'"
      >
        <!-- Lupa: siempre visible, dentro del borde de la pill -->
        <button
          type="button"
          class="flex items-center justify-center size-9 shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          @click="alClickIcono"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" class="w-4 h-4">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
        </button>

        <!-- Contenido: aparece cuando expandido -->
        <div class="flex items-center gap-2 min-w-0 pr-1.5 whitespace-nowrap" :class="expandido ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'">
          <input
            ref="inputRef"
            v-model="query"
            type="text"
            placeholder="Buscar inmuebles, terceros, documentos…"
            class="flex-1 min-w-0 w-56 bg-transparent outline-none text-sm placeholder:text-gray-400"
            @input="onInput"
            @keydown.down.prevent="onArrow(1)"
            @keydown.up.prevent="onArrow(-1)"
            @keydown.enter.prevent="onEnter"
            @keydown.esc="onEscape"
          >
          <span v-if="!query" class="text-[10.5px] font-mono text-gray-400 border border-gray-300 dark:border-gray-700 rounded px-1.5 py-0.5 shrink-0 whitespace-nowrap">
            Ctrl K
          </span>
          <button
            v-else
            type="button"
            class="text-xs text-primary-600 dark:text-primary-400 shrink-0 px-1 whitespace-nowrap"
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
            <option value="concepto">Conceptos</option>
            <option value="cuenta_presupuestal">Cuentas presupuestales</option>
            <option value="caso_juridico">Casos jurídicos</option>
            <option value="agrupacion">Agrupaciones</option>
            <option value="zona_comun">Zonas comunes</option>
            <option value="riesgo">Riesgos (auditoría)</option>
            <option value="control">Controles (auditoría)</option>
            <option value="hallazgo">Hallazgos (auditoría)</option>
            <option value="evidencia">Evidencias (auditoría)</option>
            <option value="anuncio">Anuncios</option>
            <option value="vehiculo">Vehículos</option>
            <option value="organo_gobierno">Órganos de gobierno</option>
            <option value="reunion_gobierno">Reuniones</option>
            <option value="decision_gobierno">Decisiones</option>
            <option value="orden_trabajo">Órdenes de trabajo</option>
            <option value="hallazgo_mantenimiento">Hallazgos (mantenimiento)</option>
            <option value="accion_cobranza">Acciones de cobranza</option>
            <option value="solicitud">Solicitudes (PQR)</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Panel de resultados: fuera del overflow, posicionado absoluto -->
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
