<script setup lang="ts">
// EXT-05 §6.4 — fila genérica de "Mis asuntos" (título + contexto + etiqueta de estado). Sin
// acción propia por ahora: se usa dentro de una lista de solo lectura (solicitudes recientes);
// si un asunto necesita ser accionable (p. ej. abrir su detalle), el contenedor lo envuelve en un
// NuxtLink — este componente no asume navegación.
withDefaults(
  defineProps<{
    titulo: string
    contexto?: string | null
    etiqueta?: string | null
    etiquetaTono?: 'neutral' | 'atencion' | 'exito'
  }>(),
  { contexto: null, etiqueta: null, etiquetaTono: 'neutral' },
)
</script>

<template>
  <div class="flex items-center justify-between gap-3 py-2.5">
    <div class="min-w-0">
      <p class="truncate text-sm font-medium text-gray-900 dark:text-white">{{ titulo }}</p>
      <p v-if="contexto" class="truncate text-xs text-gray-500 dark:text-gray-400">{{ contexto }}</p>
    </div>
    <span
      v-if="etiqueta"
      class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
      :class="{
        'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300': etiquetaTono === 'neutral',
        'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400': etiquetaTono === 'atencion',
        'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400': etiquetaTono === 'exito',
      }"
    >{{ etiqueta }}</span>
  </div>
</template>
