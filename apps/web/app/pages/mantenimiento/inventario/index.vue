<script setup lang="ts">
// MANT-6 · Inventario de repuestos y costos. Pestañas con el mismo patrón de fondos/index.vue
// (hash de la URL, compartible). El recuadro que distingue activo de repuesto es vinculante
// (prompt §4.6, criterio de aceptación) — se conserva siempre visible, no colapsable.
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const tenantStore = useTenantStore()
const inventarioStore = useMantenimientoInventarioStore()
const agrupacionesStore = useAgrupacionesStore()
const tercerosStore = useTercerosStore()
const route = useRoute()
const router = useRouter()

async function cargarTodo(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await Promise.all([
    inventarioStore.cargarCatalogos(tenantId),
    inventarioStore.cargarMovimientos(tenantId),
    inventarioStore.cargarAlertas(tenantId),
    inventarioStore.cargarPendientesContabilizar(tenantId),
    agrupacionesStore.cargarAgrupaciones(tenantId),
    tercerosStore.cargarTerceros(tenantId),
  ])
}
onMounted(cargarTodo)

const nombreAgrupacion = computed(
  () => new Map(agrupacionesStore.agrupaciones.map((a) => [a.id, a.nombre])),
)
const nombreTercero = computed(
  () =>
    new Map(tercerosStore.terceros.map((t) => [t.id, t.nombre_completo ?? t.razon_social ?? '—'])),
)

type Tab = 'repuestos' | 'almacenes' | 'movimientos' | 'alertas' | 'costos'
const TABS: ReadonlyArray<{ id: Tab; etiqueta: string; slug: string }> = [
  { id: 'repuestos', etiqueta: 'Repuestos', slug: 'repuestos' },
  { id: 'almacenes', etiqueta: 'Almacenes', slug: 'almacenes' },
  { id: 'movimientos', etiqueta: 'Movimientos', slug: 'movimientos' },
  { id: 'alertas', etiqueta: 'Alertas', slug: 'alertas' },
  { id: 'costos', etiqueta: 'Costos', slug: 'costos' },
]
function tabDesdeHash(hash: string): Tab {
  const slug = hash.replace(/^#/, '')
  return TABS.find((t) => t.slug === slug)?.id ?? 'repuestos'
}
const tabActiva = ref<Tab>('repuestos')
onMounted(() => {
  const id = tabDesdeHash(route.hash)
  if (id !== tabActiva.value) tabActiva.value = id
})
watch(tabActiva, (id) => {
  const slug = TABS.find((t) => t.id === id)!.slug
  if (route.hash !== `#${slug}`) router.replace({ hash: `#${slug}` })
})

const nombreRepuesto = computed(
  () => new Map(inventarioStore.repuestos.map((r) => [r.id, r.nombre])),
)
const nombreAlmacen = computed(
  () => new Map(inventarioStore.almacenes.map((a) => [a.id, a.nombre])),
)

// ── drawers ──
const drawerRepuesto = ref(false)
const repuestoEditando = ref<Database['public']['Tables']['mant_repuestos']['Row'] | null>(null)
const drawerAlmacen = ref(false)
const drawerMovimiento = ref(false)

function abrirNuevoRepuesto(): void {
  repuestoEditando.value = null
  drawerRepuesto.value = true
}
function abrirEditarRepuesto(fila: Database['public']['Tables']['mant_repuestos']['Row']): void {
  repuestoEditando.value = fila
  drawerRepuesto.value = true
}

function alGuardadoRepuesto(): void {
  drawerRepuesto.value = false
  repuestoEditando.value = null
}
function alGuardadoAlmacen(): void {
  drawerAlmacen.value = false
}
function alGuardadoMovimiento(): void {
  drawerMovimiento.value = false
}

// ── costos ──
const hoy = new Date()
const costosDesde = ref(`${hoy.getFullYear()}-01-01`)
const costosHasta = ref(hoy.toISOString().slice(0, 10))
async function cargarCostos(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await inventarioStore.cargarCostos(tenantId, costosDesde.value, costosHasta.value)
}
watch(tabActiva, (id) => {
  if (id === 'costos' && inventarioStore.costos.length === 0) cargarCostos()
})
</script>

<template>
  <div class="space-y-6">
    <UiTituloDescripcion>
      <template #titulo>
        <h1 class="text-xl font-semibold">Inventario y costos</h1>
      </template>
      <template #descripcion>
        Materiales y repuestos de consumo de mantenimiento, y su costo real (siempre leído de la
        ejecución presupuestal).
      </template>
    </UiTituloDescripcion>

    <UAlert color="neutral" variant="soft" icon="i-lucide-info" title="Repuesto no es activo">
      <template #description>
        Los <strong>activos</strong> son bienes de la copropiedad que forman parte del patrimonio
        —ascensores, bombas, equipos de presión—; el <strong>inventario</strong> son materiales,
        repuestos y suministros de consumo —pinturas, tornillos, bombillos, filtros.
      </template>
    </UAlert>

    <UAlert
      v-if="inventarioStore.pendientesContabilizar.length > 0"
      color="warning"
      variant="soft"
      icon="i-lucide-triangle-alert"
      :title="`${inventarioStore.pendientesContabilizar.length} consumo(s) sin contabilizar`"
      description="No hay una política de valoración de inventario definida (existencias vs. gasto directo) — el control físico ya quedó registrado; la contabilización queda pendiente hasta que se defina."
    />

    <nav
      class="flex gap-1 border-b border-neutral-200 dark:border-neutral-800 overflow-x-auto"
      role="tablist"
      aria-label="Secciones de Inventario"
    >
      <button
        v-for="tab in TABS"
        :key="tab.id"
        type="button"
        role="tab"
        :aria-selected="tabActiva === tab.id"
        class="px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors"
        :class="
          tabActiva === tab.id
            ? 'border-primary text-primary font-medium'
            : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
        "
        @click="tabActiva = tab.id"
      >
        {{ tab.etiqueta }}
      </button>
    </nav>

    <div role="tabpanel">
      <!-- Repuestos -->
      <div v-if="tabActiva === 'repuestos'" class="space-y-3">
        <div class="flex justify-end">
          <UButton icon="i-lucide-plus" @click="abrirNuevoRepuesto()">Nuevo repuesto</UButton>
        </div>
        <UiTabla
          :columnas="[
            { clave: 'sku', etiqueta: 'SKU' },
            { clave: 'nombre', etiqueta: 'Nombre' },
            { clave: 'umbrales', etiqueta: 'Mín / Reorden / Máx' },
            { clave: 'acciones', etiqueta: '' },
          ]"
          :filas="inventarioStore.repuestos"
          :clave-fila="(r) => r.id"
          vacio="Sin repuestos registrados."
        >
          <template #celda-sku="{ fila }"
            ><span class="font-mono text-xs">{{ fila.sku }}</span></template
          >
          <template #celda-umbrales="{ fila }">
            <span class="text-muted tabular-nums">
              {{ fila.stock_minimo ?? '—' }} / {{ fila.punto_reorden ?? '—' }} /
              {{ fila.stock_maximo ?? '—' }}
            </span>
          </template>
          <template #celda-acciones="{ fila }">
            <UButton size="xs" variant="ghost" @click="abrirEditarRepuesto(fila)">Editar</UButton>
          </template>
        </UiTabla>
      </div>

      <!-- Almacenes -->
      <div v-else-if="tabActiva === 'almacenes'" class="space-y-3">
        <div class="flex justify-end">
          <UButton icon="i-lucide-plus" @click="drawerAlmacen = true">Nuevo almacén</UButton>
        </div>
        <UiTabla
          :columnas="[
            { clave: 'nombre', etiqueta: 'Nombre' },
            { clave: 'descripcion', etiqueta: 'Detalle' },
          ]"
          :filas="inventarioStore.almacenes"
          :clave-fila="(a) => a.id"
          vacio="Sin almacenes registrados."
        >
          <template #celda-descripcion="{ fila }"
            ><span class="text-muted">{{ fila.descripcion ?? '—' }}</span></template
          >
        </UiTabla>
      </div>

      <!-- Movimientos -->
      <div v-else-if="tabActiva === 'movimientos'" class="space-y-3">
        <div class="flex justify-end">
          <UButton icon="i-lucide-plus" @click="drawerMovimiento = true"
            >Registrar movimiento</UButton
          >
        </div>
        <UiTabla
          :columnas="[
            { clave: 'fecha', etiqueta: 'Fecha' },
            { clave: 'repuesto', etiqueta: 'Repuesto' },
            { clave: 'almacen', etiqueta: 'Almacén' },
            { clave: 'tipo', etiqueta: 'Tipo' },
            { clave: 'cantidad', etiqueta: 'Cantidad', alinear: 'derecha' },
          ]"
          :filas="inventarioStore.movimientos"
          :clave-fila="(m) => m.id"
          vacio="Sin movimientos registrados."
        >
          <template #celda-fecha="{ fila }">
            <span class="text-muted">{{
              new Date(fila.registrado_at).toLocaleDateString('es-CO')
            }}</span>
          </template>
          <template #celda-repuesto="{ fila }">{{
            nombreRepuesto.get(fila.repuesto_id) ?? '—'
          }}</template>
          <template #celda-almacen="{ fila }">{{
            nombreAlmacen.get(fila.almacen_id) ?? '—'
          }}</template>
          <template #celda-tipo="{ fila }"
            ><span class="capitalize">{{ fila.tipo }}</span></template
          >
          <template #celda-cantidad="{ fila }">
            <span class="tabular-nums"
              >{{ fila.direccion > 0 ? '+' : '−' }}{{ fila.cantidad }}</span
            >
          </template>
        </UiTabla>
      </div>

      <!-- Alertas -->
      <div v-else-if="tabActiva === 'alertas'" class="space-y-3">
        <p class="text-xs text-muted">Solo notifica — no genera órdenes de compra automáticas.</p>
        <UiTabla
          :columnas="[
            { clave: 'repuesto', etiqueta: 'Repuesto' },
            { clave: 'almacen', etiqueta: 'Almacén' },
            { clave: 'tipo_alerta', etiqueta: 'Motivo' },
            { clave: 'stock_actual', etiqueta: 'Stock actual', alinear: 'derecha' },
          ]"
          :filas="inventarioStore.alertas"
          :clave-fila="(a) => a.id"
          vacio="Sin alertas activas."
        >
          <template #celda-repuesto="{ fila }">{{
            nombreRepuesto.get(fila.repuesto_id) ?? '—'
          }}</template>
          <template #celda-almacen="{ fila }">{{
            nombreAlmacen.get(fila.almacen_id) ?? '—'
          }}</template>
          <template #celda-tipo_alerta="{ fila }">
            <UBadge color="warning" variant="soft" size="sm" class="capitalize">{{
              fila.tipo_alerta.replace('_', ' ')
            }}</UBadge>
          </template>
          <template #celda-stock_actual="{ fila }"
            ><span class="tabular-nums">{{ fila.stock_actual }}</span></template
          >
        </UiTabla>
      </div>

      <!-- Costos -->
      <div v-else-if="tabActiva === 'costos'" class="space-y-3">
        <div class="flex items-center gap-2">
          <UInput v-model="costosDesde" type="date" size="sm" @change="cargarCostos()" />
          <span class="text-muted text-sm">a</span>
          <UInput v-model="costosHasta" type="date" size="sm" @change="cargarCostos()" />
        </div>
        <p class="text-xs text-muted">
          Costo real de mantenimiento, siempre leído de la ejecución presupuestal — nunca calculado
          aparte.
        </p>
        <UiTabla
          :columnas="[
            { clave: 'agrupacion', etiqueta: 'Ubicación' },
            { clave: 'tercero', etiqueta: 'Proveedor' },
            { clave: 'monto', etiqueta: 'Monto', alinear: 'derecha' },
          ]"
          :filas="inventarioStore.costos"
          :clave-fila="(c, i) => i"
          vacio="Sin costos en el rango seleccionado."
        >
          <template #celda-agrupacion="{ fila }">{{
            fila.agrupacion_id ? (nombreAgrupacion.get(fila.agrupacion_id) ?? '—') : '—'
          }}</template>
          <template #celda-tercero="{ fila }">{{
            fila.tercero_id ? (nombreTercero.get(fila.tercero_id) ?? '—') : '—'
          }}</template>
          <template #celda-monto="{ fila }"
            ><span class="tabular-nums">{{ formatoMoneda(fila.monto ?? 0) }}</span></template
          >
        </UiTabla>
      </div>
    </div>

    <MantenimientoInventarioRepuestoDrawer
      v-if="drawerRepuesto"
      :repuesto="repuestoEditando"
      @cerrar="drawerRepuesto = false"
      @guardado="alGuardadoRepuesto"
    />
    <MantenimientoInventarioAlmacenDrawer
      v-if="drawerAlmacen"
      @cerrar="drawerAlmacen = false"
      @guardado="alGuardadoAlmacen"
    />
    <MantenimientoInventarioMovimientoDrawer
      v-if="drawerMovimiento"
      @cerrar="drawerMovimiento = false"
      @guardado="alGuardadoMovimiento"
    />
  </div>
</template>
