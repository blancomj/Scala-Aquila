<script setup lang="ts">
import type { BloqueAyuda } from '~/types/ayuda'

defineProps<{ bloque: BloqueAyuda }>()
</script>

<template>
  <div v-if="bloque.tipo === 'texto'" class="space-y-2">
    <p v-for="(parrafo, i) in bloque.parrafos" :key="i" class="text-sm text-neutral-700 dark:text-neutral-300">
      {{ parrafo }}
    </p>
  </div>

  <ol
    v-else-if="bloque.tipo === 'pasos'"
    class="list-decimal list-inside space-y-1.5 text-sm text-neutral-700 dark:text-neutral-300"
  >
    <li v-for="(item, i) in bloque.items" :key="i">{{ item }}</li>
  </ol>

  <UAlert
    v-else-if="bloque.tipo === 'aviso'"
    color="warning"
    variant="soft"
    icon="i-lucide-info"
    :description="bloque.texto"
  />

  <UAccordion
    v-else-if="bloque.tipo === 'preguntas'"
    :items="bloque.items.map((p) => ({ label: p.pregunta, content: p.respuesta }))"
  />
</template>
