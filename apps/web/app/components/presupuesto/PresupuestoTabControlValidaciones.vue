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
        presupuestoStore.cargarTiposFuente(tenantId),
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


type EstadoCheck = 'ok' | 'error' | 'pendiente' | 'no_aplica'

// El glifo (✓/✕/…/—) es aria-hidden — sin esto un lector de pantalla no anuncia nada
// significativo sobre el estado del check.
const ETIQUETA_ESTADO_CHECK: Record<EstadoCheck, string> = {
  ok: 'Cumple',
  error: 'No cumple',
  pendiente: 'Pendiente',
  no_aplica: 'No aplica',
}

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
// El tipo de fuente pasó de enum a lista_tipos (20260830210000): se resuelve por `codigo`, no
// por id, igual que guard_fuente_financiacion — así una fila que el tenant haya creado con el
// código 'fondo_imprevistos' dispara el mismo check FI-003 que la de plataforma.
const idsTipoFondoImprevistos = computed(
  () =>
    new Set(
      presupuestoStore.tiposFuente.filter((t) => t.codigo === 'fondo_imprevistos').map((t) => t.id),
    ),
)
const fuentesFondoImprevistos = computed(() =>
  presupuestoStore.fuentes.filter((f) => idsTipoFondoImprevistos.value.has(f.tipo_id)),
)

const checkRubros = computed<CheckResultado>(() => {
  const montoTotal = presupuestoSeleccionado.value
    ? Number(presupuestoSeleccionado.value.monto_total)
    : 0
  const coincide = sumaRubros.value === montoTotal
  return {
    estado: coincide ? 'ok' : seExigeReconciliacion.value ? 'error' : 'pendiente',
    titulo: 'Rubros de egreso = Monto total del presupuesto',
    detalle:
      'La suma de los rubros de egreso debe igualar el monto total aprobado en asamblea — se exige al aprobar o activar el presupuesto.',
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
    titulo: 'Fuentes de financiación aplicadas ≤ Monto total',
    detalle:
      'Las fuentes de financiación aplicadas no pueden superar el monto total del presupuesto — se exige al aprobar o activar.',
    valor: `${formatoMoneda(sumaFuentesAplicadas.value)} ${ok ? '≤' : '>'} ${formatoMoneda(montoTotal)}`,
  }
})

const checkFondo = computed<CheckResultado>(() => {
  if (fuentesFondoImprevistos.value.length === 0) {
    return {
      estado: 'no_aplica',
      titulo: 'Fondo de imprevistos — saldo suficiente',
      detalle: 'No hay fuentes de tipo "Fondo de imprevistos" registradas en este presupuesto.',
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
      'El valor disponible declarado no puede superar el saldo actual del fondo de imprevistos — se valida siempre, no solo al aprobar.',
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
    <p v-if="!presupuestoSeleccionado" class="text-sm text-neutral-500">
      Selecciona un presupuesto para ver su estado de reconciliación.
    </p>
    <!-- `cargando` estaba estampado pero nunca leído en la plantilla: la vista pintaba los
         checks contra lo que hubiera en el store en ese instante (rubros/fuentes vacíos o de
         otro presupuesto) antes de que la carga terminara, en vez de esperar. -->
    <div v-else-if="cargando" class="space-y-2" role="status" aria-label="Cargando estado de reconciliación">
      <USkeleton v-for="n in 3" :key="n" class="h-[68px] w-full rounded-lg" />
    </div>
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
          class="flex items-center gap-3 rounded-lg border border-neutral-200 dark:border-neutral-800 p-3"
        >
          <span
            class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
            :class="{
              'bg-success-100 text-success-700 dark:bg-success-900/40 dark:text-success-300':
                check.estado === 'ok',
              'bg-error-100 text-error-700 dark:bg-error-900/40 dark:text-error-300':
                check.estado === 'error',
              'bg-warning-100 text-warning-700 dark:bg-warning-900/40 dark:text-warning-300':
                check.estado === 'pendiente',
              'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400':
                check.estado === 'no_aplica',
            }"
            :aria-label="ETIQUETA_ESTADO_CHECK[check.estado]"
          >
            <span aria-hidden="true">{{
              check.estado === 'ok'
                ? '✓'
                : check.estado === 'error'
                  ? '✕'
                  : check.estado === 'pendiente'
                    ? '…'
                    : '—'
            }}</span>
          </span>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium">{{ check.titulo }}</p>
            <p class="text-xs text-neutral-500">{{ check.detalle }}</p>
          </div>
          <p class="text-sm font-medium shrink-0 tabular-nums">{{ check.valor }}</p>
        </div>
      </div>

      <p class="text-xs text-neutral-500 mt-3">
        Estas reglas siempre se validan al guardar — esta pestaña te las muestra por adelantado,
        sin esperar a que un guardado falle para descubrir el problema.
      </p>
    </template>
  </div>
</template>
