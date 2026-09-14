<script setup lang="ts">
// "Control y validaciones" — antes pestaña de /presupuesto, ahora página
// propia del sidebar (mismo criterio que /presupuesto/cuentas). El
// contenido y el guard de permisos no cambian, solo dejó de vivir detrás
// de un tab.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:create' })

const tenantStore = useTenantStore()
const presupuestoStore = usePresupuestoStore()

// cargarCuentas es indispensable aquí, no solo en index.vue: PresupuestoTabControlValidaciones
// construye cuentaPorId desde presupuestoStore.cuentas para filtrar los rubros de egreso
// (checkRubros) — sin cargarla, cuentaPorId queda vacío, cuentaPorId.get(rubro.cuenta_id) da
// undefined para cada rubro, y "Rubros de egreso = Monto total" muestra $0 siempre, sin importar
// cuánto se haya asignado. Bug real, no de timing — confirmado en vivo contra datos reales.
// `watch: [...]`: activeTenant puede no estar resuelto en el instante exacto
// de este setup en la carga en frío — la opción reintenta sola en cuanto el
// id esté disponible (mismo espíritu que configuracion/ia.vue).
await useAsyncData(
  'presupuesto-control',
  async () => {
    const tenantId = tenantStore.activeTenant?.id
    if (!tenantId) return []
    const [presupuestos] = await Promise.all([
      presupuestoStore.cargarPresupuestos(tenantId),
      presupuestoStore.cargarCuentas(tenantId),
    ])
    return presupuestos
  },
  { watch: [() => tenantStore.activeTenant?.id] },
)

const presupuestoSeleccionadoId = useSeleccionPresupuesto()
const presupuestoSeleccionado = computed(
  () => presupuestoStore.presupuestos.find((p) => p.id === presupuestoSeleccionadoId.value) ?? null,
)
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <UiTituloDescripcion clase-descripcion="text-sm text-neutral-500 mt-1">
        <template #titulo>
          <h1 class="text-xl font-semibold">Control y validaciones</h1>
        </template>
        <template #descripcion>
          Verifica que los rubros y las fuentes de financiación cuadren con las reglas que se
          exigen para aprobar o activar el presupuesto.
        </template>
      </UiTituloDescripcion>
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
    <PresupuestoTabControlValidaciones v-else :presupuesto-id="presupuestoSeleccionadoId" />
  </div>
</template>
