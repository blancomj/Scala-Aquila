<script setup lang="ts">
// F10: auditoría de eventos de seguridad (§11). audit:view lo tienen tanto
// agent como auditor (§7.3) — a diferencia de /usuarios (users:manage,
// solo agent).
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'audit:view' })

const tenantStore = useTenantStore()
const auditStore = useAuditStore()

await useAsyncData('auditoria-completa', () => {
  const tenantId = tenantStore.activeTenant?.id
  return tenantId ? auditStore.cargarEventos(tenantId, 200) : Promise.resolve([])
})
</script>

<template>
  <div>
    <h1 class="text-xl font-semibold mb-4">Auditoría</h1>

    <p v-if="auditStore.eventos.length === 0" class="text-gray-500 text-sm">Sin eventos todavía.</p>
    <UiTabla
      v-else
      :columnas="[
        { clave: 'fecha', etiqueta: 'Fecha' },
        { clave: 'accion', etiqueta: 'Acción' },
        { clave: 'entidad', etiqueta: 'Entidad' },
      ]"
      :filas="auditStore.eventos"
      :clave-fila="(evento) => evento.id"
    >
      <template #celda-fecha="{ fila }">
        <span class="whitespace-nowrap">{{ new Date(fila.created_at).toLocaleString('es-CO') }}</span>
      </template>
      <template #celda-accion="{ fila }">{{ fila.action }}</template>
      <template #celda-entidad="{ fila }"><span class="text-gray-500">{{ fila.entity_type ?? '—' }}</span></template>
    </UiTabla>
  </div>
</template>
