<script setup lang="ts">
definePageMeta({
  layout: 'default',
  middleware: ['tenant', 'rbac'],
  permiso: 'audit:view',
})

const tenantStore = useTenantStore()
const auditoriaStore = useAuditoriaStore()

const pestanaActiva = ref<'resumen' | 'riesgos' | 'controles' | 'engagements' | 'hallazgos' | 'acciones'>('resumen')

const PESTANAS = [
  { value: 'resumen', label: 'Resumen' },
  { value: 'riesgos', label: 'Riesgos' },
  { value: 'controles', label: 'Controles' },
  { value: 'engagements', label: 'Auditorías' },
  { value: 'hallazgos', label: 'Hallazgos' },
  { value: 'acciones', label: 'Acciones' },
] as const

await useAsyncData('auditoria-carga', async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await Promise.all([
    auditoriaStore.cargarRiesgos(tenantId),
    auditoriaStore.cargarControles(tenantId),
    auditoriaStore.cargarEngagements(tenantId),
    auditoriaStore.cargarHallazgos(tenantId),
    auditoriaStore.cargarAcciones(tenantId),
  ])
})
</script>

<template>
  <div class="space-y-6">
    <UiTituloDescripcion>
      <template #titulo>Auditoría interna</template>
      <template #descripcion>
        Gestión integral de riesgos, controles y auditorías operativas.
        Identifica, evalúa y sigue hallazgos para mejorar la gobernanza.
      </template>
    </UiTituloDescripcion>

    <AuditoriaAuditDashboard v-if="pestanaActiva === 'resumen'" />

    <div class="border-b border-neutral-200 dark:border-neutral-800">
      <nav class="-mb-px flex space-x-4 overflow-x-auto">
        <button
          v-for="pestana in PESTANAS"
          :key="pestana.value"
          type="button"
          class="whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors"
          :class="pestanaActiva === pestana.value
            ? 'border-primary-600 text-primary-600'
            : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300 dark:text-neutral-400 dark:hover:text-neutral-300'"
          @click="pestanaActiva = pestana.value"
        >
          {{ pestana.label }}
        </button>
      </nav>
    </div>

    <AuditoriaRiskMatrix v-if="pestanaActiva === 'riesgos'" />
    <AuditoriaControlMatrix v-if="pestanaActiva === 'controles'" />
    <AuditoriaAuditPlan v-if="pestanaActiva === 'engagements'" />
    <AuditoriaFindingPanel v-if="pestanaActiva === 'hallazgos'" />
    <AuditoriaActionPlan v-if="pestanaActiva === 'acciones'" />
  </div>
</template>
