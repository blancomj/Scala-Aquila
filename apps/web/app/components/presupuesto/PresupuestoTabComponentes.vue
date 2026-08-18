<script setup lang="ts">
// Pestaña "Componentes Presupuestales" — árbol de presupuesto_cuenta (E8),
// separado en dos secciones paralelas (Egresos / Ingresos) igual que el
// Estado de Resultado Integral real revisado (Casos de uso/Presupuesto).
// Los subtotales por nodo vienen siempre de presupuesto_cuenta_totales
// (BD) vía cargarTotalesCuenta — no se recalculan en el cliente, para no
// duplicar la lógica recursiva del árbol.
const props = defineProps<{ presupuestoId: string | null }>()

const tenantStore = useTenantStore()
const presupuestoStore = usePresupuestoStore()
const fundamentoStore = useFundamentoNormativoStore()

watch(
  () => props.presupuestoId,
  async (id) => {
    if (id) await Promise.all([presupuestoStore.cargarRubros(id), presupuestoStore.cargarTotalesCuenta(id)])
  },
  { immediate: true },
)

const presupuestoSeleccionado = computed(
  () => presupuestoStore.presupuestos.find((p) => p.id === props.presupuestoId) ?? null,
)

const fundamentoPorId = computed(
  () => new Map(fundamentoStore.fundamentos.map((f) => [f.id, f.norma])),
)

const cuentaPorId = computed(() => new Map(presupuestoStore.cuentas.map((c) => [c.id, c])))

const totalPorCuenta = computed(
  () => new Map(presupuestoStore.totalesCuenta.map((t) => [t.cuenta_id, Number(t.monto_acumulado)])),
)

/** `ruta` es un path materializado zero-padded (ej. "0005.0001") — el
 * orden lexicográfico ya coincide con el orden del árbol, sin necesitar
 * una consulta recursiva en el cliente (mismo criterio que el store). */
function arbol(naturaleza: 'ingreso' | 'egreso') {
  return presupuestoStore.cuentas
    .filter((c) => c.naturaleza === naturaleza)
    .slice()
    .sort((a, b) => a.ruta.localeCompare(b.ruta))
}

const arbolEgresos = computed(() => arbol('egreso'))
const arbolIngresos = computed(() => arbol('ingreso'))

const sumaEgresos = computed(() =>
  presupuestoStore.rubros
    .filter((r) => cuentaPorId.value.get(r.cuenta_id)?.naturaleza === 'egreso')
    .reduce((acc, r) => acc + Number(r.monto_anual), 0),
)

function formatoMoneda(valor: string | number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(valor))
}

function porcentajeDelTotal(cuentaId: string): string {
  const total = presupuestoSeleccionado.value ? Number(presupuestoSeleccionado.value.monto_total) : 0
  if (total === 0) return '—'
  const monto = totalPorCuenta.value.get(cuentaId) ?? 0
  return `${((monto / total) * 100).toFixed(1)}%`
}

/** Rubros de una cuenta hoja puntual — las cuentas de grupo no tienen
 * rubros propios (guard_presupuesto_rubro_cuenta lo impide), así que no
 * hace falta acumular hacia hijos aquí. */
function rubrosDeCuenta(cuentaId: string) {
  return presupuestoStore.rubros.filter((r) => r.cuenta_id === cuentaId)
}

const drawerRubroAbierto = ref(false)
const drawerCuentaAbierto = ref(false)

function onRubroCreado(): void {
  drawerRubroAbierto.value = false
  if (props.presupuestoId) presupuestoStore.cargarTotalesCuenta(props.presupuestoId)
}

function onCuentaCreada(): void {
  drawerCuentaAbierto.value = false
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold">Componentes presupuestales</h2>
      <div class="flex gap-2">
        <UButton size="xs" variant="soft" @click="drawerCuentaAbierto = true">Nueva cuenta</UButton>
        <UButton
          v-if="presupuestoSeleccionado?.estado === 'borrador'"
          size="xs"
          @click="drawerRubroAbierto = true"
        >
          Agregar rubro
        </UButton>
      </div>
    </div>

    <p v-if="presupuestoSeleccionado" class="text-sm text-gray-500">
      Σ rubros de egreso: {{ formatoMoneda(sumaEgresos) }} / monto_total:
      {{ formatoMoneda(presupuestoSeleccionado.monto_total) }}
      <span v-if="sumaEgresos !== Number(presupuestoSeleccionado.monto_total)" class="text-amber-500">
        — no coinciden, activar fallará hasta que cuadren
      </span>
    </p>

    <section v-for="seccion in [{ titulo: 'Egresos', filas: arbolEgresos }, { titulo: 'Ingresos', filas: arbolIngresos }]" :key="seccion.titulo">
      <h3 class="text-sm font-semibold mb-2">{{ seccion.titulo }}</h3>
      <UiTabla
        :columnas="[
          { clave: 'nombre', etiqueta: 'Cuenta' },
          { clave: 'monto', etiqueta: 'Monto', alinear: 'derecha' },
          { clave: 'porcentaje', etiqueta: '% del total', alinear: 'derecha' },
        ]"
        :filas="seccion.filas"
        :clave-fila="(fila) => fila.id"
        vacio="Sin cuentas todavía."
      >
        <template #celda-nombre="{ fila }">
          <span :style="{ paddingLeft: `${(fila.nivel - 1) * 16}px` }" :class="{ 'font-medium': fila.nivel === 1 }">
            {{ fila.nombre }}
          </span>
          <span v-if="!fila.es_hoja" class="text-xs text-gray-400 ml-1">(grupo)</span>
        </template>
        <template #celda-monto="{ fila }">{{ formatoMoneda(totalPorCuenta.get(fila.id) ?? 0) }}</template>
        <template #celda-porcentaje="{ fila }">
          <span class="text-gray-500">{{ porcentajeDelTotal(fila.id) }}</span>
        </template>
      </UiTabla>

      <!-- No se filtra por es_hoja: una cuenta que era hoja y ganó hijos después conserva los
           rubros que ya tenía directamente (E8, caso real verificado en dev) — siguen contando
           en su subtotal, así que también deben verse en el detalle. -->
      <div v-for="cuenta in seccion.filas.filter((c) => rubrosDeCuenta(c.id).length > 0)" :key="cuenta.id" class="mt-3">
        <h4 class="text-xs font-medium text-gray-500 mb-1" :style="{ paddingLeft: `${(cuenta.nivel - 1) * 16}px` }">
          {{ cuenta.nombre }}
        </h4>
        <UiTabla
          :columnas="[
            { clave: 'codigo', etiqueta: 'Código' },
            { clave: 'nombre', etiqueta: 'Nombre' },
            { clave: 'montoAnual', etiqueta: 'Monto anual', alinear: 'derecha' },
            { clave: 'fundamento', etiqueta: 'Fundamento' },
          ]"
          :filas="rubrosDeCuenta(cuenta.id)"
          :clave-fila="(rubro) => rubro.id"
        >
          <template #celda-codigo="{ fila }">{{ fila.codigo }}</template>
          <template #celda-nombre="{ fila }">{{ fila.nombre }}</template>
          <template #celda-montoAnual="{ fila }">{{ formatoMoneda(fila.monto_anual) }}</template>
          <template #celda-fundamento="{ fila }">
            <span class="text-gray-500">
              {{ fila.fundamento_normativo_id ? fundamentoPorId.get(fila.fundamento_normativo_id) : '—' }}
            </span>
          </template>
        </UiTabla>
      </div>
    </section>

    <PresupuestoRubroDrawer
      v-if="drawerRubroAbierto && presupuestoId"
      :presupuesto-id="presupuestoId"
      @cerrar="drawerRubroAbierto = false"
      @creado="onRubroCreado"
    />
    <PresupuestoCuentaDrawer
      v-if="drawerCuentaAbierto && tenantStore.activeTenant"
      :tenant-id="tenantStore.activeTenant.id"
      @cerrar="drawerCuentaAbierto = false"
      @creada="onCuentaCreada"
    />
  </div>
</template>
