<script setup lang="ts">
// Barra de "filtros aplicados" — evaluada contra VecindApp/Vecitienda (2026-09-18) y
// generalizada como convención transversal (ver CLAUDE.md, "Panel de filtros reutilizable").
// Deliberadamente separada de UiPanelFiltros: vive pegada al listado, no dentro del drawer, y
// quitar un chip dispara el mismo efecto que "Limpiar todo" sin reabrir el panel. Solo conoce
// `ChipFiltro[]` (clave + etiqueta ya resueltas por generarChips) — no el schema completo.
import type { ChipFiltro } from '~/composables/useFiltros'

withDefaults(defineProps<{ chips: ChipFiltro[]; total?: number }>(), { total: undefined })

const emit = defineEmits<{ quitar: [clave: string]; limpiar: [] }>()
</script>

<template>
  <div
    v-if="chips.length > 0"
    class="flex flex-wrap items-center gap-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 px-3 py-2"
  >
    <span class="flex items-center gap-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-300 shrink-0">
      <UIcon name="i-lucide-filter" class="size-4" />
      Filtros aplicados
      <span v-if="total !== undefined" class="font-normal text-neutral-400">({{ total }} resultados)</span>
    </span>

    <UBadge v-for="chip in chips" :key="chip.clave" color="neutral" variant="subtle" class="gap-1">
      {{ chip.etiqueta }}
      <button
        type="button"
        class="ml-0.5 rounded hover:text-neutral-900 dark:hover:text-neutral-100"
        :aria-label="`Quitar filtro ${chip.etiqueta}`"
        @click="emit('quitar', chip.clave)"
      >
        <UIcon name="i-lucide-x" class="size-3" />
      </button>
    </UBadge>

    <button
      type="button"
      class="ml-auto flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 shrink-0"
      @click="emit('limpiar')"
    >
      <UIcon name="i-lucide-x" class="size-3.5" />
      Limpiar filtros
    </button>
  </div>
</template>
