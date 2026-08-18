<script setup lang="ts">
// Rediseño de Presupuesto — orquestador delgado de 7 pestañas (ver mockup
// discutido + PLAN aprobado). Mismo patrón estructural que
// components/inmuebles/InmuebleFicha.vue (TABS + tabActiva + nav de
// botones + v-if/v-else-if por pestaña, cada una delegada a su propio
// componente) — pero en Tailwind/Nuxt UI, el estilo que esta página (y
// coeficientes/usuarios) ya usaba antes de este cambio, no el sistema
// legacy .ficha-inmueble/.tabs de InmuebleFicha (ese es otro subsistema
// de diseño, usado solo por fichas/drawers — ver UiDrawer.vue).
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:create' })

const tenantStore = useTenantStore()
const presupuestoStore = usePresupuestoStore()
const fundamentoStore = useFundamentoNormativoStore()

const presupuestoSeleccionadoId = ref<string | null>(null)
const opcionesPresupuesto = computed(() =>
  presupuestoStore.presupuestos.map((p) => ({
    valor: p.id,
    etiqueta: `${p.anio} — v${p.version} (${p.estado})`,
  })),
)

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

watch(
  () => presupuestoStore.presupuestos,
  (lista) => {
    if (!presupuestoSeleccionadoId.value && lista.length > 0) {
      presupuestoSeleccionadoId.value = lista[0]!.id
    }
  },
  { immediate: true },
)

// ── pestañas ─────────────────────────────────────────────────────────
type Tab =
  | 'presupuestos'
  | 'componentes'
  | 'ejecucion'
  | 'bases'
  | 'distribucion'
  | 'aplicacion'
  | 'periodos'
  | 'control'
const TABS: ReadonlyArray<{ id: Tab; etiqueta: string }> = [
  { id: 'presupuestos', etiqueta: 'Presupuestos' },
  { id: 'componentes', etiqueta: 'Componentes presupuestales' },
  { id: 'ejecucion', etiqueta: 'Ejecución presupuestal' },
  { id: 'bases', etiqueta: 'Bases de liquidación' },
  { id: 'distribucion', etiqueta: 'Distribución por unidad' },
  { id: 'aplicacion', etiqueta: 'Aplicación de bases' },
  { id: 'periodos', etiqueta: 'Periodos y vigencia' },
  { id: 'control', etiqueta: 'Control y validaciones' },
]
const tabActiva = ref<Tab>('presupuestos')
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold mb-2">Presupuesto</h1>
        <p class="text-sm text-gray-500">
          Presupuestos, rubros, fuentes de financiación y su reparto entre unidades.
        </p>
      </div>
      <NuxtLink to="/presupuesto/cuentas" class="text-sm text-primary hover:underline">
        Catálogo de cuentas →
      </NuxtLink>
    </div>

    <p v-if="presupuestoStore.presupuestos.length === 0" class="text-gray-500 text-sm">
      Esta copropiedad todavía no tiene un presupuesto registrado.
    </p>

    <template v-else>
      <UFormField label="Presupuesto" name="presupuesto">
        <UiSelectorBuscable v-model="presupuestoSeleccionadoId" :opciones="opcionesPresupuesto" />
      </UFormField>

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
        <PresupuestoTabBasesLiquidacion v-else-if="tabActiva === 'bases'" />
        <CoeficientesPanel v-else-if="tabActiva === 'distribucion'" />
        <PresupuestoTabAplicacionBases
          v-else-if="tabActiva === 'aplicacion'"
          :presupuesto-id="presupuestoSeleccionadoId"
        />
        <PresupuestoTabPeriodosVigencia
          v-else-if="tabActiva === 'periodos'"
          :presupuesto-id="presupuestoSeleccionadoId"
        />
        <PresupuestoTabControlValidaciones
          v-else-if="tabActiva === 'control'"
          :presupuesto-id="presupuestoSeleccionadoId"
        />
      </div>
    </template>
  </div>
</template>
