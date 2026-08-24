<script setup lang="ts">
import type { ResultadoBusqueda } from '~/stores/busqueda'

const props = defineProps<{
  resultado: ResultadoBusqueda
  query: string
  activo: boolean
}>()

const emit = defineEmits<{ navegar: [] }>()

interface Accion {
  label: string
  to: string | null
}

interface ConfigCategoria {
  icono: string
  primaria: (r: ResultadoBusqueda) => Accion
  secundaria?: (r: ResultadoBusqueda) => Accion
}

// Iconos/acciones por categoría (PROMPT_BUSQUEDA_GLOBAL.md §5.1) — el RPC
// solo trae categoria/titulo/subtitulo/inmueble_id, no rutas ni acciones:
// eso es una decisión de presentación, no de datos, y vive aquí. `to: null`
// = sin página real todavía (mismo "Próximamente" que ya usa
// configuracion/index.vue para el mismo gap §8.1 de documentos a nivel
// copropiedad) — no se inventa una ruta que no existe.
const CONFIG: Record<ResultadoBusqueda['categoria'], ConfigCategoria> = {
  tercero: {
    icono: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 8c1.5-4.5 5-6 8-6s6.5 1.5 8 6',
    primaria: () => ({ label: 'Ver ficha', to: '/terceros' }),
  },
  inmueble: {
    icono: 'M4 3h16v18H4zM8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2',
    primaria: (r) => ({ label: 'Ver ficha', to: `/inmuebles/${r.entidadId}` }),
    secundaria: () => ({ label: 'Ver cartera', to: '/estado-cuenta' }),
  },
  documento: {
    icono: 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8ZM14 3v5h5',
    primaria: (r) => ({ label: 'Ver', to: r.inmuebleId ? `/inmuebles/${r.inmuebleId}` : null }),
  },
  novedad: {
    icono: 'M12 9v4m0 4h.01M10.3 3.86 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.86a2 2 0 0 0-3.4 0Z',
    primaria: (r) => ({
      label: 'Ver ficha del inmueble',
      to: r.inmuebleId ? `/inmuebles/${r.inmuebleId}` : null,
    }),
  },
  concepto: {
    icono: 'M4 4h8l8 8-8 8-8-8V4Z M7 7h.01',
    primaria: (r) => ({ label: 'Ver concepto', to: `/conceptos/${r.entidadId}` }),
  },
  cuenta_presupuestal: {
    icono: 'M4 6h16M4 12h10M4 18h7',
    primaria: () => ({ label: 'Ver en Plan de cuentas', to: '/presupuesto' }),
  },
  caso_juridico: {
    icono: 'M4 8h16v11H4zM9 8V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2',
    primaria: (r) => ({
      label: r.inmuebleId ? 'Ver ficha del inmueble' : 'Ver cartera',
      to: r.inmuebleId ? `/inmuebles/${r.inmuebleId}` : '/cartera',
    }),
  },
  agrupacion: {
    icono: 'M4 21V9l8-6 8 6v12M9 21v-6h6v6',
    primaria: () => ({ label: 'Ver agrupaciones', to: '/configuracion/agrupaciones' }),
  },
  zona_comun: {
    icono: 'M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7ZM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
    primaria: () => ({ label: 'Ver zonas comunes', to: '/configuracion/zonas-comunes' }),
  },
}

const config = computed(() => CONFIG[props.resultado.categoria])
const primaria = computed(() => config.value.primaria(props.resultado))
const secundaria = computed(() => config.value.secundaria?.(props.resultado))

/** Segmentos texto/resaltado — sin v-html: titulo/subtitulo vienen de datos
 * de tenant (nombre, código...), no se interpolan como HTML. */
function segmentos(texto: string, query: string): { texto: string; marcado: boolean }[] {
  const q = query.trim()
  if (!q) return [{ texto, marcado: false }]
  const escapada = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const partes = texto.split(new RegExp(`(${escapada})`, 'i'))
  return partes.filter((p) => p.length > 0).map((p) => ({ texto: p, marcado: p.toLowerCase() === q.toLowerCase() }))
}

const tituloSegmentos = computed(() => segmentos(props.resultado.titulo, props.query))
</script>

<template>
  <div
    class="flex items-start gap-3 px-4 py-2.5 cursor-pointer border-b border-gray-100 dark:border-gray-900 last:border-b-0"
    :class="activo ? 'bg-primary-50 dark:bg-primary-950' : 'hover:bg-gray-50 dark:hover:bg-gray-900'"
    @click="emit('navegar')"
  >
    <div
      class="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 flex items-center justify-center shrink-0"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" class="w-4 h-4">
        <path :d="config.icono" />
      </svg>
    </div>
    <div class="min-w-0 flex-1">
      <p class="text-sm font-medium truncate">
        <template v-for="(s, i) in tituloSegmentos" :key="i">
          <mark v-if="s.marcado" class="bg-amber-100 dark:bg-amber-900 text-inherit rounded-sm px-0.5">{{
            s.texto
          }}</mark>
          <template v-else>{{ s.texto }}</template>
        </template>
      </p>
      <p class="text-xs text-gray-500 truncate mt-0.5">{{ resultado.subtitulo }}</p>
      <div class="flex gap-3 mt-1">
        <NuxtLink
          v-if="primaria.to"
          :to="primaria.to"
          class="text-xs text-primary-600 dark:text-primary-400 hover:underline"
          @click.stop
        >
          {{ primaria.label }}
        </NuxtLink>
        <span v-else class="text-xs text-gray-400" :title="`${primaria.label} — próximamente`">
          {{ primaria.label }}
        </span>
        <NuxtLink
          v-if="secundaria?.to"
          :to="secundaria.to"
          class="text-xs text-primary-600 dark:text-primary-400 hover:underline"
          @click.stop
        >
          {{ secundaria.label }}
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
