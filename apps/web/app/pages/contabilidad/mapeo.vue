<script setup lang="ts">
// PC-6 · Mapeo: el puente entre lo que la copropiedad ya opera y su representación contable.
//
// Dos secciones, porque hay exactamente dos formas de que un movimiento encuentre su cuenta:
//   • las partidas del presupuesto, que la traen de su mapeo N:1 (varias partidas pueden
//     compartir cuenta: 19 "Torre N" → 5405, y lo que las distingue es la dimensión);
//   • los eventos, para lo que no nace del árbol presupuestal — cartera, bancos, proveedores,
//     deterioro, cierre.
//
// Arriba va lo que falta, no lo que está bien: mientras queden pendientes no se puede exportar,
// así que esa lista ES la tarea de esta pantalla.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:create' })

const tenantStore = useTenantStore()
const contabilidadStore = useContabilidadStore()

const error = ref<string | null>(null)
const guardando = ref<string | null>(null)
const busqueda = ref('')
const soloSinMapear = ref(false)
const pestanaActiva = ref<'partidas' | 'eventos'>('partidas')
const PESTANAS = [
  { label: 'Partidas del presupuesto', value: 'partidas' as const },
  { label: 'Cuentas predeterminadas por evento', value: 'eventos' as const },
]

async function recargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await Promise.all([
    contabilidadStore.cargarPlan(tenantId),
    contabilidadStore.cargarCuentasPresupuestales(tenantId),
    contabilidadStore.cargarEventos(tenantId),
    contabilidadStore.cargarDefaults(tenantId),
    contabilidadStore.cargarPendientes(tenantId),
  ])
}

await useAsyncData('contable-mapeo', async () => {
  await recargar()
  return true
})

/** Solo las hojas activas reciben imputación: los nodos agrupadores del árbol presupuestal no
 * llevan monto ni movimiento, así que mapearlos no significaría nada. */
const partidas = computed(() => {
  const termino = busqueda.value.trim().toLowerCase()
  return contabilidadStore.cuentasPresupuestales
    .filter((c) => c.es_hoja && c.activa)
    .filter((c) => !soloSinMapear.value || c.contable_cuenta_id === null)
    .filter(
      (c) =>
        !termino ||
        c.nombre.toLowerCase().includes(termino) ||
        c.codigo.toLowerCase().includes(termino),
    )
})

/** El guard de BD exige que la clase concuerde con la naturaleza (egreso → 5 o 6, ingreso → 4).
 * Filtrar aquí evita ofrecer opciones que la base va a rechazar: el error existe igual, pero no
 * es forma de descubrir la regla. */
function opcionesPara(naturaleza: string): { label: string; value: string | null }[] {
  const clases = naturaleza === 'egreso' ? [5, 6] : [4]
  return [
    { label: '— Sin mapear —', value: null },
    ...contabilidadStore.cuentasDeMovimiento
      .filter((c) => clases.includes(c.clase))
      .map((c) => ({ label: `${c.codigo} · ${c.nombre}`, value: c.id })),
  ]
}

const opcionesEvento = computed(() => [
  ...contabilidadStore.cuentasDeMovimiento.map((c) => ({
    label: `${c.codigo} · ${c.nombre}`,
    value: c.id,
  })),
])

const defaultPorEvento = computed(
  () => new Map(contabilidadStore.defaults.map((d) => [d.evento_id, d.contable_cuenta_id])),
)

const sinMapear = computed(
  () =>
    contabilidadStore.cuentasPresupuestales.filter(
      (c) => c.es_hoja && c.activa && c.contable_cuenta_id === null,
    ).length,
)

async function mapear(cuentaId: string, contableCuentaId: string | null): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  guardando.value = cuentaId
  error.value = null
  try {
    await contabilidadStore.mapearCuentaPresupuestal(tenantId, cuentaId, contableCuentaId)
    await contabilidadStore.cargarPendientes(tenantId)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo guardar el mapeo.')
    await contabilidadStore.cargarCuentasPresupuestales(tenantId)
  } finally {
    guardando.value = null
  }
}

async function asignarEvento(eventoId: number, contableCuentaId: string): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  guardando.value = String(eventoId)
  error.value = null
  try {
    await contabilidadStore.guardarDefault(tenantId, eventoId, contableCuentaId)
    await contabilidadStore.cargarPendientes(tenantId)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo guardar la cuenta predeterminada.')
  } finally {
    guardando.value = null
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <UiTituloDescripcion clase-descripcion="text-sm text-muted mt-1 max-w-2xl">
        <template #titulo>
          <h1 class="text-xl font-semibold">Mapeo contable</h1>
        </template>
        <template #descripcion>
          Dónde se refleja contablemente cada cosa que la copropiedad ya registra. Mientras
          queden pendientes, la exportación de movimientos queda bloqueada.
        </template>
      </UiTituloDescripcion>
      <UButton variant="ghost" icon="i-lucide-list-tree" to="/contabilidad/plan-de-cuentas">
        Ver plan de cuentas
      </UButton>
    </div>

    <UAlert v-if="error" color="error" variant="soft" :title="error" />

    <UAlert
      v-if="contabilidadStore.pendientes.length === 0"
      color="success"
      variant="soft"
      icon="i-lucide-check-circle-2"
      title="Parametrización completa"
      description="Todo lo que la copropiedad registra tiene cuenta contable. Ya se pueden exportar los movimientos."
    />
    <UAlert
      v-else
      color="warning"
      variant="soft"
      icon="i-lucide-triangle-alert"
      :title="`${contabilidadStore.pendientes.length} pendiente(s) por resolver`"
    >
      <template #description>
        <ul class="list-disc pl-5 space-y-1 text-xs mt-1">
          <li v-for="(p, i) in contabilidadStore.pendientes.slice(0, 10)" :key="i">
            <span class="font-medium">{{ p.referencia }}</span> — {{ p.detalle }}
          </li>
        </ul>
        <p v-if="contabilidadStore.pendientes.length > 10" class="text-xs mt-1">
          …y {{ contabilidadStore.pendientes.length - 10 }} más.
        </p>
      </template>
    </UAlert>

    <div class="flex items-center gap-2 flex-wrap">
      <UInput
        v-if="pestanaActiva === 'partidas'"
        v-model="busqueda"
        icon="i-lucide-search"
        placeholder="Buscar partida…"
        class="w-64"
        :ui="{ trailing: 'pr-8' }"
      >
        <template v-if="busqueda" #trailing>
          <button
            type="button"
            class="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
            @click="busqueda = ''"
          >
            <UIcon name="i-lucide-x" class="size-3.5" />
          </button>
        </template>
      </UInput>
      <UCheckbox
        v-if="pestanaActiva === 'partidas'"
        v-model="soloSinMapear"
        label="Solo sin mapear"
      />
    </div>

    <UTabs
      :items="PESTANAS" :model-value="pestanaActiva" variant="link" :content="false" class="w-full"
      @update:model-value="(v) => (pestanaActiva = v as typeof pestanaActiva)"
    />

    <!-- ══════ Partidas presupuestales ══════ -->
    <section v-if="pestanaActiva === 'partidas'" class="space-y-3">
      <div class="flex items-center gap-2 flex-wrap">
        <UBadge v-if="sinMapear > 0" color="warning" variant="subtle" size="xs">
          {{ sinMapear }} sin mapear
        </UBadge>
        <p class="text-xs text-muted">
          Varias partidas pueden apuntar a la misma cuenta contable — el detalle que las separa
          (torre, centro de costo) viaja como dimensión del movimiento, no como cuenta distinta.
        </p>
      </div>

      <UiTabla
        :columnas="[
          { clave: 'partida', etiqueta: 'Partida presupuestal' },
          { clave: 'naturaleza', etiqueta: 'Naturaleza' },
          { clave: 'cuenta', etiqueta: 'Cuenta contable' },
        ]"
        :filas="partidas"
        :clave-fila="(fila) => fila.id"
        :vacio="soloSinMapear ? 'No queda ninguna partida sin mapear.' : 'Sin partidas.'"
      >
        <template #celda-partida="{ fila }">
          <span class="text-sm">{{ fila.nombre }}</span>
          <span class="text-xs text-muted"> · {{ fila.codigo }}</span>
        </template>
        <template #celda-naturaleza="{ fila }">
          <UBadge
            :color="fila.naturaleza === 'egreso' ? 'error' : 'success'"
            variant="subtle"
            size="xs"
          >
            {{ fila.naturaleza === 'egreso' ? 'Egreso' : 'Ingreso' }}
          </UBadge>
        </template>
        <template #celda-cuenta="{ fila }">
          <USelect
            :model-value="fila.contable_cuenta_id"
            :items="opcionesPara(fila.naturaleza)"
            value-key="value"
            :loading="guardando === fila.id"
            class="w-80"
            @update:model-value="(v: string | null) => mapear(fila.id, v)"
          />
        </template>
      </UiTabla>
    </section>

    <!-- ══════ Eventos ══════ -->
    <section v-else class="space-y-3">
      <p class="text-xs text-muted">
        Lo que no nace del árbol presupuestal: la cartera que se debita al causar una cuota, el
        banco donde entra un recaudo, la cuenta por pagar de un gasto pendiente.
      </p>

      <UiTabla
        :columnas="[
          { clave: 'evento', etiqueta: 'Evento' },
          { clave: 'cuenta', etiqueta: 'Cuenta contable' },
        ]"
        :filas="contabilidadStore.eventos"
        :clave-fila="(fila) => fila.id"
        vacio="Sin eventos en el catálogo."
      >
        <template #celda-evento="{ fila }">
          <div>
            <span class="text-sm">{{ fila.nombre }}</span>
            <p v-if="fila.descripcion" class="text-xs text-muted">{{ fila.descripcion }}</p>
          </div>
        </template>
        <template #celda-cuenta="{ fila }">
          <USelect
            :model-value="defaultPorEvento.get(fila.id) ?? undefined"
            :items="opcionesEvento"
            value-key="value"
            placeholder="Elegir cuenta…"
            :loading="guardando === String(fila.id)"
            class="w-80"
            @update:model-value="(v: string) => asignarEvento(fila.id, v)"
          />
        </template>
      </UiTabla>
    </section>
  </div>
</template>
