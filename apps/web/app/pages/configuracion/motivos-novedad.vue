<script setup lang="ts">
// Mapa "motivo de novedad -> cuenta de ingreso" (novedad_tipo_cuenta,
// 20260830240000). Existe para sacar esa decisión contable de la pantalla
// de Novedades: antes, quien registraba una sanción tenía que elegir a mano
// entre 19 cuentas en cada captura. Es una regla estable de la copropiedad
// ("una Sanción siempre va bajo Sanción por inasistencia"), así que se
// define una vez aquí y el trigger aplicar_novedad_cuenta_por_tipo la aplica
// sola al crear cada novedad.
//
// Solo cuentas hoja + naturaleza=ingreso, mismo criterio que
// guard_novedad_tipo_cuenta (y que guard_novedad_tipo_presupuesto sobre la
// novedad ya creada) — la lista de opciones se filtra igual que el guard
// para que no se pueda elegir algo que la BD va a rechazar.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'settings:manage' })

const tenantStore = useTenantStore()
const cuentaStore = useCuentaCorrienteStore()
const presupuestoStore = usePresupuestoStore()

const guardandoTipoId = ref<number | null>(null)
const error = ref<string | null>(null)

await useAsyncData('motivos-novedad-base', async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return null
  await Promise.all([
    cuentaStore.cargarTiposNovedad(tenantId),
    cuentaStore.cargarNovedadTipoCuenta(tenantId),
    presupuestoStore.cargarCuentas(tenantId),
  ])
  return null
})

const opcionesCuenta = computed(() =>
  presupuestoStore.cuentas
    .filter((c) => c.es_hoja && c.naturaleza === 'ingreso')
    .map((c) => ({ valor: c.id, etiqueta: `${c.codigo} · ${c.nombre}` })),
)
// Con la opción "Sin asignar" al frente — separado de opcionesCuenta porque ese otro computed
// también decide si mostrar el aviso de "todavía no hay cuentas de ingreso" (length === 0).
const opcionesCuentaSelector = computed(() => [
  { valor: null, etiqueta: '— Sin asignar —' },
  ...opcionesCuenta.value,
])

const cuentaPorTipo = computed(
  () => new Map(cuentaStore.novedadTipoCuenta.map((m) => [m.tipo_novedad_id, m.presupuesto_cuenta_id])),
)

const sinAsignar = computed(
  () => cuentaStore.tiposNovedad.filter((t) => !cuentaPorTipo.value.has(t.id)).length,
)

async function asignar(tipoNovedadId: number, valor: string): Promise<void> {
  error.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return

  guardandoTipoId.value = tipoNovedadId
  try {
    await cuentaStore.guardarNovedadTipoCuenta({
      tenantId,
      tipoNovedadId,
      presupuestoCuentaId: valor === '' ? null : valor,
    })
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo guardar la asignación.')
  } finally {
    guardandoTipoId.value = null
  }
}
</script>

<template>
  <div class="space-y-6">
    <UiTituloDescripcion clase-descripcion="text-sm text-muted mt-1 max-w-2xl">
      <template #titulo>
        <h1 class="text-xl font-semibold">Motivos de novedad</h1>
      </template>
      <template #descripcion>
        Define una sola vez bajo qué cuenta de ingreso se explica cada motivo. Al registrar una
        novedad solo se elige el motivo — la cuenta se asigna sola, sin pedirle esa decisión a
        quien la captura.
      </template>
    </UiTituloDescripcion>

    <UAlert v-if="error" color="error" variant="soft" :title="error" />

    <UAlert
      v-if="opcionesCuenta.length === 0"
      color="warning"
      variant="soft"
      title="Todavía no hay cuentas de ingreso"
      description="Los motivos solo pueden vincularse a cuentas hoja de naturaleza ingreso. Crea el plan de cuentas en Presupuesto antes de configurar esto."
    />

    <template v-else>
      <p v-if="sinAsignar > 0" class="text-sm text-muted">
        {{ sinAsignar }} de {{ cuentaStore.tiposNovedad.length }} motivos todavía sin cuenta. Las
        novedades con un motivo sin asignar se registran igual, pero no se reflejan en la ejecución
        del presupuesto.
      </p>
      <p v-else class="text-sm text-muted">Todos los motivos tienen cuenta asignada.</p>

      <UiTabla
        :columnas="[
          { clave: 'motivo', etiqueta: 'Motivo' },
          { clave: 'cuenta', etiqueta: 'Cuenta de ingreso' },
        ]"
        :filas="cuentaStore.tiposNovedad"
        :clave-fila="(tipo) => tipo.id"
      >
        <template #celda-motivo="{ fila }">
          <span class="font-medium">{{ fila.nombre }}</span>
        </template>
        <template #celda-cuenta="{ fila }">
          <div class="flex items-center gap-2">
            <UiSelectorBuscable
              :model-value="cuentaPorTipo.get(fila.id) ?? null"
              :opciones="opcionesCuentaSelector"
              placeholder="— Sin asignar —"
              :deshabilitado="guardandoTipoId === fila.id"
              class="w-full max-w-md"
              @update:model-value="(v) => asignar(fila.id, (v as string) ?? '')"
            />
            <span v-if="guardandoTipoId === fila.id" class="text-xs text-muted">Guardando…</span>
          </div>
        </template>
      </UiTabla>
    </template>
  </div>
</template>
