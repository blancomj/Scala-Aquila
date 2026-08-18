<script setup lang="ts">
// Pestaña "Periodos y Vigencia" — expone por primera vez en UI los campos
// de vigencia del presupuesto (ya existen en la tabla, nunca se
// mostraban).
//
// Relación periodo↔presupuesto: RESUELTO (E9, ver
// 20260823270000_presupuesto_ejecucion.sql) — deliberadamente sigue sin
// existir una FK periodo_id→presupuesto_id. presupuesto_cuenta_ejecucion()
// ya cruza ambos por año fiscal (periodos.anio = presupuestos.anio) y
// funciona correctamente: un presupuesto es siempre anual, y "el
// presupuesto vigente de este año" ya es unívoco por
// presupuestos_vigente_unico (un solo vigente por tenant+año). Una FK
// explícita no agregaría información — solo replicaría lo que el año ya
// determina — y complicaría el versionado (¿a qué versión del año
// engancha cada periodo cuando se crea una v2?). Esta pestaña ahora
// filtra por ese mismo criterio (año), en vez de listar todos los
// periodos del tenant sin relación visible con el presupuesto elegido.
const props = defineProps<{ presupuestoId: string | null }>()

const tenantStore = useTenantStore()
const presupuestoStore = usePresupuestoStore()
const liquidacionStore = useLiquidacionStore()

const cargando = ref(false)

onMounted(async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || liquidacionStore.periodos.length > 0) return
  cargando.value = true
  try {
    await liquidacionStore.cargarPeriodos(tenantId)
  } finally {
    cargando.value = false
  }
})

const presupuestoSeleccionado = computed(
  () => presupuestoStore.presupuestos.find((p) => p.id === props.presupuestoId) ?? null,
)

/** Mismo criterio que presupuesto_cuenta_ejecucion() (E9): el año fiscal del presupuesto es la
 * relación con periodos, no una FK. */
const periodosDelAnio = computed(() => {
  const anio = presupuestoSeleccionado.value?.anio
  if (anio === undefined) return []
  return liquidacionStore.periodos.filter((p) => p.anio === anio)
})
</script>

<template>
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <div>
      <h2 class="text-lg font-semibold mb-2">Vigencia del presupuesto</h2>
      <p v-if="!presupuestoSeleccionado" class="text-sm text-gray-500">
        Selecciona un presupuesto para ver su vigencia.
      </p>
      <dl
        v-else
        class="space-y-2 text-sm rounded-lg border border-gray-200 dark:border-gray-800 p-4"
      >
        <div class="flex justify-between gap-2">
          <dt class="text-gray-500">Vigente desde</dt>
          <dd>{{ presupuestoSeleccionado.vigente_desde ?? '—' }}</dd>
        </div>
        <div class="flex justify-between gap-2">
          <dt class="text-gray-500">Vigente hasta</dt>
          <dd>{{ presupuestoSeleccionado.vigente_hasta ?? '—' }}</dd>
        </div>
        <div class="flex justify-between gap-2">
          <dt class="text-gray-500">Fecha de aprobación</dt>
          <dd>{{ presupuestoSeleccionado.fecha_aprobacion ?? '—' }}</dd>
        </div>
        <div class="flex justify-between gap-2">
          <dt class="text-gray-500">Acta de asamblea</dt>
          <dd>{{ presupuestoSeleccionado.acta_asamblea ?? '—' }}</dd>
        </div>
        <div class="flex justify-between gap-2">
          <dt class="text-gray-500">Estado</dt>
          <dd>{{ presupuestoSeleccionado.estado }}</dd>
        </div>
      </dl>
    </div>

    <div>
      <h2 class="text-lg font-semibold mb-2">Periodos de liquidación</h2>
      <p class="text-sm text-gray-500 mb-2">
        Periodos de {{ presupuestoSeleccionado?.anio ?? '—' }}, el año fiscal de este presupuesto
        — no hay una FK periodo↔presupuesto explícita (no hace falta: un presupuesto es siempre
        anual y solo puede haber uno vigente por año, así que el año ya determina la relación).
      </p>
      <UiTabla
        :columnas="[
          { clave: 'periodo', etiqueta: 'Periodo' },
          { clave: 'estado', etiqueta: 'Estado' },
          { clave: 'vencimiento', etiqueta: 'Vencimiento' },
        ]"
        :filas="periodosDelAnio"
        :clave-fila="(fila) => fila.id"
        :vacio="cargando ? 'Cargando…' : 'Sin periodos para este año todavía.'"
      >
        <template #celda-periodo="{ fila }"
          >{{ fila.anio }}-{{ String(fila.mes).padStart(2, '0') }}</template
        >
        <template #celda-estado="{ fila }"
          ><span class="text-gray-500">{{ fila.estado }}</span></template
        >
        <template #celda-vencimiento="{ fila }">
          <span class="text-gray-500">{{ fila.fecha_vencimiento ?? '—' }}</span>
        </template>
      </UiTabla>
    </div>
  </div>
</template>
