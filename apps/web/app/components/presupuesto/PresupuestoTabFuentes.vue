<script setup lang="ts">
// Pestaña "Fuentes de financiación" (E7) — antes vivía dentro de
// "Aplicación de bases" solo porque el diseño de 7 pestañas original no
// tenía espacio para una propia (ver comentario retirado). Mockup "Libro
// Presupuestal": registrar una fuente y simular el reparto son acciones
// distintas, ahora en pestañas separadas — la simulación vive en
// PresupuestoTabSimulacion.vue y consume presupuestoStore.fuentes que
// esta pestaña carga.
const props = defineProps<{ presupuestoId: string | null }>()

const tenantStore = useTenantStore()
const presupuestoStore = usePresupuestoStore()
const fundamentoStore = useFundamentoNormativoStore()

const drawerFuenteAbierto = ref(false)

watch(
  () => props.presupuestoId,
  async (id) => {
    if (id) await presupuestoStore.cargarFuentesFinanciacion(id)
  },
  { immediate: true },
)

onMounted(() => {
  if (fundamentoStore.fundamentos.length === 0) fundamentoStore.cargarFundamentos()
  const tenantId = tenantStore.activeTenant?.id
  if (tenantId && presupuestoStore.tiposFuente.length === 0) presupuestoStore.cargarTiposFuente(tenantId)
})

const fundamentoPorId = computed(
  () => new Map(fundamentoStore.fundamentos.map((f) => [f.id, f.norma])),
)
const tipoFuentePorId = computed(
  () => new Map(presupuestoStore.tiposFuente.map((t) => [t.id, t.nombre])),
)

function onFuenteCreada(): void {
  drawerFuenteAbierto.value = false
}

function formatoMoneda(valor: string | number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(valor))
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-lg font-semibold">Fuentes de financiación</h2>
        <p class="text-sm text-gray-500">
          Recursos que financian el presupuesto además de la cuota de administración —
          préstamos, reservas, otros ingresos.
        </p>
      </div>
      <UButton size="xs" @click="drawerFuenteAbierto = true">Registrar fuente</UButton>
    </div>

    <UiTabla
      :columnas="[
        { clave: 'tipo', etiqueta: 'Tipo' },
        { clave: 'disponible', etiqueta: 'Disponible', alinear: 'derecha' },
        { clave: 'aplicado', etiqueta: 'Aplicado', alinear: 'derecha' },
        { clave: 'descripcion', etiqueta: 'Descripción' },
        { clave: 'fundamento', etiqueta: 'Fundamento' },
      ]"
      :filas="presupuestoStore.fuentes"
      :clave-fila="(fuente) => fuente.id"
      vacio="Ninguna registrada todavía."
    >
      <template #celda-tipo="{ fila }">{{ tipoFuentePorId.get(fila.tipo_id) ?? '—' }}</template>
      <template #celda-disponible="{ fila }">
        <span class="tabular-nums">{{ formatoMoneda(fila.valor_disponible) }}</span>
      </template>
      <template #celda-aplicado="{ fila }">
        <span class="tabular-nums">{{ formatoMoneda(fila.valor_aplicado) }}</span>
      </template>
      <template #celda-descripcion="{ fila }"
        ><span class="text-gray-500">{{ fila.descripcion ?? '—' }}</span></template
      >
      <template #celda-fundamento="{ fila }">
        <span class="text-gray-500">
          {{
            fila.fundamento_normativo_id ? fundamentoPorId.get(fila.fundamento_normativo_id) : '—'
          }}
        </span>
      </template>
    </UiTabla>

    <p class="text-xs text-gray-500">
      El fondo de imprevistos no puede aplicarse por más de su saldo actual disponible — se
      valida al guardar.
    </p>

    <PresupuestoFuenteDrawer
      v-if="drawerFuenteAbierto && presupuestoId && tenantStore.activeTenant"
      :presupuesto-id="presupuestoId"
      :tenant-id="tenantStore.activeTenant.id"
      @cerrar="drawerFuenteAbierto = false"
      @creado="onFuenteCreada"
    />
  </div>
</template>
