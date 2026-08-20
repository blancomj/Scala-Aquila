<script setup lang="ts">
// Coeficientes de copropiedad — wrapper delgado de CoeficientesPanel.vue,
// extraído para reutilizarse también en la pestaña "Distribución por
// unidad" de Presupuesto (PLAN aprobado, E5). El panel es autocontenido
// (carga sus propios datos), esta página solo aporta el permiso/layout.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'settings:manage' })
</script>

<template>
  <div>
    <h1 class="text-xl font-semibold mb-2">Coeficientes de copropiedad</h1>
    <CoeficientesPanel />
  </div>
</template>
