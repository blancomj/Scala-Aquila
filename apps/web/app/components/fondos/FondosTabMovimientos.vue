<script setup lang="ts">
// Pestaña "Movimientos" — el ledger append-only de un fondo (fondo_movimientos).
// "Ver detalle" abre motivo/soporte, que la tabla no muestra por columna — el soporte en
// particular (D-42) solo vivía en el drawer de registro, sin forma de revisarlo después.
import type { Database } from '@aquila/shared'
import type { ColumnaTabla } from '~/components/ui/UiTabla.vue'

type FondoMovimientoRow = Database['public']['Tables']['fondo_movimientos']['Row']
type DocumentoSoporte = Pick<Database['public']['Tables']['documentos']['Row'], 'nombre_archivo' | 'storage_path'>

const fondosStore = useFondosStore()
const documentosStore = useDocumentosStore()
const tenantStore = useTenantStore()
const toast = useToast()
const fondoId = useSeleccionFondo()

const puedeRegistrar = computed(() => tenantStore.puede('data:create'))
const mostrarDrawer = ref(false)
const movimientoDetalle = ref<FondoMovimientoRow | null>(null)
const documentoDelDetalle = ref<DocumentoSoporte | null>(null)
const cargandoSoporte = ref(false)
const abriendoSoporte = ref(false)

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
  { clave: 'operaciones', etiqueta: '' },
]

function signo(tipo: string): string {
  const entra = ENTRA_AL_SALDO[tipo]
  return entra === true ? '+' : entra === false ? '−' : ''
}

// documento_id apunta a la versión exacta que respaldó el movimiento, no a "la vigente hoy" de
// su grupo — v_documento_vigente (y el store que lee de ahí) solo expone la última versión de
// cada grupo_id, así que una versión ya superada por una subida posterior sin relación quedaría
// invisible ahí. Un ledger append-only necesita poder resolver siempre el soporte exacto que
// citó (documentoPorId lee la tabla base, sin ese filtro).
async function verDetalle(fila: FondoMovimientoRow): Promise<void> {
  movimientoDetalle.value = fila
  documentoDelDetalle.value = null
  if (!fila.documento_id) return
  cargandoSoporte.value = true
  try {
    documentoDelDetalle.value = await documentosStore.documentoPorId(fila.documento_id)
  } catch (excepcion) {
    toast.add({ title: mensajeError(excepcion, 'No se pudo cargar el soporte del movimiento.'), color: 'error' })
  } finally {
    cargandoSoporte.value = false
  }
}

async function verSoporte(): Promise<void> {
  const storagePath = documentoDelDetalle.value?.storage_path
  if (!storagePath) return
  abriendoSoporte.value = true
  try {
    const url = await documentosStore.urlDescarga(storagePath)
    window.open(url, '_blank', 'noopener')
  } catch (excepcion) {
    toast.add({ title: mensajeError(excepcion, 'No se pudo generar el enlace del soporte.'), color: 'error' })
  } finally {
    abriendoSoporte.value = false
  }
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
      <template #celda-operaciones="{ fila }">
        <UButton size="xs" variant="ghost" icon="i-lucide-eye" @click="verDetalle(fila)">Ver detalle</UButton>
      </template>
    </UiTabla>

    <FondosFondoMovimientoDrawer
      v-if="mostrarDrawer && fondoId"
      :fondo-id="fondoId"
      @cerrar="mostrarDrawer = false"
      @creado="mostrarDrawer = false"
    />

    <UModal :open="movimientoDetalle !== null" title="Detalle del movimiento" @update:open="movimientoDetalle = null">
      <template #body>
        <div v-if="movimientoDetalle" class="space-y-3 text-sm">
          <div class="flex justify-between gap-4">
            <span class="text-neutral-500 dark:text-neutral-400">Tipo</span>
            <span>{{ ETIQUETA_TIPO_MOVIMIENTO_FONDO[movimientoDetalle.tipo] ?? movimientoDetalle.tipo }}</span>
          </div>
          <div class="flex justify-between gap-4">
            <span class="text-neutral-500 dark:text-neutral-400">Monto</span>
            <span class="tabular-nums">
              {{ signo(movimientoDetalle.tipo) }}{{ formatoMoneda(Math.abs(Number(movimientoDetalle.monto))) }}
            </span>
          </div>
          <div class="flex justify-between gap-4">
            <span class="text-neutral-500 dark:text-neutral-400">Fecha</span>
            <span>{{ movimientoDetalle.fecha }}</span>
          </div>
          <div class="flex justify-between gap-4">
            <span class="text-neutral-500 dark:text-neutral-400">Descripción</span>
            <span class="text-right">{{ movimientoDetalle.descripcion ?? '—' }}</span>
          </div>
          <div v-if="movimientoDetalle.motivo" class="flex justify-between gap-4">
            <span class="text-neutral-500 dark:text-neutral-400">Motivo</span>
            <span class="text-right">{{ movimientoDetalle.motivo }}</span>
          </div>
          <div class="flex justify-between items-center gap-4 pt-2 border-t border-neutral-200 dark:border-neutral-800">
            <span class="text-neutral-500 dark:text-neutral-400">Soporte</span>
            <USkeleton v-if="cargandoSoporte" class="h-6 w-32" />
            <UButton
              v-else-if="documentoDelDetalle"
              size="xs"
              variant="soft"
              icon="i-lucide-paperclip"
              :loading="abriendoSoporte"
              @click="verSoporte"
            >
              {{ documentoDelDetalle.nombre_archivo }}
            </UButton>
            <span v-else class="text-neutral-500 dark:text-neutral-400">Sin soporte adjunto</span>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end w-full">
          <UButton color="neutral" variant="ghost" @click="movimientoDetalle = null">Cerrar</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
