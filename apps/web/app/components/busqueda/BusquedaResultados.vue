<script setup lang="ts">
import type { CategoriaBusqueda, ResultadoBusqueda } from '~/stores/busqueda'

const props = defineProps<{
  resultados: ResultadoBusqueda[]
  query: string
  cargando: boolean
  mostrarAccesos: boolean
  indiceActivo: number
}>()

const emit = defineEmits<{ navegar: [ruta: string] }>()

const ETIQUETA_CATEGORIA: Record<CategoriaBusqueda, string> = {
  tercero: 'Terceros',
  inmueble: 'Inmuebles',
  documento: 'Documentos',
  novedad: 'Novedades',
  concepto: 'Conceptos',
  cuenta_presupuestal: 'Cuentas presupuestales',
  caso_juridico: 'Casos jurídicos',
  agrupacion: 'Agrupaciones',
  zona_comun: 'Zonas comunes',
}

// Orden fijo (no el de aparición) — mismo orden que el selector de
// categoría del prompt §1.1.
const ORDEN_CATEGORIAS: CategoriaBusqueda[] = [
  'tercero',
  'inmueble',
  'documento',
  'novedad',
  'concepto',
  'cuenta_presupuestal',
  'caso_juridico',
  'agrupacion',
  'zona_comun',
]

const grupos = computed(() => {
  const porCategoria = new Map<CategoriaBusqueda, { resultado: ResultadoBusqueda; indice: number }[]>()
  props.resultados.forEach((resultado, indice) => {
    const lista = porCategoria.get(resultado.categoria) ?? []
    lista.push({ resultado, indice })
    porCategoria.set(resultado.categoria, lista)
  })
  return ORDEN_CATEGORIAS.map((categoria) => ({ categoria, filas: porCategoria.get(categoria) ?? [] })).filter(
    (g) => g.filas.length > 0,
  )
})

const numCategorias = computed(() => grupos.value.length)

function irA(resultado: ResultadoBusqueda): void {
  const primaria: Record<CategoriaBusqueda, string | null> = {
    tercero: '/terceros',
    inmueble: `/inmuebles/${resultado.entidadId}`,
    documento: resultado.inmuebleId ? `/inmuebles/${resultado.inmuebleId}` : null,
    novedad: resultado.inmuebleId ? `/inmuebles/${resultado.inmuebleId}` : null,
    concepto: `/conceptos/${resultado.entidadId}`,
    cuenta_presupuestal: '/presupuesto',
    caso_juridico: resultado.inmuebleId ? `/inmuebles/${resultado.inmuebleId}` : '/cartera',
    agrupacion: '/configuracion/agrupaciones',
    zona_comun: '/configuracion/zonas-comunes',
  }
  const ruta = primaria[resultado.categoria]
  if (ruta) emit('navegar', ruta)
}

const accesosRapidos = [
  { label: 'Nuevo inmueble', to: '/inmuebles' },
  { label: 'Nuevo tercero', to: '/terceros' },
]
</script>

<template>
  <div
    class="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-xl max-h-[70vh] overflow-y-auto z-40"
  >
    <div v-if="mostrarAccesos" class="p-3">
      <p class="text-[11px] uppercase tracking-wide text-gray-400 font-mono px-1 mb-1">Accesos rápidos</p>
      <NuxtLink
        v-for="acceso in accesosRapidos"
        :key="acceso.to"
        :to="acceso.to"
        class="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" class="w-3.5 h-3.5 text-gray-400">
          <path d="M12 5v14M5 12h14" />
        </svg>
        {{ acceso.label }}
      </NuxtLink>
    </div>

    <div v-else-if="cargando" class="px-4 py-6 text-sm text-gray-400 text-center">Buscando…</div>

    <div v-else-if="resultados.length === 0" class="px-4 py-6 text-sm text-gray-400 text-center">
      Sin resultados para "{{ query }}".
    </div>

    <template v-else>
      <div v-for="grupo in grupos" :key="grupo.categoria">
        <p class="text-[10.5px] uppercase tracking-wide text-gray-400 font-mono px-4 pt-2.5 pb-1">
          {{ ETIQUETA_CATEGORIA[grupo.categoria] }}
        </p>
        <BusquedaResultadoFila
          v-for="fila in grupo.filas"
          :key="`${fila.resultado.categoria}-${fila.resultado.entidadId}`"
          :resultado="fila.resultado"
          :query="query"
          :activo="fila.indice === indiceActivo"
          @navegar="irA(fila.resultado)"
        />
      </div>
      <div class="px-4 py-2 border-t border-gray-100 dark:border-gray-900 flex justify-between items-center text-[11.5px] text-gray-400">
        <span>{{ resultados.length }} resultados en {{ numCategorias }} categorías</span>
        <span><kbd class="border border-gray-300 dark:border-gray-700 rounded px-1">↑↓</kbd> navegar · <kbd class="border border-gray-300 dark:border-gray-700 rounded px-1">↵</kbd> abrir</span>
      </div>
    </template>
  </div>
</template>
