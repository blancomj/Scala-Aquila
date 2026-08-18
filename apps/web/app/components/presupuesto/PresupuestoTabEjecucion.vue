<script setup lang="ts">
// Pestaña "Ejecución presupuestal" (E9) — presupuestado vs. ejecutado por cuenta, mismo criterio
// de secciones Egresos/Ingresos que PresupuestoTabComponentes.vue. El rollup viene siempre de
// presupuesto_cuenta_ejecucion (BD) vía cargarComparativoCuenta — la variación (con prorrateo
// mensual, E9 seguimiento) se calcula aquí (capa de presentación, por diseño de la función).
import type { Database } from '@aquila/shared'

type PresupuestoEjecucionRow = Database['public']['Tables']['presupuesto_ejecucion']['Row']

const props = defineProps<{ presupuestoId: string | null }>()

const tenantStore = useTenantStore()
const presupuestoStore = usePresupuestoStore()
const liquidacionStore = useLiquidacionStore()

watch(
  () => props.presupuestoId,
  async (id) => {
    const tenantId = tenantStore.activeTenant?.id
    if (id && tenantId) {
      await Promise.all([
        presupuestoStore.cargarComparativoCuenta(id),
        presupuestoStore.cargarEjecuciones(tenantId),
        liquidacionStore.cargarPeriodos(tenantId),
      ])
    }
  },
  { immediate: true },
)

const comparativoPorCuenta = computed(
  () => new Map(presupuestoStore.comparativoCuenta.map((c) => [c.cuenta_id, c])),
)

/** Mismo orden lexicográfico sobre `ruta` que PresupuestoTabComponentes.vue. */
function arbol(naturaleza: 'ingreso' | 'egreso') {
  return presupuestoStore.cuentas
    .filter((c) => c.naturaleza === naturaleza)
    .slice()
    .sort((a, b) => a.ruta.localeCompare(b.ruta))
}

const arbolEgresos = computed(() => arbol('egreso'))
const arbolIngresos = computed(() => arbol('ingreso'))

const cuentaPorId = computed(() => new Map(presupuestoStore.cuentas.map((c) => [c.id, c])))
const periodoPorId = computed(() => new Map(liquidacionStore.periodos.map((p) => [p.id, p])))

function formatoMoneda(valor: string | number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(valor))
}

function presupuestado(cuentaId: string): number {
  return Number(comparativoPorCuenta.value.get(cuentaId)?.presupuestado ?? 0)
}

function ejecutado(cuentaId: string): number {
  return Number(comparativoPorCuenta.value.get(cuentaId)?.ejecutado ?? 0)
}

const presupuestoSeleccionado = computed(
  () => presupuestoStore.presupuestos.find((p) => p.id === props.presupuestoId) ?? null,
)

/** Meses transcurridos del año fiscal del presupuesto — capa de presentación (E9 seguimiento):
 * un año ya cerrado cuenta como completo (12), uno futuro como 0 (todavía no arranca), el año
 * en curso usa el mes calendario actual. Sin esto, la variación comparaba ejecutado-a-la-fecha
 * contra el presupuesto ANUAL completo — en enero, gastar 1/12 del presupuesto se veía como
 * "-91.7%" (alarmante) cuando en realidad iba exactamente en línea. */
const mesesTranscurridos = computed(() => {
  const anio = presupuestoSeleccionado.value?.anio
  if (anio === undefined) return 0
  const ahora = new Date()
  const anioActual = ahora.getFullYear()
  if (anio < anioActual) return 12
  if (anio > anioActual) return 0
  return ahora.getMonth() + 1
})

function presupuestadoALaFecha(cuentaId: string): number {
  return (presupuestado(cuentaId) * mesesTranscurridos.value) / 12
}

function variacionPct(cuentaId: string): string {
  const p = presupuestadoALaFecha(cuentaId)
  if (p === 0) return '—'
  return `${(((ejecutado(cuentaId) - p) / p) * 100).toFixed(1)}%`
}

/** Excedente/pérdida del ejercicio (Σ ingresos − Σ egresos) — la cifra de cierre del Estado de
 * Resultado real revisado (Casos de uso/Presupuesto). Sumar solo nodos nivel 1 basta: son
 * subárboles disjuntos, así que equivale a sumar todas las hojas sin riesgo de doble conteo. */
const excedente = computed(() => {
  const raices = presupuestoStore.cuentas.filter((c) => c.nivel === 1)
  const sumar = (naturaleza: 'ingreso' | 'egreso', campo: 'presupuestado' | 'ejecutado') =>
    raices
      .filter((c) => c.naturaleza === naturaleza)
      .reduce((acc, c) => acc + (campo === 'presupuestado' ? presupuestado(c.id) : ejecutado(c.id)), 0)

  return {
    presupuestado: sumar('ingreso', 'presupuestado') - sumar('egreso', 'presupuestado'),
    ejecutado: sumar('ingreso', 'ejecutado') - sumar('egreso', 'ejecutado'),
  }
})

const drawerAbierto = ref(false)

function onRegistrado(): void {
  drawerAbierto.value = false
  if (props.presupuestoId) presupuestoStore.cargarComparativoCuenta(props.presupuestoId)
}

const revirtiendoId = ref<string | null>(null)
const errorReversion = ref<string | null>(null)

/** Corrección de un movimiento mal registrado (E9 seguimiento, 20260823300000): inserta la
 * reversión (monto negativo, misma cuenta/periodo) en vez de editar/borrar — append-only. Una
 * fila que YA es una reversión no se puede volver a corregir aquí (evita cadenas sin sentido). */
async function ajustar(movimiento: PresupuestoEjecucionRow): Promise<void> {
  errorReversion.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return

  revirtiendoId.value = movimiento.id
  try {
    await presupuestoStore.revertirEjecucion({ tenantId, movimiento })
    if (props.presupuestoId) await presupuestoStore.cargarComparativoCuenta(props.presupuestoId)
  } catch (excepcion) {
    errorReversion.value = mensajeError(excepcion, 'No se pudo revertir el movimiento.')
  } finally {
    revirtiendoId.value = null
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold">Ejecución presupuestal</h2>
      <UButton size="xs" @click="drawerAbierto = true">Registrar movimiento</UButton>
    </div>

    <p class="text-sm text-gray-500">
      Presupuestado (anual) vs. ejecutado (acumulado del año) por cuenta. La variación compara el
      ejecutado contra el presupuesto <strong>prorrateado a la fecha</strong> ({{ mesesTranscurridos }}
      de 12 meses) — no contra el anual completo, para no leer como alarma un gasto que en
      realidad va en línea con lo esperado a estas alturas del año.
    </p>

    <div class="rounded-lg border border-gray-200 dark:border-gray-800 p-4 flex gap-8">
      <div>
        <p class="text-xs text-gray-500 uppercase tracking-wide">Excedente / pérdida presupuestado</p>
        <p class="text-lg font-semibold" :class="excedente.presupuestado < 0 ? 'text-amber-500' : ''">
          {{ formatoMoneda(excedente.presupuestado) }}
        </p>
      </div>
      <div>
        <p class="text-xs text-gray-500 uppercase tracking-wide">Excedente / pérdida ejecutado</p>
        <p class="text-lg font-semibold" :class="excedente.ejecutado < 0 ? 'text-amber-500' : ''">
          {{ formatoMoneda(excedente.ejecutado) }}
        </p>
      </div>
    </div>

    <section v-for="seccion in [{ titulo: 'Egresos', filas: arbolEgresos }, { titulo: 'Ingresos', filas: arbolIngresos }]" :key="seccion.titulo">
      <h3 class="text-sm font-semibold mb-2">{{ seccion.titulo }}</h3>
      <UiTabla
        :columnas="[
          { clave: 'nombre', etiqueta: 'Cuenta' },
          { clave: 'presupuestado', etiqueta: 'Presupuestado (anual)', alinear: 'derecha' },
          { clave: 'aLaFecha', etiqueta: 'Presupuestado (a la fecha)', alinear: 'derecha' },
          { clave: 'ejecutado', etiqueta: 'Ejecutado', alinear: 'derecha' },
          { clave: 'variacion', etiqueta: 'Variación', alinear: 'derecha' },
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
          <span v-else-if="fila.concepto_id" class="text-xs text-gray-400 ml-1">(automático)</span>
        </template>
        <template #celda-presupuestado="{ fila }">{{ formatoMoneda(presupuestado(fila.id)) }}</template>
        <template #celda-aLaFecha="{ fila }">
          <span class="text-gray-500">{{ formatoMoneda(presupuestadoALaFecha(fila.id)) }}</span>
        </template>
        <template #celda-ejecutado="{ fila }">{{ formatoMoneda(ejecutado(fila.id)) }}</template>
        <template #celda-variacion="{ fila }">
          <span
            :class="
              ejecutado(fila.id) > presupuestadoALaFecha(fila.id) && fila.naturaleza === 'egreso'
                ? 'text-amber-500'
                : 'text-gray-500'
            "
          >
            {{ variacionPct(fila.id) }}
          </span>
        </template>
      </UiTabla>
    </section>

    <section>
      <h3 class="text-sm font-semibold mb-2">Movimientos registrados</h3>
      <p class="text-xs text-gray-500 mb-2">
        Append-only — un monto mal registrado no se edita ni se borra, se corrige con "Ajustar"
        (inserta una reversión que compensa el original).
      </p>
      <UAlert v-if="errorReversion" color="error" variant="soft" :title="errorReversion" class="mb-2" />
      <UiTabla
        :columnas="[
          { clave: 'cuenta', etiqueta: 'Cuenta' },
          { clave: 'periodo', etiqueta: 'Periodo' },
          { clave: 'monto', etiqueta: 'Monto', alinear: 'derecha' },
          { clave: 'descripcion', etiqueta: 'Descripción' },
          { clave: 'acciones', etiqueta: '' },
        ]"
        :filas="presupuestoStore.ejecuciones"
        :clave-fila="(fila) => fila.id"
        vacio="Sin movimientos registrados todavía."
      >
        <template #celda-cuenta="{ fila }">{{ cuentaPorId.get(fila.cuenta_id)?.nombre ?? '—' }}</template>
        <template #celda-periodo="{ fila }">
          <span v-if="periodoPorId.get(fila.periodo_id)">
            {{ periodoPorId.get(fila.periodo_id)!.anio }}-{{
              String(periodoPorId.get(fila.periodo_id)!.mes).padStart(2, '0')
            }}
          </span>
          <span v-else>—</span>
        </template>
        <template #celda-monto="{ fila }">
          <span :class="Number(fila.monto) < 0 ? 'text-amber-500' : ''">{{ formatoMoneda(fila.monto) }}</span>
        </template>
        <template #celda-descripcion="{ fila }">
          <span class="text-gray-500">{{ fila.descripcion ?? '—' }}</span>
        </template>
        <template #celda-acciones="{ fila }">
          <UButton
            v-if="!fila.ajusta_movimiento_id"
            size="xs"
            variant="ghost"
            :loading="revirtiendoId === fila.id"
            @click="ajustar(fila)"
          >
            Ajustar
          </UButton>
        </template>
      </UiTabla>
    </section>

    <PresupuestoEjecucionDrawer
      v-if="drawerAbierto && tenantStore.activeTenant"
      :tenant-id="tenantStore.activeTenant.id"
      @cerrar="drawerAbierto = false"
      @registrado="onRegistrado"
    />
  </div>
</template>
