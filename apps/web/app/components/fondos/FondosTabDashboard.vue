<script setup lang="ts">
// Pestaña "Fondos" — tarjetas con saldo/comprometido/disponible por fondo (fn_fondo_saldos),
// crear fondo y cambiar de estado (máquina de estados en guard_fondo_estado_transicion,
// TRANSICIONES_ESTADO_FONDO solo evita ofrecer un botón que el guard rechazaría de todos modos).
import type { Database } from '@aquila/shared'

type FondoRow = Database['public']['Tables']['fondos']['Row']

const tenantStore = useTenantStore()
const fondosStore = useFondosStore()
const toast = useToast()

const puedeConfigurar = computed(() => tenantStore.puede('settings:manage'))

const mostrarDrawerCrear = ref(false)
const fondoDetalle = ref<FondoRow | null>(null)
const fondoCerrar = ref<FondoRow | null>(null)
const cambiandoEstado = ref<string | null>(null)

function saldos(fondoId: string) {
  return fondosStore.saldosPorFondo[fondoId] ?? { saldo: 0, comprometido: 0, disponible: 0 }
}

/** guard_fondo_cierre_completo (BLOQUE O) exige saldo 0 para pasar a cerrado — con saldo > 0 la
 * página abre FondoCerrarDrawer a decidir el remanente en vez de llamar cambiarEstadoFondo
 * directo, para no chocar con un error crudo de Postgres (Modelo §35/§36). */
async function cambiarEstado(fondo: FondoRow, estado: Database['public']['Enums']['fondo_estado_t']): Promise<void> {
  if (estado === 'cerrado' && saldos(fondo.id).saldo > 0) {
    fondoCerrar.value = fondo
    return
  }

  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  cambiandoEstado.value = fondo.id
  try {
    await fondosStore.cambiarEstadoFondo(fondo.id, tenantId, estado)
    toast.add({ title: `${fondo.codigo} pasó a ${ETIQUETA_ESTADO_FONDO[estado] ?? estado}.`, color: 'success' })
  } catch (excepcion) {
    toast.add({ title: mensajeError(excepcion, 'No se pudo cambiar el estado.'), color: 'error' })
  } finally {
    cambiandoEstado.value = null
  }
}

function cerrado(): void {
  const fondo = fondoCerrar.value
  fondoCerrar.value = null
  if (fondo) toast.add({ title: `${fondo.codigo} se cerró.`, color: 'success' })
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex justify-end">
      <UButton v-if="puedeConfigurar" icon="i-lucide-plus" @click="mostrarDrawerCrear = true">Nuevo fondo</UButton>
    </div>

    <p v-if="fondosStore.fondos.length === 0" class="text-neutral-500 text-sm">
      Esta copropiedad todavía no tiene fondos registrados.
    </p>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      <div
        v-for="fondo in fondosStore.fondos"
        :key="fondo.id"
        class="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 space-y-3"
      >
        <div class="flex items-start justify-between gap-2">
          <div>
            <p class="text-xs text-neutral-500">{{ fondo.codigo }}</p>
            <h3 class="font-semibold">{{ fondo.nombre }}</h3>
            <p class="text-xs text-neutral-500">{{ ETIQUETA_NATURALEZA_FONDO[fondo.naturaleza] ?? fondo.naturaleza }}</p>
          </div>
          <div class="flex flex-col items-end gap-1">
            <UBadge :color="COLOR_ESTADO_FONDO[fondo.estado] ?? 'neutral'" variant="subtle">
              {{ ETIQUETA_ESTADO_FONDO[fondo.estado] ?? fondo.estado }}
            </UBadge>
            <UBadge v-if="fondo.permanente" color="neutral" variant="outline">Permanente</UBadge>
          </div>
        </div>

        <div class="grid grid-cols-3 gap-2 text-center">
          <div>
            <p class="text-[11px] uppercase tracking-wide text-neutral-400">Saldo</p>
            <p class="text-sm font-medium tabular-nums">{{ formatoMoneda(saldos(fondo.id).saldo) }}</p>
          </div>
          <div>
            <p class="text-[11px] uppercase tracking-wide text-neutral-400">Comprometido</p>
            <p class="text-sm font-medium tabular-nums">{{ formatoMoneda(saldos(fondo.id).comprometido) }}</p>
          </div>
          <div>
            <p class="text-[11px] uppercase tracking-wide text-neutral-400">Disponible</p>
            <p class="text-sm font-medium tabular-nums">{{ formatoMoneda(saldos(fondo.id).disponible) }}</p>
          </div>
        </div>

        <p v-if="fondo.meta !== null" class="text-xs text-neutral-500">
          Meta: {{ formatoMoneda(fondo.meta) }} ({{ Math.round((saldos(fondo.id).saldo / Number(fondo.meta)) * 100) }}%)
        </p>

        <div class="flex items-center justify-between gap-2 pt-1 border-t border-neutral-100 dark:border-neutral-900">
          <UButton size="xs" variant="soft" @click="fondoDetalle = fondo">Autorizaciones y fuentes</UButton>
          <UDropdownMenu
            v-if="puedeConfigurar && (TRANSICIONES_ESTADO_FONDO[fondo.estado]?.length ?? 0) > 0"
            :items="[
              (TRANSICIONES_ESTADO_FONDO[fondo.estado] ?? []).map((e) => ({
                label: ETIQUETA_ESTADO_FONDO[e] ?? e,
                onSelect: () => cambiarEstado(fondo, e as Database['public']['Enums']['fondo_estado_t']),
              })),
            ]"
          >
            <UButton size="xs" variant="ghost" trailing-icon="i-lucide-chevron-down" :loading="cambiandoEstado === fondo.id">
              Cambiar estado
            </UButton>
          </UDropdownMenu>
        </div>
      </div>
    </div>

    <FondosFondoCrearDrawer
      v-if="mostrarDrawerCrear"
      @cerrar="mostrarDrawerCrear = false"
      @creado="mostrarDrawerCrear = false"
    />
    <FondosFondoDetalleDrawer v-if="fondoDetalle" :fondo="fondoDetalle" @cerrar="fondoDetalle = null" />
    <FondosFondoCerrarDrawer
      v-if="fondoCerrar"
      :fondo="fondoCerrar"
      :saldo="saldos(fondoCerrar.id).saldo"
      @cerrar="fondoCerrar = null"
      @cerrado="cerrado"
    />
  </div>
</template>
