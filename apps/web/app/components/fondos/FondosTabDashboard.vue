<script setup lang="ts">
// Pestaña "Fondos" — tarjetas con saldo/comprometido/disponible por fondo (fn_fondo_saldos),
// crear fondo y cambiar de estado (máquina de estados en guard_fondo_estado_transicion,
// TRANSICIONES_ESTADO_FONDO solo evita ofrecer un botón que el guard rechazaría de todos modos).
//
// Vista de lista (además de la de tarjetas, "detalle"): mismas acciones y mismo estado
// compartido (fondoDetalle/fondoCerrar/cambiandoEstado), solo cambia cómo se pinta. Columnas
// tomadas 1:1 de columnas reales de `fondos` (codigo/tipo_id/objetivo/destinacion/meta/
// fecha_inicio/fecha_fin) — nada inventado que no tenga dato detrás.
import type { Database } from '@aquila/shared'
import type { ColumnaTabla } from '~/components/ui/UiTabla.vue'

type FondoRow = Database['public']['Tables']['fondos']['Row']
type ListaTipoRow = Database['public']['Tables']['lista_tipos']['Row']

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

// ── Vista de lista ───────────────────────────────────────────────────────
const vista = ref<'detalle' | 'lista'>('detalle')

const tiposFondo = ref<ListaTipoRow[]>([])
watchEffect(async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (tenantId) tiposFondo.value = await cargarListaTipos(tenantId, 'TIPO_FONDO')
})
const tipoPorId = computed(() => new Map(tiposFondo.value.map((t) => [t.id, t])))

const busqueda = ref('')
const filtroTipoId = ref<number | 'todos'>('todos')
const filtroEstado = ref<string | 'todos'>('todos')

const opcionesFiltroTipo = computed(() => [
  { value: 'todos' as const, label: 'Todos' },
  ...tiposFondo.value.map((t) => ({ value: t.id, label: t.nombre })),
])
const opcionesFiltroEstado = [
  { value: 'todos' as const, label: 'Todos' },
  ...Object.entries(ETIQUETA_ESTADO_FONDO).map(([value, label]) => ({ value, label })),
]

const fondosFiltrados = computed(() => {
  const termino = busqueda.value.trim().toLowerCase()
  return fondosStore.fondos.filter((f) => {
    if (filtroTipoId.value !== 'todos' && f.tipo_id !== filtroTipoId.value) return false
    if (filtroEstado.value !== 'todos' && f.estado !== filtroEstado.value) return false
    if (termino && !`${f.codigo} ${f.nombre}`.toLowerCase().includes(termino)) return false
    return true
  })
})

interface FilaTotalFondos {
  esTotal: true
}
type FilaListaFondos = FondoRow | FilaTotalFondos
function esFilaTotal(fila: FilaListaFondos): fila is FilaTotalFondos {
  return 'esTotal' in fila
}

const totales = computed(() => {
  let saldo = 0
  let comprometido = 0
  let disponible = 0
  let saldoConMeta = 0
  let meta = 0
  for (const f of fondosFiltrados.value) {
    const s = saldos(f.id)
    saldo += s.saldo
    comprometido += s.comprometido
    disponible += s.disponible
    if (f.meta !== null) {
      saldoConMeta += s.saldo
      meta += Number(f.meta)
    }
  }
  return { saldo, comprometido, disponible, avance: meta > 0 ? Math.round((saldoConMeta / meta) * 100) : null }
})

const filasTabla = computed<FilaListaFondos[]>(() =>
  fondosFiltrados.value.length > 0 ? [...fondosFiltrados.value, { esTotal: true }] : [],
)

const columnasLista: ColumnaTabla<FilaListaFondos>[] = [
  { clave: 'numero', etiqueta: '#' },
  { clave: 'nombre', etiqueta: 'Nombre del fondo' },
  { clave: 'tipo', etiqueta: 'Tipo' },
  { clave: 'objetivo', etiqueta: 'Objetivo / Destinación' },
  { clave: 'saldo', etiqueta: 'Saldo total', alinear: 'derecha' },
  { clave: 'comprometido', etiqueta: 'Comprometido', alinear: 'derecha' },
  { clave: 'disponible', etiqueta: 'Disponible', alinear: 'derecha' },
  { clave: 'avance', etiqueta: '% Avance' },
  { clave: 'estado', etiqueta: 'Estado' },
  { clave: 'vigencia', etiqueta: 'Vigencia' },
  { clave: 'operaciones', etiqueta: '' },
]

function avanceDe(fondo: FondoRow): number | null {
  if (fondo.meta === null) return null
  return Math.round((saldos(fondo.id).saldo / Number(fondo.meta)) * 100)
}

function fechaCorta(fecha: string): string {
  return new Date(fecha).toLocaleDateString('es-CO')
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-2 flex-wrap">
      <div class="flex rounded-md border border-neutral-200 dark:border-neutral-800 overflow-hidden">
        <UButton
          size="sm"
          :variant="vista === 'detalle' ? 'solid' : 'ghost'"
          :color="vista === 'detalle' ? 'primary' : 'neutral'"
          icon="i-lucide-layout-grid"
          class="rounded-none"
          @click="vista = 'detalle'"
        >
          Tarjetas
        </UButton>
        <UButton
          size="sm"
          :variant="vista === 'lista' ? 'solid' : 'ghost'"
          :color="vista === 'lista' ? 'primary' : 'neutral'"
          icon="i-lucide-list"
          class="rounded-none"
          @click="vista = 'lista'"
        >
          Lista
        </UButton>
      </div>
      <UButton v-if="puedeConfigurar" icon="i-lucide-plus" @click="mostrarDrawerCrear = true">Nuevo fondo</UButton>
    </div>

    <p v-if="fondosStore.fondos.length === 0" class="text-neutral-500 text-sm">
      Esta copropiedad todavía no tiene fondos registrados.
    </p>

    <template v-else-if="vista === 'detalle'">
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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
    </template>

    <template v-else>
      <div class="flex items-end gap-3 flex-wrap">
        <UInput v-model="busqueda" icon="i-lucide-search" placeholder="Buscar fondos…" class="min-w-56" />
        <UFormField label="Tipo">
          <USelect v-model="filtroTipoId" :items="opcionesFiltroTipo" class="w-40" />
        </UFormField>
        <UFormField label="Estado">
          <USelect v-model="filtroEstado" :items="opcionesFiltroEstado" class="w-44" />
        </UFormField>
      </div>

      <UiTabla
        :columnas="columnasLista"
        :filas="filasTabla"
        :clave-fila="(f, i) => (esFilaTotal(f) ? '__total__' : f.id)"
        vacio="Ningún fondo coincide con el filtro."
      >
        <template #celda-numero="{ fila, indice }">
          <span v-if="!esFilaTotal(fila)" class="text-neutral-500 tabular-nums">{{ indice + 1 }}</span>
        </template>
        <template #celda-nombre="{ fila }">
          <div v-if="esFilaTotal(fila)" class="font-semibold">Total</div>
          <div v-else class="flex items-center gap-2">
            <span
              class="flex size-7 shrink-0 items-center justify-center rounded-full"
              :class="CLASE_AVATAR_TIPO_FONDO[tipoPorId.get(fila.tipo_id)?.codigo ?? ''] ?? CLASE_AVATAR_TIPO_FONDO_GENERICO"
            >
              <UIcon :name="ICONO_TIPO_FONDO[tipoPorId.get(fila.tipo_id)?.codigo ?? ''] ?? 'i-lucide-piggy-bank'" class="size-3.5" />
            </span>
            <div>
              <p class="font-medium leading-tight">{{ fila.nombre }}</p>
              <p class="text-xs text-neutral-500 leading-tight">{{ fila.codigo }}</p>
            </div>
          </div>
        </template>
        <template #celda-tipo="{ fila }">
          <UBadge
            v-if="!esFilaTotal(fila)"
            :color="COLOR_TIPO_FONDO[tipoPorId.get(fila.tipo_id)?.codigo ?? ''] ?? 'neutral'"
            variant="subtle"
          >
            {{ tipoPorId.get(fila.tipo_id)?.nombre ?? '—' }}
          </UBadge>
        </template>
        <template #celda-objetivo="{ fila }">
          <span v-if="!esFilaTotal(fila)">{{ fila.objetivo ?? fila.destinacion ?? '—' }}</span>
        </template>
        <template #celda-saldo="{ fila }">
          <span class="tabular-nums" :class="esFilaTotal(fila) ? 'font-semibold' : ''">
            {{ formatoMoneda(esFilaTotal(fila) ? totales.saldo : saldos(fila.id).saldo) }}
          </span>
        </template>
        <template #celda-comprometido="{ fila }">
          <span class="tabular-nums" :class="esFilaTotal(fila) ? 'font-semibold' : ''">
            {{ formatoMoneda(esFilaTotal(fila) ? totales.comprometido : saldos(fila.id).comprometido) }}
          </span>
        </template>
        <template #celda-disponible="{ fila }">
          <span class="tabular-nums" :class="esFilaTotal(fila) ? 'font-semibold' : ''">
            {{ formatoMoneda(esFilaTotal(fila) ? totales.disponible : saldos(fila.id).disponible) }}
          </span>
        </template>
        <template #celda-avance="{ fila }">
          <div v-if="esFilaTotal(fila)" class="flex items-center gap-2">
            <template v-if="totales.avance !== null">
              <UProgress :model-value="totales.avance" class="w-20" />
              <span class="text-xs font-semibold tabular-nums">{{ totales.avance }}%</span>
            </template>
            <span v-else class="text-neutral-500">—</span>
          </div>
          <div v-else class="flex items-center gap-2">
            <template v-if="avanceDe(fila) !== null">
              <UProgress :model-value="avanceDe(fila) ?? 0" class="w-20" />
              <span class="text-xs tabular-nums">{{ avanceDe(fila) }}%</span>
            </template>
            <span v-else class="text-neutral-500">—</span>
          </div>
        </template>
        <template #celda-estado="{ fila }">
          <UBadge v-if="!esFilaTotal(fila)" :color="COLOR_ESTADO_FONDO[fila.estado] ?? 'neutral'" variant="subtle">
            {{ ETIQUETA_ESTADO_FONDO[fila.estado] ?? fila.estado }}
          </UBadge>
        </template>
        <template #celda-vigencia="{ fila }">
          <span v-if="!esFilaTotal(fila)" class="text-xs">
            <template v-if="fila.fecha_inicio">
              {{ fechaCorta(fila.fecha_inicio) }} — {{ fila.fecha_fin ? fechaCorta(fila.fecha_fin) : 'Indefinida' }}
            </template>
            <template v-else>—</template>
          </span>
        </template>
        <template #celda-operaciones="{ fila }">
          <div v-if="!esFilaTotal(fila)" class="flex items-center justify-end gap-1">
            <UButton
              size="xs"
              variant="ghost"
              icon="i-lucide-eye"
              square
              aria-label="Autorizaciones y fuentes"
              @click="fondoDetalle = fila"
            />
            <UDropdownMenu
              v-if="puedeConfigurar && (TRANSICIONES_ESTADO_FONDO[fila.estado]?.length ?? 0) > 0"
              :items="[
                (TRANSICIONES_ESTADO_FONDO[fila.estado] ?? []).map((e) => ({
                  label: ETIQUETA_ESTADO_FONDO[e] ?? e,
                  onSelect: () => cambiarEstado(fila, e as Database['public']['Enums']['fondo_estado_t']),
                })),
              ]"
            >
              <UButton size="xs" variant="ghost" icon="i-lucide-more-horizontal" square :loading="cambiandoEstado === fila.id" />
            </UDropdownMenu>
          </div>
        </template>
      </UiTabla>
    </template>

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
