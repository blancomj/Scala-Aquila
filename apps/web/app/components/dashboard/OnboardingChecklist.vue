<script setup lang="ts">
// Checklist de configuración inicial — reemplaza el "desierto" que
// describía el auditor (formulario de 2 campos → dashboard genérico → 22
// rutas vacías sin orden sugerido). Se muestra completo mientras falte
// algún paso; una vez completo colapsa a una línea mínima (no desaparece
// del todo — un admin que vuelve a mirar el dashboard un mes después
// todavía puede confirmar que su configuración está al día).
const onboardingStore = useOnboardingStore()
</script>

<template>
  <div
    v-if="onboardingStore.todoCompleto"
    class="flex items-center gap-2 text-sm text-success rounded-md border border-success/20 bg-success/5 px-3 py-2"
  >
    <UIcon name="i-lucide-check-circle-2" class="size-4 shrink-0" />
    Configuración inicial completa.
  </div>

  <div v-else-if="onboardingStore.cargado" class="rounded-md border border-neutral-200 dark:border-neutral-800">
    <div class="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
      <div>
        <h2 class="font-semibold">Primeros pasos</h2>
        <p class="text-sm text-neutral-500">
          Configura tu copropiedad en este orden para poder liquidar el primer periodo.
        </p>
      </div>
      <span class="text-sm text-neutral-500 shrink-0">
        {{ onboardingStore.completos }} de {{ onboardingStore.pasos.length }}
      </span>
    </div>
    <ul class="divide-y divide-neutral-200 dark:divide-neutral-800">
      <li
        v-for="(paso, indice) in onboardingStore.pasos"
        :key="paso.clave"
        class="flex items-center gap-3 px-4 py-3"
      >
        <span
          class="flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium"
          :class="paso.completado ? 'bg-success/15 text-success' : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800'"
        >
          <UIcon v-if="paso.completado" name="i-lucide-check" class="size-3.5" />
          <template v-else>{{ indice + 1 }}</template>
        </span>
        <div class="flex-1 min-w-0">
          <p class="font-medium" :class="paso.completado ? 'text-neutral-400 dark:text-neutral-500' : ''">
            {{ paso.etiqueta }}
          </p>
          <p class="text-sm text-neutral-500">{{ paso.descripcion }}</p>
        </div>
        <UButton
          v-if="!paso.completado"
          size="sm"
          variant="soft"
          :to="paso.ruta"
        >
          Ir
        </UButton>
      </li>
    </ul>
  </div>
</template>
