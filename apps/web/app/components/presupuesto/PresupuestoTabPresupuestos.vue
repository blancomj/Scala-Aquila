<script setup lang="ts">
// Pestaña "Presupuestos" del rediseño de Presupuesto — tabla real, sin
// panel de detalle lateral: toda la info relevante (estado, vigencia, acta)
// vive en la tabla, seleccionar una fila solo actualiza el mismo
// presupuestoSeleccionadoId que usa el resto de las pestañas (v-model), no
// mantiene un estado de selección propio.
//
// Estado como badge de color (mockup "Libro Presupuestal"): "vigente" en
// gris plano no comunica nada por sí solo — ver utils/presupuesto-labels.ts.
defineProps<{ presupuestoId: string | null }>()
const emit = defineEmits<{ 'update:presupuestoId': [id: string] }>()

const tenantStore = useTenantStore()
const presupuestoStore = usePresupuestoStore()
const documentosStore = useDocumentosStore()

const drawerAbierto = ref(false)
const errorActivar = ref<string | null>(null)
const presupuestoAActivar = ref<{ id: string; anio: number; version: number } | null>(null)

// ── activar: captura fecha de aprobación + vigencia + acta de asamblea ──
const MIME_ACTA_PERMITIDOS = new Set(['application/pdf', 'image/jpeg', 'image/png'])
const TAMANO_MAXIMO_ACTA = 15 * 1024 * 1024
const hoyISO = new Date().toISOString().slice(0, 10)
const fechaAprobacionActivar = ref(hoyISO)
const vigenteDesdeActivar = ref(hoyISO)
const vigenteHastaActivar = ref(hoyISO)
const archivoActaActivar = ref<File | null>(null)
const errorArchivoActa = ref<string | null>(null)

function pedirConfirmacionActivar(fila: { id: string; anio: number; version: number }): void {
  presupuestoAActivar.value = fila
  fechaAprobacionActivar.value = hoyISO
  vigenteDesdeActivar.value = hoyISO
  // Por defecto rige hasta el cierre del año fiscal del propio presupuesto — editable por si
  // la copropiedad ya sabe que lo va a reemplazar antes (p. ej. un cambio de estatutos a mitad
  // de año), en vez de forzar siempre el 31 de diciembre.
  vigenteHastaActivar.value = `${fila.anio}-12-31`
  archivoActaActivar.value = null
  errorArchivoActa.value = null
}

function elegirArchivoActa(evento: Event): void {
  const input = evento.target as HTMLInputElement
  const archivo = input.files?.[0] ?? null
  errorArchivoActa.value = null
  if (archivo && (!MIME_ACTA_PERMITIDOS.has(archivo.type) || archivo.size > TAMANO_MAXIMO_ACTA)) {
    errorArchivoActa.value = 'Solo PDF, JPG o PNG, hasta 15 MB.'
    archivoActaActivar.value = null
    input.value = ''
    return
  }
  archivoActaActivar.value = archivo
}

function formatoMoneda(valor: string | number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(valor))
}

function vigenciaTexto(desde: string | null, hasta: string | null): string {
  if (!desde && !hasta) return '—'
  return `${desde ?? '—'} – ${hasta ?? '—'}`
}

const activandoId = ref<string | null>(null)

async function confirmarActivarPresupuesto(): Promise<void> {
  const fila = presupuestoAActivar.value
  if (!fila) return

  errorActivar.value = null
  if (!fechaAprobacionActivar.value || !vigenteDesdeActivar.value || !vigenteHastaActivar.value) {
    errorActivar.value = 'Completa la fecha de aprobación y la vigencia.'
    return
  }
  if (vigenteHastaActivar.value < vigenteDesdeActivar.value) {
    errorActivar.value = '"Vigente hasta" no puede ser anterior a "Vigente desde".'
    return
  }
  if (!archivoActaActivar.value) {
    errorActivar.value = 'Adjunta el acta de asamblea que respalda la aprobación.'
    return
  }
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return

  activandoId.value = fila.id
  try {
    const tiposDocumento = await cargarListaTipos(tenantId, 'TIPO_DOCUMENTO')
    const tipoActaId = tiposDocumento.find((t) => t.codigo === 'acta_presupuesto')?.id
    if (!tipoActaId) throw new Error('No se encontró el tipo de documento "Acta de presupuesto".')

    const descripcion = `Acta de presupuesto ${fila.anio}`
    await documentosStore.subirDocumento({
      tenantId,
      inmuebleId: null,
      tipoDocumentoId: tipoActaId,
      archivo: archivoActaActivar.value,
      descripcion,
    })
    await presupuestoStore.activarPresupuesto(fila.id, tenantId, {
      fechaAprobacion: fechaAprobacionActivar.value,
      vigenteDesde: vigenteDesdeActivar.value,
      vigenteHasta: vigenteHastaActivar.value,
      actaAsamblea: descripcion,
    })
    presupuestoAActivar.value = null
    emit('update:presupuestoId', fila.id)
  } catch (excepcion) {
    errorActivar.value = mensajeError(excepcion, 'No se pudo activar el presupuesto.')
  } finally {
    activandoId.value = null
  }
}

function onCreado(id: string): void {
  drawerAbierto.value = false
  emit('update:presupuestoId', id)
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-2">
      <h2 class="text-lg font-semibold">Presupuestos</h2>
      <UButton size="xs" @click="drawerAbierto = true">Nuevo presupuesto</UButton>
    </div>

    <UiTabla
      :columnas="[
        { clave: 'anio', etiqueta: 'Año / Versión' },
        { clave: 'monto', etiqueta: 'Monto total', alinear: 'derecha' },
        { clave: 'estado', etiqueta: 'Estado' },
        { clave: 'vigencia', etiqueta: 'Vigencia' },
        { clave: 'aprobacion', etiqueta: 'Fecha aprobación' },
        { clave: 'acta', etiqueta: 'Acta asamblea' },
        { clave: 'acciones', etiqueta: '' },
      ]"
      :filas="presupuestoStore.presupuestos"
      :clave-fila="(fila) => fila.id"
      vacio="Ninguno."
    >
      <template #celda-anio="{ fila }">
        <button
          type="button"
          class="text-left hover:underline"
          :class="{ 'font-semibold': fila.id === presupuestoId }"
          @click="emit('update:presupuestoId', fila.id)"
        >
          {{ fila.anio }} — v{{ fila.version }}
        </button>
      </template>
      <template #celda-monto="{ fila }">
        <span class="tabular-nums">{{ formatoMoneda(fila.monto_total) }}</span>
      </template>
      <template #celda-estado="{ fila }">
        <UBadge :color="COLOR_ESTADO_PRESUPUESTO[fila.estado] ?? 'neutral'" variant="subtle">
          {{ ETIQUETA_ESTADO_PRESUPUESTO[fila.estado] ?? fila.estado }}
        </UBadge>
      </template>
      <template #celda-vigencia="{ fila }">
        <span class="text-neutral-500">{{
          vigenciaTexto(fila.vigente_desde, fila.vigente_hasta)
        }}</span>
      </template>
      <template #celda-aprobacion="{ fila }">
        <span class="text-neutral-500">{{ fila.fecha_aprobacion ?? '—' }}</span>
      </template>
      <template #celda-acta="{ fila }">
        <span class="text-neutral-500">{{ fila.acta_asamblea ?? '—' }}</span>
      </template>
      <template #celda-acciones="{ fila }">
        <UButton
          v-if="fila.estado === 'borrador'"
          size="xs"
          variant="soft"
          :loading="activandoId === fila.id"
          @click="pedirConfirmacionActivar(fila)"
        >
          Activar
        </UButton>
      </template>
    </UiTabla>

    <PresupuestoCrearDrawer
      v-if="drawerAbierto"
      @cerrar="drawerAbierto = false"
      @creado="onCreado"
    />

    <UModal
      :open="presupuestoAActivar !== null"
      title="¿Activar este presupuesto?"
      @update:open="(abierto) => { if (!abierto) presupuestoAActivar = null }"
    >
      <template #body>
        <div v-if="presupuestoAActivar" class="space-y-4 text-sm">
          <p>
            Vas a activar el presupuesto <strong>{{ presupuestoAActivar.anio }} — v{{ presupuestoAActivar.version }}</strong>.
          </p>
          <p class="text-neutral-500">
            Al activarlo pasa a estado <strong>Vigente</strong>: sus valores empiezan a cobrarse a las
            unidades y el presupuesto queda inmutable — ya no podrás editarlo, cualquier corrección
            requiere crear una versión nueva.
          </p>

          <UFormField label="Fecha de aprobación" name="fecha_aprobacion">
            <UInput v-model="fechaAprobacionActivar" type="date" class="w-full" />
          </UFormField>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Vigente desde" name="vigente_desde">
              <UInput v-model="vigenteDesdeActivar" type="date" class="w-full" />
            </UFormField>
            <UFormField
              label="Vigente hasta"
              name="vigente_hasta"
              help="Por defecto, el cierre del año fiscal — ajústala si ya sabes que este presupuesto se reemplaza antes."
            >
              <UInput v-model="vigenteHastaActivar" type="date" class="w-full" />
            </UFormField>
          </div>

          <UFormField
            label="Acta de asamblea"
            name="acta_asamblea"
            help="Respaldo de la aprobación (Ley 675/2001, art. 47) — queda en Documentos de la copropiedad."
          >
            <div class="flex items-center gap-3 border border-neutral-200 rounded-sm p-3">
              <UIcon name="i-lucide-file-text" class="size-5 text-neutral-400 shrink-0" />
              <div class="flex-1 min-w-0">
                <p class="truncate">{{ archivoActaActivar ? archivoActaActivar.name : 'Selecciona el acta desde tu equipo' }}</p>
                <span class="text-xs text-neutral-500">PDF, JPG o PNG · hasta 15 MB</span>
              </div>
              <UInput type="file" accept=".pdf,.jpg,.jpeg,.png" class="max-w-[180px]" @change="elegirArchivoActa" />
            </div>
            <UAlert v-if="errorArchivoActa" color="error" variant="soft" :title="errorArchivoActa" class="mt-2" />
          </UFormField>

          <UAlert v-if="errorActivar" color="error" variant="soft" :title="errorActivar" />
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="presupuestoAActivar = null">Cancelar</UButton>
          <UButton :loading="activandoId === presupuestoAActivar?.id" @click="confirmarActivarPresupuesto">
            Activar
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
