<script setup lang="ts">
// "Periodos y vigencia" — antes pestaña de /presupuesto, ahora página
// propia del sidebar (mismo criterio que /presupuesto/cuentas). El
// contenido y el guard de permisos no cambian, solo dejó de vivir detrás
// de un tab.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:create' })

const tenantStore = useTenantStore()
const presupuestoStore = usePresupuestoStore()

await useAsyncData('presupuesto-periodos', async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return []
  return presupuestoStore.cargarPresupuestos(tenantId)
})

const presupuestoSeleccionadoId = useSeleccionPresupuesto()
const presupuestoSeleccionado = computed(
  () => presupuestoStore.presupuestos.find((p) => p.id === presupuestoSeleccionadoId.value) ?? null,
)
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <h1 class="text-xl font-semibold mb-2">Periodos y vigencia</h1>
        <p class="text-sm text-neutral-500">
          Vigencia del presupuesto seleccionado y los periodos de liquidación de su año fiscal.
        </p>
      </div>
      <div class="flex items-end gap-3">
        <UBadge
          v-if="presupuestoSeleccionado"
          :color="COLOR_ESTADO_PRESUPUESTO[presupuestoSeleccionado.estado] ?? 'neutral'"
          variant="subtle"
          class="mb-1.5"
        >
          {{ ETIQUETA_ESTADO_PRESUPUESTO[presupuestoSeleccionado.estado] ?? presupuestoSeleccionado.estado }}
        </UBadge>
        <PresupuestoSelector
          v-if="presupuestoStore.presupuestos.length > 0"
          v-model="presupuestoSeleccionadoId"
        />
      </div>
    </div>

    <p v-if="presupuestoStore.presupuestos.length === 0" class="text-neutral-500 text-sm">
      Esta copropiedad todavía no tiene un presupuesto registrado.
    </p>
    <PresupuestoTabPeriodosVigencia v-else :presupuesto-id="presupuestoSeleccionadoId" />
  </div>
</template>
