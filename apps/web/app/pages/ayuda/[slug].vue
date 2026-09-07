<script setup lang="ts">
import { ARTICULOS_AYUDA } from '~/utils/ayuda-contenido'

definePageMeta({ layout: 'default' })

const route = useRoute()
const articulo = ARTICULOS_AYUDA.find((a) => a.slug === route.params.slug)

if (!articulo) {
  throw createError({ statusCode: 404, statusMessage: 'Artículo de ayuda no encontrado' })
}
</script>

<template>
  <div class="max-w-2xl space-y-6">
    <NuxtLink to="/ayuda" class="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">
      <UIcon name="i-lucide-arrow-left" class="size-4" />
      Ayuda
    </NuxtLink>

    <div>
      <p class="text-xs font-medium text-neutral-500">{{ articulo.modulo }}</p>
      <h1 class="text-xl font-semibold">{{ articulo.titulo }}</h1>
      <p class="mt-1 text-sm text-neutral-500">{{ articulo.resumen }}</p>
    </div>

    <div class="space-y-5">
      <AyudaBloque v-for="(bloque, i) in articulo.bloques" :key="i" :bloque="bloque" />
    </div>
  </div>
</template>
