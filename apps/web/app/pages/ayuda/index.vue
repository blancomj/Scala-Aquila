<script setup lang="ts">
import { ARTICULOS_AYUDA } from '~/utils/ayuda-contenido'

definePageMeta({ layout: 'default' })

const RANGO_DIACRITICOS = new RegExp('[̀-ͯ]', 'g')

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(RANGO_DIACRITICOS, '').toLowerCase()
}

const busqueda = ref('')

const articulosFiltrados = computed(() => {
  const q = normalizar(busqueda.value.trim())
  if (!q) return ARTICULOS_AYUDA
  return ARTICULOS_AYUDA.filter((a) =>
    [a.titulo, a.resumen, ...a.tags].some((texto) => normalizar(texto).includes(q)),
  )
})

const grupos = computed(() => {
  const porModulo = new Map<string, typeof ARTICULOS_AYUDA>()
  for (const articulo of articulosFiltrados.value) {
    const lista = porModulo.get(articulo.modulo) ?? []
    lista.push(articulo)
    porModulo.set(articulo.modulo, lista)
  }
  return [...porModulo.entries()].map(([modulo, articulos]) => ({ modulo, articulos }))
})
</script>

<template>
  <div class="space-y-6">
    <UiTituloDescripcion>
      <template #titulo>
        <h1 class="text-xl font-semibold">Ayuda</h1>
      </template>
      <template #descripcion>
        Guías paso a paso sobre cómo funciona cada módulo de Aquila.
      </template>
    </UiTituloDescripcion>

    <UInput
      v-model="busqueda"
      icon="i-lucide-search"
      placeholder="Buscar en la ayuda…"
      class="max-w-sm"
    />

    <div v-if="grupos.length === 0" class="text-sm text-neutral-400">Sin resultados.</div>

    <div v-for="grupo in grupos" :key="grupo.modulo" class="space-y-3">
      <h2 class="text-sm font-medium text-neutral-500">{{ grupo.modulo }}</h2>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <NuxtLink
          v-for="articulo in grupo.articulos"
          :key="articulo.slug"
          :to="`/ayuda/${articulo.slug}`"
          class="flex flex-col gap-1.5 rounded-md border border-neutral-200 p-4 hover:border-neutral-300 dark:border-neutral-800 dark:hover:border-neutral-700"
        >
          <p class="text-sm font-medium">{{ articulo.titulo }}</p>
          <p class="text-xs text-neutral-500">{{ articulo.resumen }}</p>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
