<script setup lang="ts">
// Liquidación en dos tiempos (plan 2026-08-24 §5/L7).
//
// Antes esta pantalla era una tabla de periodos con un botón «Liquidar» que
// hacía todo de golpe e irreversiblemente. Ahora es un selector de periodo
// más el panel donde ocurre el flujo: simular → solicitar → aprobar →
// aplicar, con la anulación como salida de emergencia.
//
// La lista se mantiene arriba, y no en una página aparte, porque liquidar es
// una tarea mensual en la que interesa ver de un vistazo qué meses ya están
// cerrados y cuál toca ahora — esa comparación se pierde si hay que navegar.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:create' })

const tenantStore = useTenantStore()
const liquidacionStore = useLiquidacionStore()

const periodoSeleccionadoId = ref<string | null>(null)
const mostrarCrear = ref(false)
const nuevoAnio = ref<number | null>(new Date().getFullYear())
// undefined, no null: USelect representa "sin elegir" como undefined y con
// null el tipo no encaja.
const nuevoMes = ref<number | undefined>(undefined)
const nuevaFechaVencimiento = ref('')
const creandoPeriodo = ref(false)
const errorPeriodo = ref<string | null>(null)

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const ESTADO_UI: Record<
  string,
  { etiqueta: string; color: 'success' | 'error' | 'warning' | 'info' | 'neutral' }
> = {
  pre_liquidada: { etiqueta: 'Pre-liquidada', color: 'warning' },
  pendiente_aprobacion: { etiqueta: 'Pendiente', color: 'info' },
  rechazada: { etiqueta: 'Rechazada', color: 'warning' },
  aplicada: { etiqueta: 'Aplicada', color: 'success' },
  anulada: { etiqueta: 'Anulada', color: 'error' },
  fallida: { etiqueta: 'Fallida', color: 'error' },
}

await useAsyncData('liquidacion-periodos', async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return []
  const [periodos] = await Promise.all([
    liquidacionStore.cargarPeriodos(tenantId),
    liquidacionStore.cargarLiquidaciones(tenantId),
  ])
  return periodos
})

/** La liquidación VIVA de cada periodo. Las descartadas y anuladas quedan
 * fuera: son historia, y mostrarlas en la lista haría parecer que un periodo
 * tiene varias liquidaciones a la vez cuando solo puede tener una. */
const liquidacionPorPeriodo = computed(() => {
  const mapa = new Map<string, (typeof liquidacionStore.liquidaciones)[number]>()
  const relevantes: string[] = ['aplicada', 'pendiente_aprobacion', 'pre_liquidada', 'rechazada']
  for (const l of liquidacionStore.liquidaciones) {
    if (!relevantes.includes(l.estado)) continue
    const previa = mapa.get(l.periodo_id)
    // Si hay varias, gana la más avanzada en el flujo.
    if (!previa || relevantes.indexOf(l.estado) < relevantes.indexOf(previa.estado)) {
      mapa.set(l.periodo_id, l)
    }
  }
  return mapa
})

const periodoSeleccionado = computed(
  () => liquidacionStore.periodos.find((p) => p.id === periodoSeleccionadoId.value) ?? null,
)
const liquidacionSeleccionada = computed(() =>
  periodoSeleccionadoId.value
    ? (liquidacionPorPeriodo.value.get(periodoSeleccionadoId.value) ?? null)
    : null,
)

// Al entrar, se abre el primer periodo que pida atención: el más reciente sin
// liquidar. Si están todos liquidados, el más reciente sin más.
watchEffect(() => {
  if (periodoSeleccionadoId.value !== null || liquidacionStore.periodos.length === 0) return
  const pendiente = liquidacionStore.periodos.find(
    (p) => liquidacionPorPeriodo.value.get(p.id)?.estado !== 'aplicada',
  )
  periodoSeleccionadoId.value = (pendiente ?? liquidacionStore.periodos[0])?.id ?? null
})

const mesesDisponibles = computed(() => {
  const usados = new Set(
    liquidacionStore.periodos
      .filter((p) => p.anio === nuevoAnio.value)
      .map((p) => p.mes),
  )
  return MESES.map((nombre, i) => ({ label: nombre, value: i + 1, disabled: usados.has(i + 1) }))
})


async function crearPeriodo(): Promise<void> {
  errorPeriodo.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || nuevoAnio.value === null || nuevoMes.value === undefined) return

  creandoPeriodo.value = true
  try {
    const creado = await liquidacionStore.crearPeriodo({
      tenantId,
      anio: nuevoAnio.value,
      mes: nuevoMes.value,
      fechaVencimiento: nuevaFechaVencimiento.value || undefined,
    })
    periodoSeleccionadoId.value = creado.id
    nuevoMes.value = undefined
    nuevaFechaVencimiento.value = ''
    mostrarCrear.value = false
  } catch (excepcion) {
    errorPeriodo.value = mensajeError(excepcion, 'No se pudo crear el periodo.')
  } finally {
    creandoPeriodo.value = false
  }
}

async function recargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await Promise.all([
    liquidacionStore.cargarPeriodos(tenantId),
    liquidacionStore.cargarLiquidaciones(tenantId),
  ])
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <h1 class="text-xl font-semibold">Liquidación</h1>
        <p class="text-sm text-muted">
          Calcula sin comprometer nada, revisa y aplica cuando esté correcto.
        </p>
      </div>
      <UButton size="sm" variant="soft" icon="i-lucide-plus" @click="mostrarCrear = true">
        Nuevo periodo
      </UButton>
    </div>

    <p v-if="liquidacionStore.periodos.length === 0" class="text-sm text-muted">
      Esta copropiedad todavía no tiene periodos. Crea el primero para empezar a liquidar.
    </p>

    <template v-else>
      <!-- ── selector de periodo ────────────────────────────────────── -->
      <div class="flex gap-2 overflow-x-auto pb-1">
        <button
          v-for="p in liquidacionStore.periodos"
          :key="p.id"
          type="button"
          class="shrink-0 rounded-md border px-3 py-2 text-left transition-colors"
          :class="
            p.id === periodoSeleccionadoId
              ? 'border-primary bg-primary/5'
              : 'border-default hover:bg-elevated'
          "
          :aria-pressed="p.id === periodoSeleccionadoId"
          :aria-label="`${MESES[p.mes - 1]} ${p.anio} — ${
            ESTADO_UI[liquidacionPorPeriodo.get(p.id)?.estado ?? '']?.etiqueta ?? 'sin liquidar'
          }`"
          @click="periodoSeleccionadoId = p.id"
        >
          <span class="block text-sm font-medium whitespace-nowrap">
            {{ MESES[p.mes - 1] }} {{ p.anio }}
          </span>
          <span class="mt-1 flex items-center gap-1.5">
            <UBadge
              v-if="liquidacionPorPeriodo.get(p.id)"
              :color="ESTADO_UI[liquidacionPorPeriodo.get(p.id)!.estado]?.color ?? 'neutral'"
              variant="subtle"
              size="xs"
            >
              {{ ESTADO_UI[liquidacionPorPeriodo.get(p.id)!.estado]?.etiqueta }}
            </UBadge>
            <UBadge v-else color="neutral" variant="subtle" size="xs">Sin liquidar</UBadge>
            <span
              v-if="liquidacionPorPeriodo.get(p.id)?.estado === 'aplicada'"
              class="text-xs text-muted tabular-nums whitespace-nowrap"
            >
              {{ formatoMoneda(liquidacionPorPeriodo.get(p.id)!.tenant_total) }}
            </span>
          </span>
        </button>
      </div>

      <!-- ── el panel del periodo elegido ───────────────────────────── -->
      <div v-if="periodoSeleccionado" class="rounded-lg border border-default p-5">
        <LiquidacionPanel
          :key="periodoSeleccionado.id"
          :periodo="periodoSeleccionado"
          :liquidacion="liquidacionSeleccionada"
          @cambio="recargar"
        />
      </div>
    </template>

    <!-- ── crear periodo ────────────────────────────────────────────── -->
    <UModal
      :open="mostrarCrear"
      title="Nuevo periodo"
      @update:open="(v) => !v && (mostrarCrear = false)"
    >
      <template #body>
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Año" name="anio">
              <UInput v-model.number="nuevoAnio" type="number" min="2000" class="w-full" />
            </UFormField>
            <UFormField label="Mes" name="mes">
              <USelect
                v-model="nuevoMes"
                :items="mesesDisponibles"
                value-key="value"
                placeholder="Elegir"
                class="w-full"
              />
            </UFormField>
          </div>
          <UFormField label="Fecha de vencimiento" name="fecha_vencimiento">
            <UInput v-model="nuevaFechaVencimiento" type="date" class="w-full" />
            <p class="text-xs text-muted mt-1">
              Requerida para liquidar: sin ella no se puede calcular la mora de los cargos que
              genere el periodo, ni ahora ni después.
            </p>
          </UFormField>
          <UAlert v-if="errorPeriodo" color="error" variant="soft" :title="errorPeriodo" />
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="outline" @click="mostrarCrear = false">
            Cancelar
          </UButton>
          <UButton
            :disabled="nuevoAnio === null || nuevoMes === undefined"
            :loading="creandoPeriodo"
            @click="crearPeriodo"
          >
            Crear periodo
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
