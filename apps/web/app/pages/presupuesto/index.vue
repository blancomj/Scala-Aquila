<script setup lang="ts">
// Rediseño de Presupuesto — orquestador delgado de pestañas (ver mockup
// discutido + PLAN aprobado). Mismo patrón estructural que
// components/inmuebles/InmuebleFicha.vue (TABS + tabActiva + nav de
// botones + v-if/v-else-if por pestaña, cada una delegada a su propio
// componente) — pero en Tailwind/Nuxt UI, el estilo que esta página (y
// coeficientes/usuarios) ya usaba antes de este cambio, no el sistema
// legacy .ficha-inmueble/.tabs de InmuebleFicha (ese es otro subsistema
// de diseño, usado solo por fichas/drawers — ver UiDrawer.vue).
// "Periodos y vigencia" y "Control y validaciones" pasaron a páginas
// propias del sidebar (ver utils/navegacion.ts). "Conceptos" pasó del
// sidebar a la pestaña "Conceptos" (PresupuestoTabConceptos.vue): solo
// catálogo (lista + editar/archivar/nuevo) — el editor de fórmulas AEL
// completo vive en /conceptos/nuevo y /conceptos/[id] (ver
// components/conceptos/ConceptosEditor.vue).
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:create' })

const tenantStore = useTenantStore()
const presupuestoStore = usePresupuestoStore()
const fundamentoStore = useFundamentoNormativoStore()

const presupuestoSeleccionadoId = ref<string | null>(null)

await useAsyncData('presupuestos', async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return []
  const [presupuestos] = await Promise.all([
    presupuestoStore.cargarPresupuestos(tenantId),
    presupuestoStore.cargarCuentas(tenantId),
    fundamentoStore.cargarFundamentos(),
  ])
  return presupuestos
})

// ── pestañas ─────────────────────────────────────────────────────────
// "Periodos y vigencia" y "Control y validaciones" pasaron a ser páginas
// propias del sidebar (/presupuesto/periodos, /presupuesto/control) — ya
// no son pestañas de este orquestador (ver utils/navegacion.ts).
type Tab = 'presupuestos' | 'componentes' | 'ejecucion' | 'conceptos' | 'distribucion' | 'aplicacion'
const TABS: ReadonlyArray<{ id: Tab; etiqueta: string }> = [
  { id: 'presupuestos', etiqueta: 'Presupuestos' },
  { id: 'componentes', etiqueta: 'Componentes presupuestales' },
  { id: 'ejecucion', etiqueta: 'Ejecución presupuestal' },
  { id: 'conceptos', etiqueta: 'Conceptos' },
  { id: 'distribucion', etiqueta: 'Distribución por unidad' },
  { id: 'aplicacion', etiqueta: 'Aplicación de bases' },
]
const tabActiva = ref<Tab>('presupuestos')
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold mb-2">Presupuesto</h1>
        <p class="text-sm text-gray-500">
          Presupuestos, rubros, fuentes de financiación y su reparto entre unidades.
        </p>
      </div>
      <div class="flex items-end gap-4">
        <PresupuestoSelector
          v-if="presupuestoStore.presupuestos.length > 0"
          v-model="presupuestoSeleccionadoId"
        />
        <NuxtLink
          to="/presupuesto/cuentas"
          class="text-sm text-primary hover:underline whitespace-nowrap pb-1.5"
        >
          Catálogo de cuentas →
        </NuxtLink>
      </div>
    </div>

    <p v-if="presupuestoStore.presupuestos.length === 0" class="text-gray-500 text-sm">
      Esta copropiedad todavía no tiene un presupuesto registrado.
    </p>

    <template v-else>
      <nav class="flex gap-1 border-b border-gray-200 dark:border-gray-800 overflow-x-auto">
        <button
          v-for="tab in TABS"
          :key="tab.id"
          type="button"
          class="px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors"
          :class="
            tabActiva === tab.id
              ? 'border-blue-600 text-blue-600 font-medium'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          "
          @click="tabActiva = tab.id"
        >
          {{ tab.etiqueta }}
        </button>
      </nav>

      <div>
        <PresupuestoTabPresupuestos
          v-if="tabActiva === 'presupuestos'"
          v-model:presupuesto-id="presupuestoSeleccionadoId"
        />
        <PresupuestoTabComponentes
          v-else-if="tabActiva === 'componentes'"
          :presupuesto-id="presupuestoSeleccionadoId"
        />
        <PresupuestoTabEjecucion
          v-else-if="tabActiva === 'ejecucion'"
          :presupuesto-id="presupuestoSeleccionadoId"
        />
        <PresupuestoTabConceptos v-else-if="tabActiva === 'conceptos'" />
        <CoeficientesPanel v-else-if="tabActiva === 'distribucion'" />
        <PresupuestoTabAplicacionBases
          v-else-if="tabActiva === 'aplicacion'"
          :presupuesto-id="presupuestoSeleccionadoId"
        />
      </div>
    </template>
  </div>
</template>
