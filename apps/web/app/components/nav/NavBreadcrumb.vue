<script setup lang="ts">
import { buscarMigaPan } from '~/utils/navegacion'

const route = useRoute()
const tenantStore = useTenantStore()

// Primer nivel = nombre de la copropiedad activa (no la marca — la marca ya
// está a la izquierda del header). Sin miga de pan disponible (rutas fuera
// de NAV_GRUPOS, p. ej. /inmuebles/[id]/nuevo si llegara a existir) se
// muestra solo el primer nivel.
const miga = computed(() => buscarMigaPan(route.path))
</script>

<template>
  <nav class="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 min-w-0">
    <span class="truncate">{{ tenantStore.activeTenant?.name ?? 'Aquila PH' }}</span>
    <template v-if="miga?.grupo">
      <span class="text-gray-300 dark:text-gray-700">/</span>
      <span class="truncate">{{ miga.grupo }}</span>
    </template>
    <template v-if="miga">
      <span class="text-gray-300 dark:text-gray-700">/</span>
      <span class="text-gray-900 dark:text-gray-100 font-medium truncate">{{ miga.item.label }}</span>
    </template>
  </nav>
</template>
