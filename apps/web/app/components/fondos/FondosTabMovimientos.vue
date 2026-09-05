<script setup lang="ts">
// Pestaña "Movimientos" — el ledger append-only de un fondo (fondo_movimientos).
import type { Database } from '@aquila/shared'
import type { ColumnaTabla } from '~/components/ui/UiTabla.vue'

type FondoMovimientoRow = Database['public']['Tables']['fondo_movimientos']['Row']

const tenantStore = useTenantStore()
const fondosStore = useFondosStore()
const fondoId = useSeleccionFondo()

const puedeRegistrar = computed(() => tenantStore.puede('data:create'))
const mostrarDrawer = ref(false)

watch(
  fondoId,
  async (id) => {
    if (id) await fondosStore.cargarMovimientos(id)
  },
  { immediate: true },
)

const columnas: ColumnaTabla<FondoMovimientoRow>[] = [
  { clave: 'fecha', etiqueta: 'Fecha' },
  { clave: 'tipo', etiqueta: 'Tipo' },
  { clave: 'monto', etiqueta: 'Monto', alinear: 'derecha' },
  { clave: 'descripcion', etiqueta: 'Descripción' },
]

function signo(tipo: string): string {
  const entra = ENTRA_AL_SALDO[tipo]
  return entra === true ? '+' : entra === false ? '−' : ''
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-end justify-between gap-4 flex-wrap">
      <FondosFondoSelector v-model="fondoId" />
      <UButton v-if="puedeRegistrar && fondoId" icon="i-lucide-plus" @click="mostrarDrawer = true">
        Registrar movimiento
      </UButton>
    </div>

    <USkeleton v-if="fondosStore.loading" class="h-40 w-full" />
    <UiTabla
      v-else
      :columnas="columnas"
      :filas="fondosStore.movimientos"
      :clave-fila="(f) => f.id"
      vacio="Este fondo no tiene movimientos registrados."
    >
      <template #celda-tipo="{ fila }">{{ ETIQUETA_TIPO_MOVIMIENTO_FONDO[fila.tipo] ?? fila.tipo }}</template>
      <template #celda-monto="{ fila }">
        <span class="tabular-nums">{{ signo(fila.tipo) }}{{ formatoMoneda(Math.abs(Number(fila.monto))) }}</span>
      </template>
      <template #celda-descripcion="{ fila }">{{ fila.descripcion ?? '—' }}</template>
    </UiTabla>

    <FondosFondoMovimientoDrawer
      v-if="mostrarDrawer && fondoId"
      :fondo-id="fondoId"
      @cerrar="mostrarDrawer = false"
      @creado="mostrarDrawer = false"
    />
  </div>
</template>
