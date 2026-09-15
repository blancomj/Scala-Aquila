<script setup lang="ts">
// CO-2 · Núcleo del libro contable — comprobante con partida doble persistida.
//
// Todavía no contabiliza ninguna operación real de cartera/presupuesto/fondos (CO-3 conecta
// eso); aquí solo existe la captura manual y el ciclo borrador → contabilizado → anulado, más
// la reversión. `numero` nunca se edita aquí: lo asigna fn_contabilizar_comprobante.
import type { Database } from '@aquila/shared'
import type { NuevaLineaDetalle } from '~/stores/comprobantes'

type ComprobanteRow = Database['public']['Tables']['contable_comprobante']['Row']
type EstadoComprobante = Database['public']['Enums']['contable_comprobante_estado_t']

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:create' })

const tenantStore = useTenantStore()
const comprobantesStore = useComprobantesStore()
const contabilidadStore = useContabilidadStore()
const tercerosStore = useTercerosStore()
const cuentaCorrienteStore = useCuentaCorrienteStore()
const presupuestoStore = usePresupuestoStore()
const fondosStore = useFondosStore()
const documentosStore = useDocumentosStore()

const error = ref<string | null>(null)
const aviso = ref<string | null>(null)
const trabajando = ref(false)

// ── filtros ────────────────────────────────────────────────────────────
const filtroPeriodo = ref<string | null>(null)
const filtroTipo = ref<number | null>(null)
const filtroEstado = ref<EstadoComprobante | null>(null)

// `watch: [...]`: activeTenant puede no estar resuelto en el instante exacto
// de este setup en la carga en frío — la opción reintenta sola en cuanto el
// id esté disponible (mismo espíritu que configuracion/ia.vue).
await useAsyncData(
  'contable-comprobantes',
  async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return null
  await Promise.all([
    comprobantesStore.cargarTipos(),
    comprobantesStore.cargarPeriodos(tenantId),
    comprobantesStore.cargarComprobantes(tenantId),
    contabilidadStore.cargarPlan(tenantId),
  ])
  return true
  },
  { watch: [() => tenantStore.activeTenant?.id] },
)

async function refrescar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await comprobantesStore.cargarComprobantes(tenantId, {
    periodoId: filtroPeriodo.value ?? undefined,
    tipoId: filtroTipo.value ?? undefined,
    estado: filtroEstado.value ?? undefined,
  })
}

const periodoPorId = computed(() => new Map(comprobantesStore.periodos.map((p) => [p.id, p])))
const tipoPorId = computed(() => new Map(comprobantesStore.tipos.map((t) => [t.id, t])))

function numeroFormateado(c: ComprobanteRow): string {
  const tipo = tipoPorId.value.get(c.tipo_id)
  const codigo = tipo?.codigo ?? '?'
  if (c.numero === null) return `${codigo}-${c.anio}-(borrador)`
  return `${codigo}-${c.anio}-${String(c.numero).padStart(6, '0')}`
}

const ETIQUETA_ESTADO: Record<EstadoComprobante, string> = {
  borrador: 'Borrador',
  contabilizado: 'Contabilizado',
  anulado: 'Anulado',
}
const COLOR_ESTADO: Record<EstadoComprobante, 'neutral' | 'success' | 'error'> = {
  borrador: 'neutral',
  contabilizado: 'success',
  anulado: 'error',
}

// ── detalle / drawer ──────────────────────────────────────────────────────
const comprobanteAbierto = ref<ComprobanteRow | null>(null)
const motivoAccion = ref('')
const periodoReversion = ref<string | null>(null)
const observacionesEdit = ref('')
const guardandoObservaciones = ref(false)

async function abrirDetalle(c: ComprobanteRow): Promise<void> {
  comprobanteAbierto.value = c
  motivoAccion.value = ''
  periodoReversion.value = null
  observacionesEdit.value = c.observaciones ?? ''
  archivoSoporte.value = null
  const tenantId = tenantStore.activeTenant?.id
  await Promise.all([
    comprobantesStore.cargarDetalle(c.id),
    tenantId ? documentosStore.cargarDocumentos(tenantId, null, null, null, c.id) : Promise.resolve(),
  ])
}
function cerrarDetalle(): void {
  comprobanteAbierto.value = null
  documentosStore.limpiar()
}

async function guardarObservaciones(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !comprobanteAbierto.value) return
  guardandoObservaciones.value = true
  error.value = null
  try {
    await comprobantesStore.actualizarObservaciones(tenantId, comprobanteAbierto.value.id, observacionesEdit.value)
    aviso.value = 'Observaciones guardadas.'
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudieron guardar las observaciones.')
  } finally {
    guardandoObservaciones.value = false
  }
}

// ── soporte documental (D-130): factura/recibo del comprobante manual ─────
const MIME_SOPORTE_PERMITIDOS = new Set(['application/pdf', 'image/jpeg', 'image/png'])
const TAMANO_SOPORTE_MAXIMO = 15 * 1024 * 1024
const archivoSoporte = ref<File | null>(null)
const subiendoSoporte = ref(false)
const descargandoSoporte = ref<string | null>(null)

function elegirArchivoSoporte(evento: Event): void {
  const input = evento.target as HTMLInputElement
  const archivo = input.files?.[0] ?? null
  error.value = null
  if (archivo && (!MIME_SOPORTE_PERMITIDOS.has(archivo.type) || archivo.size > TAMANO_SOPORTE_MAXIMO)) {
    error.value = 'El soporte debe ser PDF, JPG o PNG, hasta 15 MB.'
    archivoSoporte.value = null
    input.value = ''
    return
  }
  archivoSoporte.value = archivo
}

async function subirSoporte(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !comprobanteAbierto.value || !archivoSoporte.value) return
  subiendoSoporte.value = true
  error.value = null
  try {
    const tipos = await cargarListaTipos(tenantId, 'TIPO_DOCUMENTO')
    const tipoSoporte = tipos.find((t) => t.codigo === 'soporte_comprobante')
    if (!tipoSoporte) throw new Error('No se encontró el tipo de documento "soporte_comprobante".')
    await documentosStore.subirDocumento({
      tenantId,
      inmuebleId: null,
      tipoDocumentoId: tipoSoporte.id,
      archivo: archivoSoporte.value,
      comprobanteId: comprobanteAbierto.value.id,
    })
    archivoSoporte.value = null
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo subir el soporte.')
  } finally {
    subiendoSoporte.value = false
  }
}

async function verSoporte(storagePath: string | null): Promise<void> {
  if (!storagePath) return
  descargandoSoporte.value = storagePath
  try {
    const url = await documentosStore.urlDescarga(storagePath)
    window.open(url, '_blank', 'noopener')
  } catch {
    error.value = 'No se pudo generar el enlace de descarga.'
  } finally {
    descargandoSoporte.value = null
  }
}

// Enlace entrante desde movimientos.vue (CO-3 §4.5, trazabilidad bidireccional): ?comprobante=<id>
// abre el drawer directamente, sin que el usuario tenga que buscarlo en la tabla.
const route = useRoute()
onMounted(async () => {
  const idDesdeUrl = route.query.comprobante
  if (typeof idDesdeUrl !== 'string') return
  const encontrado = comprobantesStore.comprobantes.find((c) => c.id === idDesdeUrl)
  if (encontrado) await abrirDetalle(encontrado)
})


const totalDebito = computed(() =>
  comprobantesStore.detalle.reduce((s, l) => s + Number(l.debito), 0),
)
const totalCredito = computed(() =>
  comprobantesStore.detalle.reduce((s, l) => s + Number(l.credito), 0),
)
const diferencia = computed(() => totalDebito.value - totalCredito.value)

const reversaOrigen = computed(() => {
  const id = comprobanteAbierto.value?.reversa_comprobante_id
  return id ? comprobantesStore.comprobantes.find((c) => c.id === id) : null
})
const reversadoPor = computed(() => {
  const id = comprobanteAbierto.value?.reversado_por_id
  return id ? comprobantesStore.comprobantes.find((c) => c.id === id) : null
})

async function accionContabilizar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !comprobanteAbierto.value) return
  trabajando.value = true
  error.value = null
  try {
    await comprobantesStore.contabilizar(tenantId, comprobanteAbierto.value.id)
    aviso.value = 'Comprobante contabilizado.'
    cerrarDetalle()
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo contabilizar.')
  } finally {
    trabajando.value = false
  }
}

async function accionAnular(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !comprobanteAbierto.value) return
  if (!motivoAccion.value.trim()) {
    error.value = 'El motivo de anulación es obligatorio.'
    return
  }
  trabajando.value = true
  error.value = null
  try {
    await comprobantesStore.anular(tenantId, comprobanteAbierto.value.id, motivoAccion.value)
    aviso.value = 'Comprobante anulado.'
    cerrarDetalle()
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo anular.')
  } finally {
    trabajando.value = false
  }
}

async function accionReversar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !comprobanteAbierto.value) return
  if (!periodoReversion.value) {
    error.value = 'Selecciona el periodo destino de la reversión.'
    return
  }
  if (!motivoAccion.value.trim()) {
    error.value = 'El motivo de la reversión es obligatorio.'
    return
  }
  trabajando.value = true
  error.value = null
  try {
    await comprobantesStore.reversar(
      tenantId,
      comprobanteAbierto.value.id,
      periodoReversion.value,
      motivoAccion.value,
    )
    aviso.value = 'Comprobante reversado.'
    cerrarDetalle()
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo reversar.')
  } finally {
    trabajando.value = false
  }
}

async function accionEliminar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !comprobanteAbierto.value) return
  trabajando.value = true
  error.value = null
  try {
    await comprobantesStore.eliminarComprobante(tenantId, comprobanteAbierto.value.id)
    aviso.value = 'Borrador eliminado.'
    cerrarDetalle()
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo eliminar.')
  } finally {
    trabajando.value = false
  }
}

// ── formulario de comprobante manual ──────────────────────────────────────
const creando = ref(false)
const nuevoPeriodoId = ref<string | null>(null)
const nuevoTipoId = ref<number | null>(null)
const nuevaFecha = ref(new Date().toISOString().slice(0, 10))
const nuevaDescripcion = ref('')
const nuevaObservaciones = ref('')
// terceroId/inmuebleId/fondoId inicializan en null (no undefined): UiSelectorBuscable exige
// `string | number | null` en su v-model, sin `undefined`.
function lineaVacia(): NuevaLineaDetalle {
  return {
    cuentaId: '',
    debito: 0,
    credito: 0,
    terceroId: null,
    inmuebleId: null,
    centroCostoId: null,
    fondoId: null,
  }
}

const nuevasLineas = ref<NuevaLineaDetalle[]>([lineaVacia(), lineaVacia()])

const opcionesCuenta = computed(() =>
  contabilidadStore.cuentasDeMovimiento.map((c) => ({
    valor: c.id,
    etiqueta: `${c.codigo} — ${c.nombre}`,
  })),
)

// Dimensiones analíticas por línea (COMPROBANTE_DIMENSION_REQUERIDA, co2_comprobante_funciones):
// cada cuenta declara con requiere_tercero/inmueble/centro_costo/fondo cuáles son obligatorias —
// se muestran solo si la cuenta elegida en esa línea lo exige, para no llenar de selectores un
// formulario que en la mayoría de las cuentas no los necesita.
const cuentaPorId = computed(() => new Map(contabilidadStore.cuentas.map((c) => [c.id, c])))
const requisitosPorLinea = computed(() =>
  nuevasLineas.value.map((l) => {
    const cuenta = l.cuentaId ? cuentaPorId.value.get(l.cuentaId) : undefined
    return {
      tercero: cuenta?.requiere_tercero ?? false,
      inmueble: cuenta?.requiere_inmueble ?? false,
      centroCosto: cuenta?.requiere_centro_costo ?? false,
      fondo: cuenta?.requiere_fondo ?? false,
    }
  }),
)

const opcionesTercero = computed(() =>
  tercerosStore.terceros.map((t) => ({
    valor: t.id,
    etiqueta: `${t.nombre_completo ?? t.razon_social ?? t.numero_documento} (${t.numero_documento})`,
  })),
)
const opcionesInmuebleLinea = computed(() =>
  cuentaCorrienteStore.inmuebles.map((i) => ({ valor: i.id, etiqueta: i.codigo })),
)
const opcionesCentroCostoLinea = computed(() =>
  presupuestoStore.tiposCentroCosto.map((t) => ({ label: t.nombre, value: t.id })),
)
const opcionesFondoLinea = computed(() =>
  fondosStore.fondos.map((f) => ({ valor: f.id, etiqueta: `${f.codigo} — ${f.nombre}` })),
)

function agregarLinea(): void {
  nuevasLineas.value = [...nuevasLineas.value, lineaVacia()]
}
function quitarLinea(i: number): void {
  if (nuevasLineas.value.length <= 2) return
  nuevasLineas.value = nuevasLineas.value.filter((_, idx) => idx !== i)
}

const nuevoTotalDebito = computed(() =>
  nuevasLineas.value.reduce((s, l) => s + (Number(l.debito) || 0), 0),
)
const nuevoTotalCredito = computed(() =>
  nuevasLineas.value.reduce((s, l) => s + (Number(l.credito) || 0), 0),
)
const nuevoCuadrado = computed(
  () => nuevoTotalDebito.value === nuevoTotalCredito.value && nuevoTotalDebito.value > 0,
)

async function abrirCreacion(): Promise<void> {
  creando.value = true
  nuevoPeriodoId.value = comprobantesStore.periodos[0]?.id ?? null
  nuevoTipoId.value = comprobantesStore.tiposCaptura[0]?.id ?? null
  nuevaFecha.value = new Date().toISOString().slice(0, 10)
  nuevaDescripcion.value = ''
  nuevaObservaciones.value = ''
  nuevasLineas.value = [lineaVacia(), lineaVacia()]

  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  const cargas: Promise<unknown>[] = []
  if (tercerosStore.terceros.length === 0) cargas.push(tercerosStore.cargarTerceros(tenantId))
  if (cuentaCorrienteStore.inmuebles.length === 0) cargas.push(cuentaCorrienteStore.cargarInmuebles(tenantId))
  if (presupuestoStore.tiposCentroCosto.length === 0) {
    cargas.push(presupuestoStore.cargarTiposCentroCosto(tenantId))
  }
  if (fondosStore.fondos.length === 0) cargas.push(fondosStore.cargarFondos(tenantId))
  await Promise.all(cargas)
}
function cerrarCreacion(): void {
  creando.value = false
}

async function guardarBorrador(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !nuevoPeriodoId.value || !nuevoTipoId.value) return
  const periodo = periodoPorId.value.get(nuevoPeriodoId.value)
  if (!periodo) return
  trabajando.value = true
  error.value = null
  try {
    await comprobantesStore.crearComprobante({
      tenantId,
      periodoId: nuevoPeriodoId.value,
      tipoId: nuevoTipoId.value,
      anio: periodo.anio,
      fecha: nuevaFecha.value,
      descripcion: nuevaDescripcion.value,
      observaciones: nuevaObservaciones.value,
      lineas: nuevasLineas.value.filter((l) => l.cuentaId),
    })
    aviso.value = 'Borrador creado.'
    cerrarCreacion()
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo crear el comprobante.')
  } finally {
    trabajando.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <UiTituloDescripcion>
        <template #titulo>
          <h1 class="text-xl font-semibold">Comprobantes contables</h1>
        </template>
        <template #descripcion>
          Comprobante con partida doble persistida. Un comprobante contabilizado es inmutable;
          se corrige con una reversión, nunca editándolo.
        </template>
      </UiTituloDescripcion>
      <UButton icon="i-lucide-plus" @click="abrirCreacion">Nuevo comprobante</UButton>
    </div>

    <UAlert v-if="error" color="error" variant="soft" :title="error" />
    <UAlert v-if="aviso" color="success" variant="soft" :title="aviso" />

    <div class="flex items-center gap-2 flex-wrap">
      <USelect
        :model-value="filtroPeriodo ?? undefined"
        :items="comprobantesStore.periodos.map((p) => ({ label: `${p.anio}-${String(p.mes).padStart(2, '0')}`, value: p.id }))"
        placeholder="Todos los periodos"
        class="w-40"
        @update:model-value="(v) => { filtroPeriodo = (v as string) ?? null; refrescar() }"
      />
      <USelect
        :model-value="filtroTipo ?? undefined"
        :items="comprobantesStore.tipos.map((t) => ({ label: t.nombre, value: t.id }))"
        placeholder="Todos los tipos"
        class="w-48"
        @update:model-value="(v) => { filtroTipo = (v as number) ?? null; refrescar() }"
      />
      <USelect
        :model-value="filtroEstado ?? undefined"
        :items="[
          { label: 'Borrador', value: 'borrador' },
          { label: 'Contabilizado', value: 'contabilizado' },
          { label: 'Anulado', value: 'anulado' },
        ]"
        placeholder="Todos los estados"
        class="w-40"
        @update:model-value="(v) => { filtroEstado = (v as EstadoComprobante) ?? null; refrescar() }"
      />
    </div>

    <UiTabla
      :columnas="[
        { clave: 'numero', etiqueta: 'Número' },
        { clave: 'fecha', etiqueta: 'Fecha' },
        { clave: 'descripcion', etiqueta: 'Descripción' },
        { clave: 'estado', etiqueta: 'Estado' },
      ]"
      :filas="comprobantesStore.comprobantes"
      :clave-fila="(fila) => fila.id"
      :vacio="'Sin comprobantes.'"
    >
      <template #celda-numero="{ fila }">
        <button type="button" class="hover:underline font-medium tabular-nums" @click="abrirDetalle(fila)">
          {{ numeroFormateado(fila) }}
        </button>
      </template>
      <template #celda-estado="{ fila }">
        <UBadge :color="COLOR_ESTADO[fila.estado]" variant="subtle" size="xs">
          {{ ETIQUETA_ESTADO[fila.estado] }}
        </UBadge>
      </template>
    </UiTabla>

    <!-- ── Detalle ── -->
    <UiDrawer :abierto="!!comprobanteAbierto" titulo="Comprobante" ancho="ancho" @cerrar="cerrarDetalle">
      <div v-if="comprobanteAbierto" class="space-y-4">
        <div class="flex items-center gap-2">
          <span class="font-medium tabular-nums">{{ numeroFormateado(comprobanteAbierto) }}</span>
          <UBadge :color="COLOR_ESTADO[comprobanteAbierto.estado]" variant="subtle" size="xs">
            {{ ETIQUETA_ESTADO[comprobanteAbierto.estado] }}
          </UBadge>
        </div>
        <p class="text-sm">{{ comprobanteAbierto.descripcion }}</p>
        <p v-if="reversaOrigen" class="text-xs text-muted">
          Reversa a
          <button class="underline" @click="abrirDetalle(reversaOrigen)">
            {{ numeroFormateado(reversaOrigen) }}
          </button>
        </p>
        <p v-if="reversadoPor" class="text-xs text-muted">
          Reversado por
          <button class="underline" @click="abrirDetalle(reversadoPor)">
            {{ numeroFormateado(reversadoPor) }}
          </button>
        </p>

        <UiTabla
          :columnas="[
            { clave: 'linea', etiqueta: '#' },
            { clave: 'cuenta', etiqueta: 'Cuenta' },
            { clave: 'debito', etiqueta: 'Débito', alinear: 'derecha' },
            { clave: 'credito', etiqueta: 'Crédito', alinear: 'derecha' },
          ]"
          :filas="comprobantesStore.detalle"
          :clave-fila="(fila) => fila.id"
        >
          <template #celda-cuenta="{ fila }">
            {{ contabilidadStore.cuentas.find((c) => c.id === fila.cuenta_id)?.codigo ?? fila.cuenta_id }}
          </template>
          <template #celda-debito="{ fila }">
            <span class="tabular-nums">{{ Number(fila.debito) > 0 ? formatoMoneda(fila.debito) : '—' }}</span>
          </template>
          <template #celda-credito="{ fila }">
            <span class="tabular-nums">{{ Number(fila.credito) > 0 ? formatoMoneda(fila.credito) : '—' }}</span>
          </template>
        </UiTabla>

        <div class="flex items-center justify-end gap-4 text-sm tabular-nums">
          <span>Débito: {{ formatoMoneda(totalDebito) }}</span>
          <span>Crédito: {{ formatoMoneda(totalCredito) }}</span>
          <span :class="diferencia === 0 ? 'text-muted' : 'text-error font-semibold'">
            Diferencia: {{ formatoMoneda(diferencia) }}
          </span>
        </div>

        <!-- Observaciones y soporte documental: disponibles en cualquier estado (incluido
             contabilizado) — son anotación/evidencia, no hechos financieros del asiento. -->
        <div class="space-y-2 border-t border-default pt-3">
          <p class="text-sm font-medium">Observaciones</p>
          <UTextarea v-model="observacionesEdit" placeholder="Nota libre (opcional)" :rows="2" class="w-full" />
          <UButton size="xs" variant="soft" :loading="guardandoObservaciones" @click="guardarObservaciones">
            Guardar observaciones
          </UButton>
        </div>

        <div class="space-y-2 border-t border-default pt-3">
          <p class="text-sm font-medium">Soporte documental</p>
          <ul v-if="documentosStore.documentos.length > 0" class="space-y-1">
            <li
              v-for="d in documentosStore.documentos"
              :key="d.id ?? undefined"
              class="flex items-center justify-between gap-2 text-sm"
            >
              <span class="truncate">{{ d.nombre_archivo }}</span>
              <UButton
                variant="ghost"
                size="xs"
                :disabled="descargandoSoporte === d.storage_path"
                @click="verSoporte(d.storage_path)"
              >
                {{ descargandoSoporte === d.storage_path ? 'Generando…' : 'Ver' }}
              </UButton>
            </li>
          </ul>
          <p v-else class="text-xs text-muted">Sin soporte adjunto todavía.</p>
          <div class="flex items-center gap-2">
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" class="text-sm" @change="elegirArchivoSoporte">
            <UButton
              size="xs"
              variant="soft"
              :loading="subiendoSoporte"
              :disabled="!archivoSoporte"
              @click="subirSoporte"
            >
              Adjuntar
            </UButton>
          </div>
          <p class="text-xs text-muted">Factura, recibo o comprobante — PDF, JPG o PNG, hasta 15 MB.</p>
        </div>

        <div v-if="comprobanteAbierto.estado === 'borrador'" class="flex items-center gap-2">
          <UButton :loading="trabajando" :disabled="diferencia !== 0" @click="accionContabilizar">
            Contabilizar
          </UButton>
          <UButton variant="ghost" color="error" :loading="trabajando" @click="accionEliminar">
            Eliminar borrador
          </UButton>
        </div>

        <div v-else-if="comprobanteAbierto.estado === 'contabilizado'" class="space-y-3 border-t border-default pt-3">
          <UTextarea v-model="motivoAccion" placeholder="Motivo (obligatorio)" :rows="2" class="w-full" />
          <div class="flex items-center gap-2 flex-wrap">
            <USelect
              :model-value="periodoReversion ?? undefined"
              :items="comprobantesStore.periodos.map((p) => ({ label: `${p.anio}-${String(p.mes).padStart(2, '0')}`, value: p.id }))"
              placeholder="Periodo destino de la reversión"
              class="w-56"
              @update:model-value="(v) => (periodoReversion = (v as string) ?? null)"
            />
            <UButton variant="soft" :loading="trabajando" @click="accionReversar">Reversar</UButton>
            <UButton variant="ghost" color="error" :loading="trabajando" @click="accionAnular">Anular</UButton>
          </div>
        </div>
      </div>
    </UiDrawer>

    <!-- ── Crear ── -->
    <UiDrawer :abierto="creando" titulo="Nuevo comprobante" ancho="ancho" @cerrar="cerrarCreacion">
      <form class="space-y-4" @submit.prevent="guardarBorrador">
        <div class="grid gap-3 sm:grid-cols-3">
          <UFormField label="Periodo">
            <USelect
              :model-value="nuevoPeriodoId ?? undefined"
              class="w-full"
              :items="comprobantesStore.periodos.map((p) => ({ label: `${p.anio}-${String(p.mes).padStart(2, '0')}`, value: p.id }))"
              @update:model-value="(v) => (nuevoPeriodoId = (v as string) ?? null)"
            />
          </UFormField>
          <UFormField label="Tipo">
            <USelect
              :model-value="nuevoTipoId ?? undefined"
              class="w-full"
              :items="comprobantesStore.tiposCaptura.map((t) => ({ label: t.nombre, value: t.id }))"
              @update:model-value="(v) => (nuevoTipoId = (v as number) ?? null)"
            />
          </UFormField>
          <UFormField label="Fecha">
            <UInput v-model="nuevaFecha" type="date" />
          </UFormField>
        </div>
        <UFormField label="Descripción">
          <UInput v-model="nuevaDescripcion" class="w-full" />
        </UFormField>
        <UFormField label="Observaciones (opcional)">
          <UTextarea v-model="nuevaObservaciones" :rows="2" class="w-full" />
        </UFormField>

        <div class="space-y-2">
          <div v-for="(linea, i) in nuevasLineas" :key="i" class="space-y-1.5">
            <div class="flex items-center gap-2">
              <UiSelectorBuscable
                v-model="linea.cuentaId"
                :opciones="opcionesCuenta"
                placeholder="Cuenta…"
                class="flex-1"
              />
              <UInput v-model.number="linea.debito" type="number" step="0.01" placeholder="Débito" class="w-32" />
              <UInput v-model.number="linea.credito" type="number" step="0.01" placeholder="Crédito" class="w-32" />
              <UButton
                size="xs"
                variant="ghost"
                icon="i-lucide-trash-2"
                :disabled="nuevasLineas.length <= 2"
                @click="quitarLinea(i)"
              />
            </div>
            <!-- Solo aparece si la cuenta elegida arriba exige la dimensión (contable_cuenta.
                 requiere_tercero/inmueble/centro_costo/fondo) — fn_contabilizar_comprobante
                 rechaza con COMPROBANTE_DIMENSION_REQUERIDA si falta al contabilizar. -->
            <div
              v-if="Object.values(requisitosPorLinea[i]!).some(Boolean)"
              class="flex flex-wrap items-center gap-2 pl-1"
            >
              <UiSelectorBuscable
                v-if="requisitosPorLinea[i]!.tercero"
                :model-value="linea.terceroId ?? null"
                :opciones="opcionesTercero"
                placeholder="Tercero (requerido)…"
                class="w-56"
                @update:model-value="(v) => (linea.terceroId = v as string | null)"
              />
              <UiSelectorBuscable
                v-if="requisitosPorLinea[i]!.inmueble"
                :model-value="linea.inmuebleId ?? null"
                :opciones="opcionesInmuebleLinea"
                placeholder="Inmueble (requerido)…"
                class="w-40"
                @update:model-value="(v) => (linea.inmuebleId = v as string | null)"
              />
              <USelect
                v-if="requisitosPorLinea[i]!.centroCosto"
                :model-value="linea.centroCostoId ?? undefined"
                :items="opcionesCentroCostoLinea"
                placeholder="Centro de costo (requerido)"
                class="w-48"
                @update:model-value="(v) => (linea.centroCostoId = (v as number) ?? null)"
              />
              <UiSelectorBuscable
                v-if="requisitosPorLinea[i]!.fondo"
                :model-value="linea.fondoId ?? null"
                :opciones="opcionesFondoLinea"
                placeholder="Fondo (requerido)…"
                class="w-48"
                @update:model-value="(v) => (linea.fondoId = v as string | null)"
              />
            </div>
          </div>
          <UButton size="xs" variant="ghost" icon="i-lucide-plus" @click="agregarLinea">
            Agregar línea
          </UButton>
        </div>

        <div class="flex items-center justify-end gap-4 text-sm tabular-nums">
          <span>Débito: {{ formatoMoneda(nuevoTotalDebito) }}</span>
          <span>Crédito: {{ formatoMoneda(nuevoTotalCredito) }}</span>
          <span :class="nuevoCuadrado ? 'text-muted' : 'text-error font-semibold'">
            Diferencia: {{ formatoMoneda(nuevoTotalDebito - nuevoTotalCredito) }}
          </span>
        </div>

        <UButton type="submit" :loading="trabajando">Guardar borrador</UButton>
        <p class="text-xs text-muted">
          El borrador se guarda aunque no cuadre. Para contabilizarlo (asignarle número), ábrelo
          desde la lista una vez cuadrado.
        </p>
      </form>
    </UiDrawer>
  </div>
</template>
