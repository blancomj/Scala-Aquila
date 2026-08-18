<script setup lang="ts">
/**
 * Marcador visible para piezas del dashboard de Cartera sin backend
 * todavía (decisión del usuario, 2026-08-17: "próximamente" visible,
 * nunca datos inventados ni la pieza oculta en silencio).
 */
defineProps<{ titulo: string; descripcion?: string }>()
</script>

<template>
  <div class="flex h-full min-h-32 flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 p-6 text-center dark:border-gray-700">
    <p class="text-sm font-medium text-gray-500">{{ titulo }}</p>
    <p class="mt-1 text-xs text-gray-400">{{ descripcion ?? 'Próximamente' }}</p>
  </div>
</template>
