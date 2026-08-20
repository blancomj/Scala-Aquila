<script setup lang="ts">
// "Periodos y vigencia" — antes pestaña de /presupuesto, ahora página
// propia del sidebar (mismo criterio que /presupuesto/cuentas). El
// contenido y el guard de permisos no cambian, solo dejó de vivir detrás
// de un tab.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:create' })

const tenantStore = useTenantStore()
const presupuestoStore = usePresupuestoStore()

const presupuestoSeleccionadoId = ref<string | null>(null)

await useAsyncData('presupuesto-periodos', async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return []
  return presupuestoStore.cargarPresupuestos(tenantId)
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold mb-2">Periodos y vigencia</h1>
        <p class="text-sm text-gray-500">
          Vigencia del presupuesto seleccionado y los periodos de liquidación de su año fiscal.
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
    <PresupuestoTabPeriodosVigencia v-else :presupuesto-id="presupuestoSeleccionadoId" />
  </div>
</template>
