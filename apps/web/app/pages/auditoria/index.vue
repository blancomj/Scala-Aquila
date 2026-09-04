<script setup lang="ts">
definePageMeta({
  layout: 'default',
  middleware: ['tenant', 'rbac'],
  permiso: 'audit:view',
})

const tenantStore = useTenantStore()
const auditoriaStore = useAuditoriaStore()

const pestanaActiva = ref<'resumen' | 'trazabilidad' | 'riesgos' | 'controles' | 'engagements' | 'pruebas' | 'hallazgos' | 'acciones' | 'mi-panel' | 'plan-anual' | 'normativa'>('resumen')

const PESTANAS = [
  { value: 'resumen', label: 'Resumen' },
  { value: 'trazabilidad', label: 'Trazabilidad' },
  { value: 'riesgos', label: 'Riesgos' },
  { value: 'controles', label: 'Controles' },
  { value: 'engagements', label: 'Auditorías' },
  { value: 'pruebas', label: 'Pruebas' },
  { value: 'hallazgos', label: 'Hallazgos' },
  { value: 'acciones', label: 'Acciones' },
  { value: 'plan-anual', label: 'Plan anual' },
  { value: 'normativa', label: 'Normativa' },
  { value: 'mi-panel', label: 'Mi panel' },
]

await useAsyncData('auditoria-carga', async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await Promise.all([
    auditoriaStore.cargarRiesgos(tenantId),
    auditoriaStore.cargarControles(tenantId),
    auditoriaStore.cargarEngagements(tenantId),
    auditoriaStore.cargarHallazgos(tenantId),
    auditoriaStore.cargarAcciones(tenantId),
    auditoriaStore.cargarPlanes(tenantId),
  ])
})
</script>

<template>
  <div class="space-y-6">
    <UiTituloDescripcion>
      <template #titulo>
        <h1 class="text-xl font-semibold">Auditoría interna</h1>
      </template>
      <template #descripcion>
        Gestión integral de riesgos, controles y auditorías operativas.
        Identifica, evalúa y sigue hallazgos para mejorar la gobernanza.
      </template>
    </UiTituloDescripcion>

    <UTabs
      :items="PESTANAS"
      :model-value="pestanaActiva"
      variant="link"
      :content="false"
      class="w-full"
      @update:model-value="(v) => (pestanaActiva = v as typeof pestanaActiva)"
    />

    <AuditoriaAuditDashboard v-if="pestanaActiva === 'resumen'" />
    <AuditoriaMatrizTrazabilidad v-if="pestanaActiva === 'trazabilidad'" />
    <AuditoriaRiskMatrix v-if="pestanaActiva === 'riesgos'" />
    <AuditoriaControlMatrix v-if="pestanaActiva === 'controles'" />
    <AuditoriaAuditPlan v-if="pestanaActiva === 'engagements'" />
    <AuditoriaPapelTrabajo v-if="pestanaActiva === 'pruebas'" />
    <AuditoriaFindingPanel v-if="pestanaActiva === 'hallazgos'" />
    <AuditoriaActionPlan v-if="pestanaActiva === 'acciones'" />
    <AuditoriaPlanAnual v-if="pestanaActiva === 'plan-anual'" />
    <AuditoriaNormativaCumplimiento v-if="pestanaActiva === 'normativa'" />
    <AuditoriaPerfilAuditor v-if="pestanaActiva === 'mi-panel'" />
  </div>
</template>
