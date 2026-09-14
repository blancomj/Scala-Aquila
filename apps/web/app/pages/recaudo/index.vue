<script setup lang="ts">
// Módulo de recaudo (RC-5) — listado tenant-wide de pagos con su recibo de
// caja, filtros por fecha/inmueble/forma de pago, totales por forma de
// pago, y las acciones Ver recibo / Reenviar / Anular.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:create' })

const tenantStore = useTenantStore()
const recaudoStore = useRecaudoStore()
const cuentaStore = useCuentaCorrienteStore()
const agrupacionesStore = useAgrupacionesStore()
const documentosStore = useDocumentosStore()
const toast = useToast()

const desde = ref('')
const hasta = ref('')
const inmuebleId = ref<string | null>(null)
const formaPagoCodigo = ref<string | null>(null)
const agrupacionId = ref<string | null>(null)

/** Ids de una agrupación y todo su subárbol, calculado en el cliente desde
 * agrupacionesStore.agrupaciones (ya cargado entero, es chico) — mismo
 * criterio que la función SQL agrupacion_subarbol(), pero sin round-trip:
 * esto alimenta un computed que debe reaccionar de inmediato al elegir la
 * ubicación, no esperar una consulta. cargarRecaudo() sigue usando la
 * versión SQL para el filtro real de los pagos. */
function subarbolIds(raizId: string): Set<string> {
  const hijosDe = new Map<string, string[]>()
  for (const a of agrupacionesStore.agrupaciones) {
    if (a.parent_id) {
      const lista = hijosDe.get(a.parent_id) ?? []
      lista.push(a.id)
      hijosDe.set(a.parent_id, lista)
    }
  }
  const resultado = new Set<string>([raizId])
  const pendientes = [raizId]
  while (pendientes.length > 0) {
    const actual = pendientes.pop() as string
    for (const hijo of hijosDe.get(actual) ?? []) {
      if (!resultado.has(hijo)) {
        resultado.add(hijo)
        pendientes.push(hijo)
      }
    }
  }
  return resultado
}

/** Cuando hay ubicación elegida, el selector de Inmueble solo ofrece los que
 * quedan dentro de esa agrupación (o su subárbol) — pedido del usuario: el
 * filtro de inmuebles debe respetar la condición de ubicación ya aplicada. */
const inmueblesPorUbicacion = computed(() => {
  if (!agrupacionId.value) return cuentaStore.inmuebles
  const ids = subarbolIds(agrupacionId.value)
  return cuentaStore.inmuebles.filter((i) => i.agrupacion_id !== null && ids.has(i.agrupacion_id))
})
const opcionesInmueble = computed(() => [
  { valor: null, etiqueta: 'Todos' },
  ...inmueblesPorUbicacion.value.map((i) => ({ valor: i.id, etiqueta: i.codigo })),
])
const opcionesFormaPago = computed(() => [
  { value: null, label: 'Todas' },
  ...cuentaStore.formasPago.map((f) => ({ value: f.codigo, label: f.nombre })),
])
const opcionesUbicacion = computed(() => [
  { valor: null, etiqueta: 'Todas' },
  ...agrupacionesStore.arbolPlano.map((n) => ({ valor: n.id, etiqueta: n.ruta })),
])

function alCambiarUbicacion(v: string | number | null): void {
  agrupacionId.value = v as string | null
  // El inmueble elegido pudo quedar fuera de la nueva ubicación — no se deja
  // un filtro de inmueble "fantasma" que ya no aparece en su propio selector.
  if (inmuebleId.value && !inmueblesPorUbicacion.value.some((i) => i.id === inmuebleId.value)) {
    inmuebleId.value = null
  }
  cargar()
}

const rutaPorAgrupacion = computed(() => new Map(agrupacionesStore.arbolPlano.map((n) => [n.id, n.ruta])))
function ubicacionDe(agrupacionIdInmueble: string | null): string {
  if (!agrupacionIdInmueble) return 'Sin agrupar'
  return rutaPorAgrupacion.value.get(agrupacionIdInmueble) ?? 'Sin agrupar'
}

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  if (desde.value && hasta.value && desde.value > hasta.value) {
    toast.add({ title: '"Desde" no puede ser posterior a "Hasta".', color: 'error' })
    return
  }
  await recaudoStore.cargarRecaudo(tenantId, {
    desde: desde.value || undefined,
    hasta: hasta.value || undefined,
    inmuebleId: inmuebleId.value ?? undefined,
    formaPagoCodigo: formaPagoCodigo.value ?? undefined,
    agrupacionId: agrupacionId.value ?? undefined,
  })
}

await useAsyncData('recaudo-base', async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return null
  await Promise.all([
    cuentaStore.cargarInmuebles(tenantId),
    cuentaStore.cargarFormasPago(tenantId),
    agrupacionesStore.cargarTiposAgrupacion(tenantId),
    agrupacionesStore.cargarAgrupaciones(tenantId),
  ])
  await cargar()
  return null
})

// activeTenant puede no estar resuelto en el instante exacto en que corre
// `recaudo-base` en la carga en frío — este watch reintenta solo en cuanto
// el id esté disponible, mismo patrón que cartera/acciones.vue.
watch(() => tenantStore.activeTenant?.id, cargar)

// Solo pagos reales (no reversas) cuentan en los totales — una reversa ya
// está representada restando implícitamente cuando se lee "recaudo neto",
// pero mostrarla como fila separada en la tabla es lo honesto (ver abajo).
const pagosReales = computed(() => recaudoStore.pagos.filter((p) => !p.es_reversa))

const totalGeneral = computed(() => pagosReales.value.reduce((acc, p) => acc + p.monto, 0))
const totalesPorForma = computed(() => {
  const mapa = new Map<string, number>()
  for (const p of pagosReales.value) {
    const clave = p.forma_pago_nombre ?? 'Sin forma de pago'
    mapa.set(clave, (mapa.get(clave) ?? 0) + p.monto)
  }
  return [...mapa.entries()].sort((a, b) => b[1] - a[1])
})

function irARecibo(reciboId: string): void {
  navigateTo(`/recibo-caja/${reciboId}`, { open: { target: '_blank' } })
}

const reenviando = ref<string | null>(null)
async function reenviar(reciboId: string): Promise<void> {
  reenviando.value = reciboId
  try {
    const resultado = await recaudoStore.reenviarRecibo(reciboId)
    toast.add({
      title: resultado.enviados.length > 0 ? `Reenviado a ${resultado.enviados.length} destinatario(s).` : 'Sin destinatarios con correo — copia el enlace desde el recibo.',
      color: resultado.enviados.length > 0 ? 'success' : 'warning',
    })
  } catch (excepcion) {
    toast.add({ title: mensajeError(excepcion, 'No se pudo reenviar el recibo.'), color: 'error' })
  } finally {
    reenviando.value = null
  }
}

// ── anular ───────────────────────────────────────────────────────────
const modalAnularAbierto = ref(false)
const pagoAnulando = ref<(typeof recaudoStore.pagos)[number] | null>(null)
const motivoAnulacion = ref('')
const anulando = ref(false)
const errorAnulacion = ref<string | null>(null)

function abrirAnular(pago: (typeof recaudoStore.pagos)[number]): void {
  pagoAnulando.value = pago
  motivoAnulacion.value = ''
  errorAnulacion.value = null
  modalAnularAbierto.value = true
}

async function confirmarAnular(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !pagoAnulando.value || !motivoAnulacion.value.trim()) return
  errorAnulacion.value = null
  anulando.value = true
  try {
    await cuentaStore.anularPago({
      pagoId: pagoAnulando.value.id,
      motivo: motivoAnulacion.value.trim(),
      tenantId,
      inmuebleId: pagoAnulando.value.inmueble_id,
    })
    modalAnularAbierto.value = false
    toast.add({ title: 'Pago anulado.', color: 'success' })
    await cargar()
  } catch (excepcion) {
    errorAnulacion.value = mensajeError(excepcion, 'No se pudo anular el pago.')
  } finally {
    anulando.value = false
  }
}

// ── registrar pago ──────────────────────────────────────────────────
// Único punto de registro de toda la app (2026-08-27) — antes existía
// también en /estado-cuenta/pagos.vue (retirada) y en la ficha del
// inmueble (que sigue teniendo su propio modal, con inmuebleId fijo).
const modalPagoAbierto = ref(false)

async function alRegistrarPago(): Promise<void> {
  modalPagoAbierto.value = false
  toast.add({ title: 'Pago registrado.', color: 'success' })
  await cargar()
}

// ── comprobante adjunto ─────────────────────────────────────────────
// El documento (foto/PDF del recibo físico) sube colgado de documentos.pago_id
// (20260903170000) — antes solo se veía entrando a la pestaña Documentos de la
// ficha del inmueble; acá se resuelve el enlace de descarga con la misma
// urlDescarga() que ya usa UiLibreriaDocumentos.vue (signed URL de 60s, bucket privado).
const descargandoComprobante = ref<string | null>(null)
async function verComprobante(storagePath: string): Promise<void> {
  descargandoComprobante.value = storagePath
  try {
    const url = await documentosStore.urlDescarga(storagePath)
    window.open(url, '_blank', 'noopener')
  } catch {
    toast.add({ title: 'No se pudo generar el enlace del comprobante.', color: 'error' })
  } finally {
    descargandoComprobante.value = null
  }
}

// ── exportar a Excel ─────────────────────────────────────────────────
/** Mismo patrón que contabilidad/movimientos.vue: SheetJS por carga dinámica,
 * para que xlsx solo pese en el bundle de quien efectivamente exporta.
 * Exporta lo que ya está filtrado/cargado en pantalla, no un query aparte. */
async function exportarExcel(): Promise<void> {
  const XLSX = await import('xlsx')
  const encabezados = ['Fecha', 'Inmueble', 'Ubicación', 'Monto', 'Forma de pago', 'Recibo', 'Estado', 'Comprobante']
  const filas = recaudoStore.pagos.map((p) => [
    p.fecha_pago,
    p.inmueble_codigo,
    ubicacionDe(p.inmueble_agrupacion_id),
    Number(p.monto),
    p.forma_pago_nombre ?? '',
    p.recibo_folio ?? '',
    p.es_reversa ? 'Reversa' : p.esta_anulado ? 'Anulado' : 'Vigente',
    p.comprobante_nombre_archivo ?? '',
  ])
  const hoja = XLSX.utils.aoa_to_sheet([encabezados, ...filas])
  hoja['!cols'] = [
    { wch: 12 }, { wch: 12 }, { wch: 24 }, { wch: 14 },
    { wch: 20 }, { wch: 12 }, { wch: 10 }, { wch: 30 },
  ]
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Recaudo')
  const rango = desde.value && hasta.value ? `-${desde.value}-a-${hasta.value}` : ''
  XLSX.writeFile(libro, `recaudo${rango}.xlsx`)
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <UiTituloDescripcion clase-descripcion="text-sm text-neutral-500 mt-1 max-w-2xl">
        <template #titulo>
          <h1 class="text-xl font-semibold">Recaudo</h1>
        </template>
        <template #descripcion>
          Pagos registrados en toda la copropiedad, con su recibo de caja. Una anulación queda
          como una reversa (nunca se borra) e inserta una fila propia con monto negativo.
        </template>
      </UiTituloDescripcion>
    </div>

    <div class="flex flex-wrap items-end gap-3">
      <UFormField label="Desde" name="desde">
        <UInput v-model="desde" type="date" class="w-36" :max="hasta || undefined" @change="cargar" />
      </UFormField>
      <UFormField label="Hasta" name="hasta">
        <UInput v-model="hasta" type="date" class="w-36" :min="desde || undefined" @change="cargar" />
      </UFormField>
      <UFormField label="Ubicación" name="ubicacion" class="w-44">
        <UiSelectorBuscable
          :model-value="agrupacionId"
          :opciones="opcionesUbicacion"
          placeholder="Todas"
          @update:model-value="alCambiarUbicacion"
        />
      </UFormField>
      <UFormField label="Inmueble" name="inmueble" class="w-44">
        <UiSelectorBuscable
          :model-value="inmuebleId"
          :opciones="opcionesInmueble"
          placeholder="Todos"
          @update:model-value="(v) => { inmuebleId = v as string | null; cargar() }"
        />
      </UFormField>
      <UFormField label="Forma de pago" name="forma_pago" class="w-64">
        <USelect
          :model-value="formaPagoCodigo"
          :items="opcionesFormaPago"
          class="w-full"
          @update:model-value="(v) => { formaPagoCodigo = v as string | null; cargar() }"
        />
      </UFormField>
      <div class="flex items-center gap-2 ms-auto">
        <UButton
          variant="outline"
          icon="i-lucide-file-down"
          size="sm"
          :disabled="recaudoStore.pagos.length === 0"
          @click="exportarExcel"
        >
          Exportar Excel
        </UButton>
        <UButton icon="i-lucide-plus" size="sm" @click="modalPagoAbierto = true">Registrar pago</UButton>
      </div>
    </div>

    <div class="stat-row">
      <div class="stat">
        <p class="stat-label">Total recaudado</p>
        <p class="stat-value big">{{ formatoMoneda(totalGeneral) }}</p>
      </div>
      <div v-for="[nombre, monto] in totalesPorForma" :key="nombre" class="stat">
        <p class="stat-label">{{ nombre }}</p>
        <p class="stat-value">{{ formatoMoneda(monto) }}</p>
      </div>
    </div>

    <UiTabla
      :columnas="[
        { clave: 'fecha_pago', etiqueta: 'Fecha', claseCelda: 'mono' },
        { clave: 'inmueble_codigo', etiqueta: 'Inmueble' },
        { clave: 'ubicacion', etiqueta: 'Ubicación' },
        { clave: 'monto', etiqueta: 'Monto', alinear: 'derecha', claseCelda: 'mono' },
        { clave: 'forma_pago_nombre', etiqueta: 'Forma de pago' },
        { clave: 'recibo_folio', etiqueta: 'Recibo' },
        { clave: 'comprobante', etiqueta: 'Comprobante' },
        { clave: 'estado', etiqueta: 'Estado' },
        { clave: 'acciones', etiqueta: '' },
      ]"
      :filas="recaudoStore.pagos"
      :clave-fila="(p) => p.id"
      :cargando="recaudoStore.loading"
      vacio="Sin pagos en el rango seleccionado."
    >
      <template #celda-ubicacion="{ fila }">
        <span class="text-xs text-neutral-500">{{ ubicacionDe(fila.inmueble_agrupacion_id) }}</span>
      </template>
      <template #celda-monto="{ fila }">
        <span :class="{ 'text-error-600': fila.es_reversa }">{{ formatoMoneda(fila.monto) }}</span>
      </template>
      <template #celda-recibo_folio="{ fila }">
        <span v-if="fila.recibo_folio" class="font-mono text-xs">{{ fila.recibo_folio }}</span>
        <span v-else class="text-neutral-400 text-xs">—</span>
      </template>
      <template #celda-comprobante="{ fila }">
        <UButton
          v-if="fila.comprobante_storage_path"
          size="xs"
          variant="ghost"
          icon="i-lucide-paperclip"
          :loading="descargandoComprobante === fila.comprobante_storage_path"
          @click="verComprobante(fila.comprobante_storage_path)"
        >
          Ver
        </UButton>
        <span v-else class="text-neutral-400 text-xs">—</span>
      </template>
      <template #celda-estado="{ fila }">
        <UBadge v-if="fila.es_reversa" color="error" variant="subtle" size="sm">Reversa</UBadge>
        <UBadge v-else-if="fila.esta_anulado" color="warning" variant="subtle" size="sm">Anulado</UBadge>
        <UBadge v-else color="success" variant="subtle" size="sm">Vigente</UBadge>
      </template>
      <template #celda-acciones="{ fila }">
        <div class="flex justify-end gap-1">
          <UButton
            v-if="fila.recibo_id"
            size="xs"
            variant="ghost"
            icon="i-lucide-file-text"
            title="Ver recibo"
            @click="irARecibo(fila.recibo_id)"
          />
          <UButton
            v-if="fila.recibo_id"
            size="xs"
            variant="ghost"
            icon="i-lucide-send"
            title="Reenviar recibo por correo"
            :loading="reenviando === fila.recibo_id"
            @click="reenviar(fila.recibo_id)"
          />
          <UButton
            v-if="!fila.es_reversa && !fila.esta_anulado"
            size="xs"
            variant="ghost"
            color="error"
            icon="i-lucide-ban"
            title="Anular pago"
            @click="abrirAnular(fila)"
          />
        </div>
      </template>
    </UiTabla>

    <UModal
      :open="modalAnularAbierto"
      title="Anular pago"
      @update:open="(abierto) => { if (!abierto) modalAnularAbierto = false }"
    >
      <template #body>
        <div class="space-y-4 text-sm">
          <p v-if="pagoAnulando" class="text-neutral-600">
            Vas a anular el pago de <strong>{{ formatoMoneda(pagoAnulando.monto) }}</strong> del
            inmueble <strong>{{ pagoAnulando.inmueble_codigo }}</strong> ({{ pagoAnulando.fecha_pago }}).
            Se registrará como una reversa — el pago original no se borra.
          </p>
          <UFormField label="Motivo" name="motivo" required>
            <UTextarea v-model="motivoAnulacion" :rows="2" autoresize placeholder="ej. Cheque devuelto por el banco" class="w-full" />
          </UFormField>
          <UAlert v-if="errorAnulacion" color="error" variant="soft" :title="errorAnulacion" />
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="modalAnularAbierto = false">Cancelar</UButton>
          <UButton color="error" :loading="anulando" :disabled="!motivoAnulacion.trim()" @click="confirmarAnular">
            Anular pago
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal
      :open="modalPagoAbierto"
      title="Registrar pago"
      @update:open="(abierto) => { if (!abierto) modalPagoAbierto = false }"
    >
      <template #body>
        <PagosRegistrarPagoForm @registrado="alRegistrarPago" />
      </template>
    </UModal>
  </div>
</template>

<style scoped>
.stat-row {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
}
.stat {
  min-width: 140px;
}
.stat-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-neutral-400);
  margin-bottom: 2px;
}
.stat-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-neutral-800);
}
.stat-value.big {
  font-size: 22px;
  color: var(--color-brand-700);
}
</style>
