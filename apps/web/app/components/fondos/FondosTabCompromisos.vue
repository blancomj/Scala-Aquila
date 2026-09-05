<script setup lang="ts">
// Pestaña "Compromisos" — reservas del disponible de un fondo (fondo_compromisos, R9).
import type { Database } from '@aquila/shared'
import type { ColumnaTabla } from '~/components/ui/UiTabla.vue'

type FondoCompromisoRow = Database['public']['Tables']['fondo_compromisos']['Row']
type FondoCompromisoEstado = Database['public']['Enums']['fondo_compromiso_estado_t']

/** Transiciones que tiene sentido ofrecer como acción manual desde esta tabla —
 * 'comprometido'→'ejecutado'/'liberado' normalmente los deriva el uso real contra el compromiso
 * (recalcular_ejecutado_compromiso), pero liberar/anular sin ejecutar todo también es una
 * decisión legítima (Modelo §14: la obligación ya no se materializa). */
const TRANSICIONES_MANUALES: Partial<Record<FondoCompromisoEstado, FondoCompromisoEstado[]>> = {
  proyectado: ['comprometido', 'anulado'],
  comprometido: ['liberado', 'anulado'],
  parcialmente_ejecutado: ['liberado'],
}

const tenantStore = useTenantStore()
const fondosStore = useFondosStore()
const toast = useToast()
const fondoId = useSeleccionFondo()

const puedeRegistrar = computed(() => tenantStore.puede('data:create'))
const mostrarDrawer = ref(false)
const cambiandoEstado = ref<string | null>(null)

watch(
  fondoId,
  async (id) => {
    if (id) await fondosStore.cargarCompromisos(id)
  },
  { immediate: true },
)

const columnas: ColumnaTabla<FondoCompromisoRow>[] = [
  { clave: 'concepto', etiqueta: 'Concepto' },
  { clave: 'monto', etiqueta: 'Monto', alinear: 'derecha' },
  { clave: 'monto_ejecutado', etiqueta: 'Ejecutado', alinear: 'derecha' },
  { clave: 'estado', etiqueta: 'Estado' },
  { clave: 'fecha_limite', etiqueta: 'Fecha límite' },
  { clave: 'operaciones', etiqueta: '' },
]

async function cambiarEstado(compromiso: FondoCompromisoRow, estado: FondoCompromisoEstado): Promise<void> {
  if (!fondoId.value) return
  cambiandoEstado.value = compromiso.id
  try {
    await fondosStore.cambiarEstadoCompromiso(compromiso.id, fondoId.value, estado)
    toast.add({ title: `Compromiso pasó a ${ETIQUETA_ESTADO_COMPROMISO[estado] ?? estado}.`, color: 'success' })
  } catch (excepcion) {
    toast.add({ title: mensajeError(excepcion, 'No se pudo cambiar el estado.'), color: 'error' })
  } finally {
    cambiandoEstado.value = null
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-end justify-between gap-4 flex-wrap">
      <FondosFondoSelector v-model="fondoId" />
      <UButton v-if="puedeRegistrar && fondoId" icon="i-lucide-plus" @click="mostrarDrawer = true">
        Nuevo compromiso
      </UButton>
    </div>

    <USkeleton v-if="fondosStore.loading" class="h-40 w-full" />
    <UiTabla
      v-else
      :columnas="columnas"
      :filas="fondosStore.compromisos"
      :clave-fila="(f) => f.id"
      vacio="Este fondo no tiene compromisos registrados."
    >
      <template #celda-monto="{ fila }">{{ formatoMoneda(fila.monto) }}</template>
      <template #celda-monto_ejecutado="{ fila }">{{ formatoMoneda(fila.monto_ejecutado) }}</template>
      <template #celda-estado="{ fila }">
        <UBadge :color="COLOR_ESTADO_COMPROMISO[fila.estado] ?? 'neutral'" variant="subtle">
          {{ ETIQUETA_ESTADO_COMPROMISO[fila.estado] ?? fila.estado }}
        </UBadge>
      </template>
      <template #celda-fecha_limite="{ fila }">{{ fila.fecha_limite ?? '—' }}</template>
      <template #celda-operaciones="{ fila }">
        <UDropdownMenu
          v-if="puedeRegistrar && (TRANSICIONES_MANUALES[fila.estado]?.length ?? 0) > 0"
          :items="[
            (TRANSICIONES_MANUALES[fila.estado] ?? []).map((e) => ({
              label: ETIQUETA_ESTADO_COMPROMISO[e] ?? e,
              onSelect: () => cambiarEstado(fila, e),
            })),
          ]"
        >
          <UButton size="xs" variant="ghost" trailing-icon="i-lucide-chevron-down" :loading="cambiandoEstado === fila.id">
            Cambiar estado
          </UButton>
        </UDropdownMenu>
      </template>
    </UiTabla>

    <FondosFondoCompromisoDrawer
      v-if="mostrarDrawer && fondoId"
      :fondo-id="fondoId"
      @cerrar="mostrarDrawer = false"
      @creado="mostrarDrawer = false"
    />
  </div>
</template>
