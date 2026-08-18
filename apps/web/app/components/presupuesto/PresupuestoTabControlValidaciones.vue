<script setup lang="ts">
// Pestaña "Control y Validaciones" — nueva, de solo lectura. Refleja en
// vivo lo que hoy solo se valida en guard triggers de Postgres al
// escribir (guard_presupuesto_reconciliado, guard_fuente_financiacion),
// sin reimplementar su lógica de negocio más allá de lo necesario para
// mostrarla (mismos umbrales exactos del SQL real — ver
// 20260814200000_motor_presupuestal_financiacion.sql). No es un motor de
// validación nuevo, es una vista del mismo estado (PLAN aprobado, E6).
const props = defineProps<{ presupuestoId: string | null }>()

const tenantStore = useTenantStore()
const presupuestoStore = usePresupuestoStore()

const cargando = ref(false)

watch(
  () => props.presupuestoId,
  async (id) => {
    const tenantId = tenantStore.activeTenant?.id
    if (!id || !tenantId) return
    cargando.value = true
    try {
      await Promise.all([
        presupuestoStore.cargarRubros(id),
        presupuestoStore.cargarFuentesFinanciacion(id),
        presupuestoStore.cargarFondoImprevistos(tenantId),
      ])
    } finally {
      cargando.value = false
    }
  },
  { immediate: true },
)

const presupuestoSeleccionado = computed(
  () => presupuestoStore.presupuestos.find((p) => p.id === props.presupuestoId) ?? null,
)

// BUDGET_NOT_RECONCILED / FINANCIACION_EXCEDE_PRESUPUESTO solo se exigen
// al pasar de borrador a aprobado/vigente — en borrador es normal que
// todavía no cuadren.
const seExigeReconciliacion = computed(() => {
  const estado = presupuestoSeleccionado.value?.estado
  return estado === 'aprobado' || estado === 'vigente'
})

function formatoMoneda(valor: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(valor)
}

type EstadoCheck = 'ok' | 'error' | 'pendiente' | 'no_aplica'

interface CheckResultado {
  estado: EstadoCheck
  titulo: string
  detalle: string
  valor: string
}

// guard_presupuesto_reconciliado (E8) solo suma hojas de naturaleza
// 'egreso' contra monto_total — un rubro de ingreso no cuenta aquí.
const cuentaPorId = computed(() => new Map(presupuestoStore.cuentas.map((c) => [c.id, c])))
const sumaRubros = computed(() =>
  presupuestoStore.rubros
    .filter((r) => cuentaPorId.value.get(r.cuenta_id)?.naturaleza === 'egreso')
    .reduce((acc, r) => acc + Number(r.monto_anual), 0),
)
const sumaFuentesAplicadas = computed(() =>
  presupuestoStore.fuentes.reduce((acc, f) => acc + Number(f.valor_aplicado), 0),
)
const fuentesFondoImprevistos = computed(() =>
  presupuestoStore.fuentes.filter((f) => f.tipo === 'fondo_imprevistos'),
)

const checkRubros = computed<CheckResultado>(() => {
  const montoTotal = presupuestoSeleccionado.value
    ? Number(presupuestoSeleccionado.value.monto_total)
    : 0
  const coincide = sumaRubros.value === montoTotal
  return {
    estado: coincide ? 'ok' : seExigeReconciliacion.value ? 'error' : 'pendiente',
    titulo: 'Σ Rubros = Monto total del presupuesto',
    detalle:
      'BUDGET_NOT_RECONCILED — la suma de los rubros debe igualar el monto aprobado (exigido al pasar a aprobado/vigente).',
    valor: `${formatoMoneda(sumaRubros.value)} ${coincide ? '=' : '≠'} ${formatoMoneda(montoTotal)}`,
  }
})

const checkFuentes = computed<CheckResultado>(() => {
  const montoTotal = presupuestoSeleccionado.value
    ? Number(presupuestoSeleccionado.value.monto_total)
    : 0
  const ok = sumaFuentesAplicadas.value <= montoTotal
  return {
    estado: ok ? 'ok' : seExigeReconciliacion.value ? 'error' : 'pendiente',
    titulo: 'Σ Fuentes de financiación aplicadas ≤ Monto total',
    detalle: 'FINANCIACION_EXCEDE_PRESUPUESTO (exigido al pasar a aprobado/vigente).',
    valor: `${formatoMoneda(sumaFuentesAplicadas.value)} ${ok ? '≤' : '>'} ${formatoMoneda(montoTotal)}`,
  }
})

const checkFondo = computed<CheckResultado>(() => {
  if (fuentesFondoImprevistos.value.length === 0) {
    return {
      estado: 'no_aplica',
      titulo: 'Fondo de imprevistos — saldo suficiente',
      detalle: 'FI-003 — no hay fuentes de tipo fondo_imprevistos en este presupuesto.',
      valor: 'No aplica',
    }
  }
  const saldo = presupuestoStore.fondoImprevistos ?? 0
  const totalDisponible = fuentesFondoImprevistos.value.reduce(
    (acc, f) => acc + Number(f.valor_disponible),
    0,
  )
  const ok = totalDisponible <= saldo
  return {
    estado: ok ? 'ok' : 'error',
    titulo: 'Fondo de imprevistos — saldo suficiente',
    detalle:
      'FI-003 — valor_disponible declarado no debe exceder el saldo actual del fondo (se exige siempre, no solo al aprobar).',
    valor: `${formatoMoneda(totalDisponible)} ${ok ? '≤' : '>'} ${formatoMoneda(saldo)}`,
  }
})

const checks = computed(() => [checkRubros.value, checkFuentes.value, checkFondo.value])
const todoOk = computed(() =>
  checks.value.every((c) => c.estado === 'ok' || c.estado === 'no_aplica'),
)
</script>

<template>
  <div>
    <h2 class="text-lg font-semibold mb-2">Control y validaciones</h2>

    <p v-if="!presupuestoSeleccionado" class="text-sm text-gray-500">
      Selecciona un presupuesto para ver su estado de reconciliación.
    </p>
    <template v-else>
      <UAlert
        v-if="todoOk"
        color="success"
        variant="soft"
        :title="`Presupuesto ${presupuestoSeleccionado.anio} — v${presupuestoSeleccionado.version} reconciliado — sin inconsistencias detectadas`"
        class="mb-4"
      />
      <UAlert
        v-else
        color="warning"
        variant="soft"
        title="Hay inconsistencias pendientes — ver detalle abajo"
        class="mb-4"
      />

      <div class="space-y-2">
        <div
          v-for="check in checks"
          :key="check.titulo"
          class="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-800 p-3"
        >
          <span
            class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
            :class="{
              'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300':
                check.estado === 'ok',
              'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300':
                check.estado === 'error',
              'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300':
                check.estado === 'pendiente',
              'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400':
                check.estado === 'no_aplica',
            }"
          >
            {{
              check.estado === 'ok'
                ? '✓'
                : check.estado === 'error'
                  ? '✕'
                  : check.estado === 'pendiente'
                    ? '…'
                    : '—'
            }}
          </span>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium">{{ check.titulo }}</p>
            <p class="text-xs text-gray-500">{{ check.detalle }}</p>
          </div>
          <p class="text-sm font-medium shrink-0">{{ check.valor }}</p>
        </div>
      </div>

      <p class="text-xs text-gray-500 mt-3">
        Estos checks reflejan los guard triggers reales de Postgres — hoy solo se evalúan al
        intentar guardar; esta pestaña los muestra en cualquier momento, sin esperar a que un
        guardado falle.
      </p>
    </template>
  </div>
</template>
