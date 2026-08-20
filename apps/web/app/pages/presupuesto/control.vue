<script setup lang="ts">
// "Control y validaciones" — antes pestaña de /presupuesto, ahora página
// propia del sidebar (mismo criterio que /presupuesto/cuentas). El
// contenido y el guard de permisos no cambian, solo dejó de vivir detrás
// de un tab.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:create' })

const tenantStore = useTenantStore()
const presupuestoStore = usePresupuestoStore()

const presupuestoSeleccionadoId = ref<string | null>(null)

await useAsyncData('presupuesto-control', async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return []
  return presupuestoStore.cargarPresupuestos(tenantId)
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold mb-2">Control y validaciones</h1>
        <p class="text-sm text-gray-500">
          Estado de reconciliación del presupuesto seleccionado frente a los guard triggers
          reales de Postgres.
        </p>
      </div>
      <PresupuestoSelector
        v-if="presupuestoStore.presupuestos.length > 0"
        v-model="presupuestoSeleccionadoId"
      />
    </div>

    <p v-if="presupuestoStore.presupuestos.length === 0" class="text-gray-500 text-sm">
      Esta copropiedad todavía no tiene un presupuesto registrado.
    </p>
    <PresupuestoTabControlValidaciones v-else :presupuesto-id="presupuestoSeleccionadoId" />
  </div>
</template>
