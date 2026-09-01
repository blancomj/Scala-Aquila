<script setup lang="ts">
const auditoriaStore = useAuditoriaStore()
const estadisticas = computed(() => auditoriaStore.estadisticas)
</script>

<template>
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    <div class="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
      <p class="text-xs text-neutral-500 dark:text-neutral-400 mb-1">Riesgos registrados</p>
      <p class="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
        {{ estadisticas?.totalRiesgos ?? 0 }}
      </p>
    </div>
    <div class="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
      <p class="text-xs text-neutral-500 dark:text-neutral-400 mb-1">Controles definidos</p>
      <p class="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
        {{ estadisticas?.totalControles ?? 0 }}
      </p>
    </div>
    <div class="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
      <p class="text-xs text-neutral-500 dark:text-neutral-400 mb-1">Auditorías activas</p>
      <p class="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
        {{ estadisticas?.totalEngagements ?? 0 }}
      </p>
    </div>
    <div class="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
      <p class="text-xs text-neutral-500 dark:text-neutral-400 mb-1">Hallazgos abiertos</p>
      <p class="text-2xl font-semibold text-warning-600">
        {{ estadisticas?.hallazgosAbiertos ?? 0 }}
      </p>
    </div>
    <div class="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
      <p class="text-xs text-neutral-500 dark:text-neutral-400 mb-1">Hallazgos críticos</p>
      <p class="text-2xl font-semibold text-error-600">
        {{ estadisticas?.hallazgosCriticos ?? 0 }}
      </p>
    </div>
    <div class="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
      <p class="text-xs text-neutral-500 dark:text-neutral-400 mb-1">Acciones vencidas</p>
      <p class="text-2xl font-semibold text-error-600">
        {{ estadisticas?.accionesVencidas ?? 0 }}
      </p>
    </div>
    <div class="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 md:col-span-2 lg:col-span-3">
      <p class="text-xs text-neutral-500 dark:text-neutral-400 mb-1">Riesgo residual global</p>
      <UBadge
        :color="estadisticas?.riesgoResidual === 'ALTO' ? 'error' : estadisticas?.riesgoResidual === 'MEDIO' ? 'warning' : 'success'"
        variant="subtle"
      >
        {{ estadisticas?.riesgoResidual ?? 'BAJO' }}
      </UBadge>
    </div>
  </div>
</template>
