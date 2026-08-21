<script setup lang="ts">
// "Conceptos" — antes pestaña de /presupuesto, ahora página propia del
// sidebar bajo Estado de cuenta (mismo criterio que /presupuesto/periodos):
// el catálogo alimenta cargos de cuenta corriente y novedades, no solo
// presupuesto. Solo catálogo (lista + editar/archivar/nuevo) — el editor
// de fórmulas AEL completo sigue viviendo en /conceptos/nuevo y
// /conceptos/[id] (ver components/conceptos/ConceptosEditor.vue).
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:create' })
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-xl font-semibold mb-2">Conceptos</h1>
      <p class="text-sm text-gray-500">
        Catálogo de conceptos que originan cargos en cuenta corriente y liquidación.
      </p>
    </div>
    <ConceptosCatalogo />
  </div>
</template>
