<script setup lang="ts">
// "Periodos y vigencia" — antes pestaña de /presupuesto, ahora página
// propia del sidebar (mismo criterio que /presupuesto/cuentas). El
// contenido y el guard de permisos no cambian, solo dejó de vivir detrás
// de un tab.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:create' })

const tenantStore = useTenantStore()
const presupuestoStore = usePresupuestoStore()

// `watch: [...]`: activeTenant puede no estar resuelto en el instante exacto
// de este setup en la carga en frío — la opción reintenta sola en cuanto el
// id esté disponible (mismo espíritu que configuracion/ia.vue).
await useAsyncData(
  'presupuesto-periodos',
  async () => {
    const tenantId = tenantStore.activeTenant?.id
    if (!tenantId) return []
    return presupuestoStore.cargarPresupuestos(tenantId)
  },
  { watch: [() => tenantStore.activeTenant?.id] },
)
</script>

<template>
  <div class="space-y-6">
    <UiTituloDescripcion clase-descripcion="text-sm text-neutral-500 mt-1">
      <template #titulo>
        <h1 class="text-xl font-semibold">Periodos y vigencia</h1>
      </template>
      <template #descripcion>
        Vigencia del presupuesto seleccionado y los periodos de liquidación de su año fiscal.
      </template>
    </UiTituloDescripcion>

    <p v-if="presupuestoStore.presupuestos.length === 0" class="text-neutral-500 text-sm">
      Esta copropiedad todavía no tiene un presupuesto registrado.
    </p>
    <PresupuestoTabPeriodosVigencia v-else />
  </div>
</template>
