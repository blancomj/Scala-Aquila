<script setup lang="ts">
// CO-1 §4.5: banner reutilizable — esta misma pantalla lo muestra en
// /contabilidad/configuracion y CO-5 lo va a mostrar también antes de emitir
// estados financieros. Un solo lugar que dice "sin clasificación no se puede
// emitir información contable", en vez de que cada pantalla repita el texto.
withDefaults(defineProps<{ clasificado: boolean; mostrarEnlace?: boolean }>(), {
  mostrarEnlace: true,
})
</script>

<template>
  <UAlert
    v-if="!clasificado"
    color="warning"
    variant="soft"
    icon="i-lucide-triangle-alert"
    title="Copropiedad sin clasificar"
  >
    <template #description>
      <p class="text-xs">
        Sin marco de información financiera (Grupo 2/3) ni uso económico clasificados no pueden
        emitirse estados financieros.
        <NuxtLink
          v-if="mostrarEnlace"
          to="/contabilidad/configuracion"
          class="font-medium underline"
        >
          Clasificar copropiedad
        </NuxtLink>
      </p>
    </template>
  </UAlert>
</template>
