<script setup lang="ts">
// Detalle de una novedad — wrapper delgado de NovedadesEditor.vue. No es
// edición: `novedades` no tiene política RLS de UPDATE para `authenticated`,
// así que una vez creada solo cambia de estado (aprobar/rechazar/inhabilitar,
// vía Edge Function). Aquí se ven todos sus campos —los que la tabla dejó de
// mostrar al bajar de 11 a 7 columnas— y se ejecutan esas acciones.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:create' })

const route = useRoute()
const novedadId = computed(() => String(route.params.id))
</script>

<template>
  <div>
    <NovedadesEditor :novedad-id="novedadId" />
  </div>
</template>
