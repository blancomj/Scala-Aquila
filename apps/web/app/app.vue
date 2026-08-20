<script setup lang="ts">
// Toda la app es en español — sin esto, componentes de Nuxt UI con textos
// propios (UCalendar: nombres de mes, "Month Picker"...) caían en inglés
// por defecto, la única inconsistencia de idioma en toda la interfaz.
import { es } from '@nuxt/ui/locale'
</script>

<template>
  <UApp :locale="es">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
