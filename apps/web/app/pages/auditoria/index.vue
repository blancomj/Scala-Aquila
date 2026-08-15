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
    <table v-else class="w-full text-sm">
      <thead>
        <tr class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-800">
          <th class="py-1 font-medium">Fecha</th>
          <th class="py-1 font-medium">Acción</th>
          <th class="py-1 font-medium">Entidad</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="evento in auditStore.eventos"
          :key="evento.id"
          class="border-b border-gray-100 dark:border-gray-900"
        >
          <td class="py-1.5 whitespace-nowrap">
            {{ new Date(evento.created_at).toLocaleString('es-CO') }}
          </td>
          <td class="py-1.5">{{ evento.action }}</td>
          <td class="py-1.5 text-gray-500">{{ evento.entity_type ?? '—' }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
