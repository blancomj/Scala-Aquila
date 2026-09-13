<script setup lang="ts">
// Mantenimiento → Activos, Ficha 360° — Fase 3 de
// PROMPT_IMPLEMENTACION_MANTENIMIENTO_ACTIVOS_AQUILA.md (D-90), más Fase 4
// (Operaciones de dominio, D-91): cambiar estado, capitalizar, reconocer
// depreciación y dar de baja. 6 pestañas: Resumen, General, Técnico,
// Mantenimiento, Contabilidad, Historial.
//
// Alcance deliberado (documentado en D-90/D-91):
// - Cada operación de dominio llama la función/RPC de MANT-0 tal cual
//   (`fn_mant_capitalizar_activo`/`fn_mant_dar_baja_activo`/
//   `fn_mant_reconocer_depreciacion`) — ninguna reimplementa la regla de
//   negocio. "Editar" (Fase 2) sigue sin tocar `estado`/bloque contable de
//   un activo capitalizado.
// - "Cambiar estado" (transiciones que no son el retiro) es un UPDATE plano
//   de `estado` — `guard_activo_transicion` valida y registra el historial
//   él solo; no existe (ni se crea aquí) una función que capture `motivo`
//   para una transición genérica, así que ese campo queda vacío salvo en
//   el retiro (que sí lo captura, vía `fn_mant_dar_baja_activo`).
// - La integración profunda con OT/planes/incidencias/inspecciones/
//   contratos/garantías/cumplimiento/inventario ("conectar visualmente") es
//   Fase 5 — el tab Mantenimiento aquí trae lo que ya existía (costos,
//   MANT-6) más enlaces simples a esas pantallas, sin filtrado por activo.
// - "Documentos" no es una pestaña aparte: `activos` solo tiene dos FK
//   opcionales a un único documento cada una (soporte, imagen) — se
//   muestran al final de General, no ameritan una séptima pestaña.
// - "Ciclo de vida" + "Historial" del prompt (§17-18) se combinan en una
//   sola pestaña Historial: el mismo `activo_estado_historial` ya cubre
//   ambos (transición + motivo + fecha + usuario), y ahí viven ahora
//   "Cambiar estado"/"Retirar".
// - Criticidad (la 5ª operación que Fase 4 lista) ya tenía UI completa
//   desde MANT-1 (tab Técnico) — no se repite aquí.
import type { Database } from '@aquila/shared'
import QRCode from 'qrcode'
import { TRANSICIONES_VALIDAS, type ActivoEstado, type LineaComprobante } from '~/stores/activos'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const route = useRoute()
const tenantStore = useTenantStore()
// Fase 6 (D-94): "permisos" — mismo criterio que el Registro Maestro, oculta toda acción de
// escritura (editar, QR, subir fotos, atributos, cambiar estado, capitalizar, depreciar,
// retirar) para quien solo tiene `data:read` (auditor).
const puedeEscribir = computed(() => tenantStore.puede('data:create'))
const activosStore = useActivosStore()
const inventarioStore = useMantenimientoInventarioStore()
const documentosStore = useDocumentosStore()
const comprobantesStore = useComprobantesStore()
// Fase 5 (D-92): integraciones — cada store se filtra por ESTE activo, no por el tenant
// completo (antes eran "enlaces simples... sin filtrado por activo", ver D-90).
const otStore = useMantenimientoOrdenesTrabajoStore()
const planesStore = useMantenimientoPlanesStore()
const inspeccionesStore = useMantenimientoInspeccionesStore()
const incidenciasStore = useMantenimientoIncidenciasStore()
const contratosStore = useMantenimientoContratosStore()
const garantiasStore = useMantenimientoGarantiasStore()
const cumplimientoStore = useCumplimientoStore()
const saludStore = useMantenimientoSaludStore()

const activoId = route.params.id as string

const unidades = ref<Awaited<ReturnType<typeof cargarListaTipos>>>([])
const centrosCosto = ref<Awaited<ReturnType<typeof cargarListaTipos>>>([])
// Catálogos para el drawer de edición (Fase 2) — mismos que carga el Registro Maestro.
const tiposActivo = ref<Awaited<ReturnType<typeof cargarListaTipos>>>([])
const categoriasActivo = ref<Awaited<ReturnType<typeof cargarListaTipos>>>([])
const nombreUnidad = computed(() => new Map(unidades.value.map((u) => [u.id, u.nombre])))
const nombreCentroCosto = computed(() => new Map(centrosCosto.value.map((c) => [c.id, c.nombre])))

// MANT-6 §4.4: costos — SIEMPRE leídos de mant_costos() (presupuesto_ejecucion), año en curso.
const hoy = new Date()
const costosDesde = ref(`${hoy.getFullYear()}-01-01`)
const costosHasta = ref(hoy.toISOString().slice(0, 10))
async function cargarCostos(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await inventarioStore.cargarCostos(tenantId, costosDesde.value, costosHasta.value)
}
const costoActivo = computed(() =>
  inventarioStore.costos
    .filter((c) => c.activo_id === activoId)
    .reduce((acc, c) => acc + (c.monto ?? 0), 0),
)

const documentoSoporte = ref<{ nombre_archivo: string; storage_path: string } | null>(null)
const documentoImagen = ref<{ nombre_archivo: string; storage_path: string } | null>(null)
async function cargarDocumentos(): Promise<void> {
  const a = activosStore.activo
  documentoSoporte.value = a?.documento_soporte_id ? await documentosStore.documentoPorId(a.documento_soporte_id) : null
  documentoImagen.value = a?.imagen_documento_id ? await documentosStore.documentoPorId(a.imagen_documento_id) : null
}
async function descargarDocumento(doc: { storage_path: string; nombre_archivo: string } | null): Promise<void> {
  if (!doc) return
  const url = await documentosStore.urlDescarga(doc.storage_path)
  window.open(url, '_blank', 'noopener')
}

// Cabecera (D-93): la más antigua de la galería de fotos (Fase 5, D-92) es la portada — la
// primera que se sube es la que se eligió para presentar el activo, mismo criterio que
// fn_directorio_listar (EXS-4) usa para el logo/foto de una ficha del directorio.
const fotoPortadaUrl = ref<string | null>(null)
async function cargarFotoPortada(tenantId: string): Promise<void> {
  const fotos = await documentosStore.cargarImagenesActivo(tenantId, activoId)
  fotoPortadaUrl.value = fotos[0]?.storage_path ? await documentosStore.urlDescarga(fotos[0].storage_path) : null
}

// Fase 6 (D-94): "manejo de errores" — si cualquiera de las cargas falla (red, RLS), antes se
// veía una ficha a medio pintar sin ninguna pista de qué pasó; ahora se muestra el motivo y el
// botón "Actualizar" de la cabecera sirve de reintento.
const errorCarga = ref<string | null>(null)
async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  errorCarga.value = null
  try {
    await cargarInterno(tenantId)
  } catch (excepcion) {
    errorCarga.value = mensajeError(excepcion, 'No se pudo cargar la ficha del activo.')
  }
}
async function cargarInterno(tenantId: string): Promise<void> {
  await Promise.all([
    activosStore.cargarFicha(tenantId, activoId),
    activosStore.cargarActivos(tenantId),
    activosStore.cargarListado(tenantId),
    activosStore.cargarHistorialEstado(activoId),
    activosStore.cargarPpeActivo(tenantId, activoId),
    unidades.value.length === 0
      ? cargarListaTipos(tenantId, 'UNIDAD_MEDIDA').then((data) => { unidades.value = data })
      : Promise.resolve(),
    centrosCosto.value.length === 0
      ? cargarListaTipos(tenantId, 'CENTRO_COSTO').then((data) => { centrosCosto.value = data })
      : Promise.resolve(),
    tiposActivo.value.length === 0
      ? cargarListaTipos(tenantId, 'TIPO_ACTIVO').then((data) => { tiposActivo.value = data })
      : Promise.resolve(),
    categoriasActivo.value.length === 0
      ? cargarListaTipos(tenantId, 'CATEGORIA_ACTIVO').then((data) => { categoriasActivo.value = data })
      : Promise.resolve(),
    comprobantesStore.cargarPeriodos(tenantId),
    cargarCostos(),
    otStore.cargarOrdenes(tenantId, activoId),
    planesStore.cargarProgramacionesTenant(tenantId, activoId),
    inspeccionesStore.cargarInspecciones(tenantId, undefined, activoId),
    incidenciasStore.cargarIncidencias(tenantId, activoId),
    contratosStore.cargarContratosPorActivo(tenantId, activoId),
    garantiasStore.cargarGarantiasVigentes(activoId),
    cumplimientoStore.cargarEstados(tenantId),
    saludStore.cargarSalud({ tenantId, activoId }),
  ])
  await cargarDocumentos()
  await cargarFotoPortada(tenantId)
}
onMounted(cargar)

// ── Fase 5 (D-92): cumplimiento se trae del tenant completo (mant_estado_cumplimiento no
// acepta un filtro por activo) y se filtra en cliente — mismo criterio que costoActivo arriba
// con mant_costos(). ──────────────────────────────────────────────────────────────────────
const cumplimientoActivo = computed(() =>
  cumplimientoStore.estados.filter((e) => e.activo_id === activoId),
)

const filaListado = computed(() => activosStore.listado.find((f) => f.id === activoId) ?? null)
const activoPadre = computed(() => {
  const a = activosStore.activo
  if (!a?.activo_padre_id) return null
  return activosStore.activos.find((x) => x.id === a.activo_padre_id) ?? null
})

function edadActivo(fechaPuestaServicio: string | null): string {
  if (!fechaPuestaServicio) return '—'
  const inicio = new Date(`${fechaPuestaServicio}T00:00:00`)
  const meses = Math.max(
    0,
    (hoy.getFullYear() - inicio.getFullYear()) * 12 + (hoy.getMonth() - inicio.getMonth()),
  )
  const anios = Math.floor(meses / 12)
  const resto = meses % 12
  if (anios === 0) return `${String(resto)} m`
  return resto === 0 ? `${String(anios)} a` : `${String(anios)}a ${String(resto)}m`
}

function porcentajeVidaUtilConsumida(): number {
  const f = filaListado.value
  if (!f || f.vida_util_meses === null || f.vida_util_restante_meses === null || f.vida_util_meses <= 0) return 0
  const consumida = f.vida_util_meses - f.vida_util_restante_meses
  return Math.min(100, Math.max(0, Math.round((consumida / f.vida_util_meses) * 100)))
}

// ── Cabecera (D-93): "datos importantes" — vida útil y salud como etiqueta simple, la
// función de salud (MANT-9) puede no tener un set vigente y devuelve `indice: null`. ──────
function vidaUtilRestanteLabel(): string {
  const meses = filaListado.value?.vida_util_restante_meses
  if (meses === null || meses === undefined) return '—'
  return meses <= 0 ? 'Vencida' : `${String(meses)} m`
}
const saludIndice = computed(() => {
  const i = saludStore.salud?.indice
  return i === null || i === undefined ? null : Math.round(i)
})
function saludColor(indice: number): 'success' | 'warning' | 'error' {
  return indice >= 70 ? 'success' : indice >= 40 ? 'warning' : 'error'
}

// ── Pestañas ───────────────────────────────────────────────────────────
type Tab = 'resumen' | 'general' | 'tecnico' | 'mantenimiento' | 'contabilidad' | 'historial'
const TABS: ReadonlyArray<{ id: Tab; etiqueta: string }> = [
  { id: 'resumen', etiqueta: 'Resumen' },
  { id: 'general', etiqueta: 'General' },
  { id: 'tecnico', etiqueta: 'Técnico' },
  { id: 'mantenimiento', etiqueta: 'Mantenimiento' },
  { id: 'contabilidad', etiqueta: 'Contabilidad' },
  { id: 'historial', etiqueta: 'Historial' },
]
const tabActiva = ref<Tab>('resumen')
const tabItems = computed(() => TABS.map((t) => ({ label: t.etiqueta, value: t.id })))

// ── Edición (Fase 2, reutilizada tal cual) ────────────────────────────────
const drawerAbierto = ref(false)
async function alGuardar(): Promise<void> {
  drawerAbierto.value = false
  await cargar()
}

// ── QR (§13/§24, MANT-0 generar-qr-activo — idempotente, nunca se firma acá) ──
const generandoQr = ref(false)
const errorQr = ref<string | null>(null)
async function generarQr(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  errorQr.value = null
  generandoQr.value = true
  try {
    await activosStore.generarQr(tenantId, activoId)
  } catch (excepcion) {
    errorQr.value = mensajeError(excepcion, 'No se pudo generar el código QR.')
  } finally {
    generandoQr.value = false
  }
}

// Render gráfico del QR (D-92) — antes solo se mostraba el `qr_token` como texto plano. El
// token codificado es el mismo que resuelve `ver-activo` (§24): esta pantalla no inventa un
// destino público nuevo, solo dibuja el mismo valor como código escaneable en vez de un
// textarea. Se genera en el cliente (qrcode) para no depender de un servicio externo.
const qrImagenUrl = ref<string | null>(null)
watch(
  () => activosStore.activo?.qr_token,
  async (token) => {
    qrImagenUrl.value = token ? await QRCode.toDataURL(token, { width: 200, margin: 1 }) : null
  },
  { immediate: true },
)

// ── Formulario de atributos técnicos (MANT-1 §3.4, sin cambios) ──────────
const form = reactive<Record<string, string | number | boolean | undefined>>({})
const guardadoOk = ref(false)
const errorGuardarAtributos = ref<string | null>(null)

function sincronizarForm(): void {
  for (const key of Object.keys(form)) Reflect.deleteProperty(form, key)
  const atributos = (activosStore.activo?.atributos ?? {}) as Record<
    string,
    string | number | boolean | undefined
  >
  for (const def of activosStore.definiciones) {
    form[def.codigo] = atributos[def.codigo] ?? (def.tipo_dato === 'booleano' ? false : undefined)
  }
}
watch(() => activosStore.activo, sincronizarForm)

async function guardarAtributos(): Promise<void> {
  errorGuardarAtributos.value = null
  guardadoOk.value = false
  const payload: Record<string, string | number | boolean> = {}
  for (const [codigo, valor] of Object.entries(form)) {
    if (valor !== undefined && valor !== '') payload[codigo] = valor
  }
  try {
    await activosStore.actualizarAtributos(activoId, payload)
    guardadoOk.value = true
  } catch (e) {
    errorGuardarAtributos.value = mensajeError(e, 'No se pudo guardar')
  }
}

async function evaluar(criterioId: string, valor: string): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await activosStore.evaluarCriterio(tenantId, activoId, criterioId, valor)
}
function valorEvaluado(criterioId: string): string | undefined {
  return activosStore.evaluaciones.find((e) => e.criterio_id === criterioId)?.valor
}
function booleanoValor(codigo: string): boolean | undefined {
  return form[codigo] as boolean | undefined
}
function actualizarBooleano(codigo: string, valor: unknown): void {
  form[codigo] = valor as boolean | undefined
}
function opcionValor(codigo: string): string | undefined {
  return form[codigo] as string | undefined
}
function actualizarOpcion(codigo: string, valor: unknown): void {
  form[codigo] = valor as string | undefined
}

function formatoFechaHistorial(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

type EstadoHistorialRow = Database['public']['Tables']['activo_estado_historial']['Row']

// ── Fase 4 (D-91): operaciones de dominio ─────────────────────────────────
const periodosAbiertos = computed(() =>
  comprobantesStore.periodos
    .filter((p) => p.contable_estado === 'abierto')
    .map((p) => ({ label: `${MESES[p.mes - 1]} ${String(p.anio)}`, value: p.id })),
)
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

/** Evidencia contable compartida (§15 punto 7) — se llena tras cualquiera de las tres
 * operaciones que puede generar un comprobante, y se muestra en el mismo bloque. */
const evidenciaTitulo = ref<string | null>(null)
const evidenciaLineas = ref<LineaComprobante[]>([])
async function mostrarEvidencia(titulo: string, comprobanteId: string | null): Promise<void> {
  if (!comprobanteId) { evidenciaTitulo.value = null; evidenciaLineas.value = []; return }
  evidenciaLineas.value = await activosStore.cargarLineasComprobante(comprobanteId)
  evidenciaTitulo.value = titulo
}

// -- Cambiar estado (transiciones genéricas, sin motivo — ver cabecera) --
const proximosEstados = computed<ActivoEstado[]>(() => {
  const actual = activosStore.activo?.estado
  if (!actual) return []
  return TRANSICIONES_VALIDAS[actual].filter((e) => e !== 'retirado')
})
const cambiandoEstado = ref(false)
const errorEstado = ref<string | null>(null)
async function cambiarA(nuevoEstado: ActivoEstado): Promise<void> {
  errorEstado.value = null
  cambiandoEstado.value = true
  try {
    await activosStore.cambiarEstado(activoId, nuevoEstado)
    await cargar()
  } catch (excepcion) {
    errorEstado.value = mensajeError(excepcion, 'No se pudo cambiar el estado.')
  } finally {
    cambiandoEstado.value = false
  }
}

// -- Retirar / dar de baja (§19) --
const puedeRetirar = computed(() => {
  const actual = activosStore.activo?.estado
  return !!actual && TRANSICIONES_VALIDAS[actual].includes('retirado')
})
const modalRetiro = ref(false)
const motivoRetiro = ref('')
const periodoRetiro = ref<string | undefined>(undefined)
const retirando = ref(false)
const errorRetiro = ref<string | null>(null)
function abrirRetiro(): void {
  motivoRetiro.value = ''
  periodoRetiro.value = periodosAbiertos.value[0]?.value
  errorRetiro.value = null
  modalRetiro.value = true
}
async function confirmarRetiro(): Promise<void> {
  if (!motivoRetiro.value.trim()) return
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  errorRetiro.value = null
  retirando.value = true
  try {
    const comprobanteId = await activosStore.darDeBajaActivo(
      tenantId, activoId, (activosStore.activo?.capitalizado ? periodoRetiro.value : null) ?? null, motivoRetiro.value.trim(),
    )
    modalRetiro.value = false
    await cargar()
    await mostrarEvidencia('Comprobante de baja', comprobanteId)
  } catch (excepcion) {
    errorRetiro.value = mensajeError(excepcion, 'No se pudo dar de baja el activo.')
  } finally {
    retirando.value = false
  }
}

// -- Capitalizar (§15) --
const requisitosCapitalizacion = computed(() => {
  const a = activosStore.activo
  return {
    noEsencial: a?.naturaleza_bien !== 'bien_comun_esencial',
    bloqueCompleto: !!(a?.valor_adquisicion && a.fecha_adquisicion && a.contable_cuenta_id && a.vida_util_meses),
  }
})
const puedeCapitalizar = computed(() =>
  !activosStore.activo?.capitalizado
  && requisitosCapitalizacion.value.noEsencial
  && requisitosCapitalizacion.value.bloqueCompleto,
)
const modalCapitalizar = ref(false)
const periodoCapitalizar = ref<string | undefined>(undefined)
const capitalizando = ref(false)
const errorCapitalizar = ref<string | null>(null)
function abrirCapitalizar(): void {
  periodoCapitalizar.value = periodosAbiertos.value[0]?.value
  errorCapitalizar.value = null
  modalCapitalizar.value = true
}
async function confirmarCapitalizar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !periodoCapitalizar.value) return
  errorCapitalizar.value = null
  capitalizando.value = true
  try {
    const comprobanteId = await activosStore.capitalizarActivo(tenantId, activoId, periodoCapitalizar.value)
    modalCapitalizar.value = false
    await cargar()
    await mostrarEvidencia('Comprobante de capitalización', comprobanteId)
  } catch (excepcion) {
    errorCapitalizar.value = mensajeError(excepcion, 'No se pudo capitalizar el activo.')
  } finally {
    capitalizando.value = false
  }
}

// -- Reconocer depreciación (§16) --
const modalDepreciacion = ref(false)
const periodoDepreciacion = ref<string | undefined>(undefined)
const previaDepreciacion = ref<{ cuota_periodo: number } | null>(null)
const cargandoPrevia = ref(false)
const reconociendo = ref(false)
const errorDepreciacion = ref<string | null>(null)
const resultadoDepreciacion = ref<string | null>(null)
const resultadoDepreciacionColor = ref<'success' | 'warning' | 'error'>('success')
async function abrirDepreciacion(): Promise<void> {
  periodoDepreciacion.value = periodosAbiertos.value[0]?.value
  errorDepreciacion.value = null
  resultadoDepreciacion.value = null
  resultadoDepreciacionColor.value = 'success'
  previaDepreciacion.value = null
  modalDepreciacion.value = true
  await cargarPrevia()
}
async function cargarPrevia(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !periodoDepreciacion.value) return
  cargandoPrevia.value = true
  try {
    previaDepreciacion.value = await activosStore.previsualizarDepreciacion(tenantId, periodoDepreciacion.value, activoId)
  } catch {
    previaDepreciacion.value = null
  } finally {
    cargandoPrevia.value = false
  }
}
watch(periodoDepreciacion, () => { if (modalDepreciacion.value) void cargarPrevia() })
async function confirmarDepreciacion(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !periodoDepreciacion.value) return
  errorDepreciacion.value = null
  reconociendo.value = true
  try {
    const resumen = await activosStore.reconocerDepreciacion(tenantId, periodoDepreciacion.value)
    const propio = resumen.find((r) => r.activo_id === activoId)
    resultadoDepreciacion.value = propio
      ? propio.detalle ?? { creado: 'Depreciación reconocida.', omitido: 'Ya estaba reconocida para este período — no se duplicó.', fallido: 'No se pudo reconocer.' }[propio.categoria] ?? propio.categoria
      : 'Este activo no quedó incluido en el resumen (revisa si sigue capitalizado).'
    resultadoDepreciacionColor.value = propio?.categoria === 'creado' ? 'success' : propio?.categoria === 'fallido' ? 'error' : 'warning'
    await cargar()
    if (propio?.categoria === 'creado') await mostrarEvidencia('Comprobante de depreciación', propio.comprobante_id)
  } catch (excepcion) {
    errorDepreciacion.value = mensajeError(excepcion, 'No se pudo reconocer la depreciación.')
  } finally {
    reconociendo.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Encabezado (§13, D-93): tres secciones — foto+info, QR pequeño, datos importantes -->
    <div class="flex items-center justify-between gap-4 flex-wrap">
      <NuxtLink to="/mantenimiento/activos" class="text-xs text-muted hover:text-primary hover:underline">
        ← Activos
      </NuxtLink>
      <div class="flex items-center gap-2">
        <UButton variant="ghost" icon="i-lucide-refresh-cw" :loading="activosStore.loading" @click="cargar()">
          Actualizar
        </UButton>
        <UButton v-if="puedeEscribir" icon="i-lucide-pencil" @click="drawerAbierto = true">Editar</UButton>
      </div>
    </div>

    <UAlert v-if="errorCarga" color="error" variant="soft" :title="errorCarga" />
    <UAlert v-if="errorQr" color="error" variant="soft" :title="errorQr" />

    <!-- Fase 6 (D-94): "estados de carga" — antes, la primera carga mostraba "Activo"/"—" en
         vez de nada, indistinguible de datos reales vacíos. -->
    <div v-if="!activosStore.activo" class="rounded-lg border border-default p-6">
      <div class="flex gap-5">
        <USkeleton class="h-56 w-56 shrink-0 rounded-lg" />
        <div class="flex-1 space-y-3 pt-2">
          <USkeleton class="h-5 w-20" />
          <USkeleton class="h-7 w-64" />
          <USkeleton class="h-4 w-48" />
          <USkeleton class="h-4 w-40" />
        </div>
      </div>
    </div>
    <div v-else class="rounded-lg border border-default p-6">
      <div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
        <!-- Sección 1: foto + información -->
        <div class="flex gap-5 min-w-0">
          <div class="relative shrink-0">
            <img
              v-if="fotoPortadaUrl" :src="fotoPortadaUrl" alt=""
              class="h-56 w-56 rounded-lg border border-default object-cover"
            >
            <div v-else class="flex h-56 w-56 items-center justify-center rounded-lg border border-default bg-elevated text-muted">
              <UIcon name="i-lucide-image" class="size-12" />
            </div>
            <button
              type="button"
              class="absolute inset-x-1 bottom-1 flex items-center justify-center gap-1 rounded-md bg-black/60 py-1.5 text-xs text-white hover:bg-black/75"
              @click="tabActiva = 'general'"
            >
              <UIcon name="i-lucide-images" class="size-3.5" /> Ver galería
            </button>
          </div>
          <div class="min-w-0 flex-1 space-y-1.5">
            <UBadge v-if="activosStore.activo" :color="ESTADO_COLOR[activosStore.activo.estado] ?? 'neutral'" variant="soft" size="sm">
              {{ ESTADO_LABEL[activosStore.activo.estado] ?? activosStore.activo.estado }}
            </UBadge>
            <h1 class="truncate text-2xl font-semibold">{{ activosStore.activo?.nombre ?? 'Activo' }}</h1>
            <p class="text-sm text-muted">
              <span class="font-mono">{{ activosStore.activo?.codigo }}</span>
              · {{ filaListado?.tipo_nombre ?? '—' }} · {{ filaListado?.categoria_nombre ?? '—' }}
            </p>
            <p v-if="activosStore.activo?.descripcion" class="text-sm text-muted line-clamp-3 max-w-2xl">
              {{ activosStore.activo.descripcion }}
            </p>
            <dl class="space-y-1.5 pt-1 text-sm text-muted">
              <div class="flex items-center gap-1.5">
                <UIcon name="i-lucide-map-pin" class="size-4 shrink-0" />{{ filaListado?.ubicacion ?? 'Sin ubicación' }}
              </div>
              <div v-if="activosStore.activo?.marca || activosStore.activo?.modelo" class="flex items-center gap-1.5">
                <UIcon name="i-lucide-tag" class="size-4 shrink-0" />
                {{ [activosStore.activo?.marca, activosStore.activo?.modelo].filter(Boolean).join(' · ') }}
              </div>
              <div v-if="activosStore.activo?.numero_serie" class="flex items-center gap-1.5">
                <UIcon name="i-lucide-hash" class="size-4 shrink-0" />Serial: {{ activosStore.activo.numero_serie }}
              </div>
            </dl>
          </div>
        </div>

        <!-- Sección 2: código QR pequeño -->
        <div class="flex flex-col items-center gap-1.5 border-default pt-4 lg:w-40 lg:border-l lg:pt-0 lg:pl-8">
          <p class="text-xs font-medium text-muted">Código QR</p>
          <template v-if="activosStore.activo?.qr_token">
            <img
              v-if="qrImagenUrl" :src="qrImagenUrl" alt="Código QR del activo"
              class="h-28 w-28 rounded-md border border-default bg-white p-1"
            >
            <p class="font-mono text-xs text-muted">{{ activosStore.activo.codigo }}</p>
            <UButton
              v-if="qrImagenUrl" :href="qrImagenUrl" :download="`qr-${activosStore.activo.codigo}.png`"
              variant="soft" size="xs" icon="i-lucide-download"
            >
              Descargar
            </UButton>
          </template>
          <template v-else>
            <UIcon name="i-lucide-qr-code" class="size-10 text-muted" />
            <UButton v-if="puedeEscribir" size="xs" :loading="generandoQr" @click="generarQr()">Generar QR</UButton>
            <p v-else class="text-xs text-muted">Sin generar</p>
          </template>
        </div>

        <!-- Sección 3: datos importantes -->
        <div class="space-y-2.5 border-default pt-4 lg:w-[258px] lg:border-l lg:pt-0 lg:pl-8">
          <div class="flex items-center justify-between text-sm">
            <span class="text-muted">Criticidad</span>
            <UBadge v-if="filaListado?.criticidad_banda" variant="soft" size="sm" class="capitalize">{{ filaListado.criticidad_banda }}</UBadge>
            <span v-else class="text-xs text-muted">Sin evaluar</span>
          </div>
          <div class="space-y-1">
            <div class="flex items-center justify-between text-sm">
              <span class="text-muted">Salud del activo</span>
              <span class="font-medium">{{ saludIndice !== null ? `${saludIndice}%` : '—' }}</span>
            </div>
            <UProgress v-if="saludIndice !== null" :model-value="saludIndice" size="xs" :color="saludColor(saludIndice)" />
          </div>
          <div class="flex items-center justify-between text-sm">
            <span class="text-muted">Vida útil restante</span>
            <span class="font-medium">{{ vidaUtilRestanteLabel() }}</span>
          </div>
          <div class="flex items-center justify-between text-sm">
            <span class="flex items-center gap-1 text-muted"><UIcon name="i-lucide-calendar" class="size-3.5" />Próx. mantenimiento</span>
            <span class="font-medium">{{ filaListado?.proximo_mantenimiento ?? '—' }}</span>
          </div>
        </div>
      </div>
    </div>

    <UTabs :items="tabItems" :model-value="tabActiva" variant="link" :content="false" @update:model-value="(v) => (tabActiva = v as Tab)" />

    <!-- TAB 1 — Resumen -->
    <section v-if="tabActiva === 'resumen'" class="grid sm:grid-cols-2 gap-4">
      <div class="rounded-lg border border-default p-4 space-y-3">
        <h2 class="font-medium">Identificación</h2>
        <dl class="text-sm space-y-1.5">
          <div class="flex justify-between"><dt class="text-muted">Código</dt><dd class="font-mono">{{ activosStore.activo?.codigo }}</dd></div>
          <div class="flex justify-between"><dt class="text-muted">Categoría</dt><dd>{{ filaListado?.categoria_nombre ?? '—' }}</dd></div>
          <div class="flex justify-between"><dt class="text-muted">Tipo</dt><dd>{{ filaListado?.tipo_nombre ?? '—' }}</dd></div>
          <div class="flex justify-between"><dt class="text-muted">Ubicación</dt><dd>{{ filaListado?.ubicacion ?? '—' }}</dd></div>
          <div class="flex justify-between"><dt class="text-muted">Edad</dt><dd>{{ edadActivo(activosStore.activo?.fecha_puesta_servicio ?? null) }}</dd></div>
        </dl>
      </div>
      <div class="rounded-lg border border-default p-4 space-y-3">
        <h2 class="font-medium">Indicadores</h2>
        <dl class="text-sm space-y-1.5">
          <div class="flex justify-between"><dt class="text-muted">Capitalizado</dt><dd>{{ activosStore.activo?.capitalizado ? 'Sí' : 'No' }}</dd></div>
          <div class="flex justify-between"><dt class="text-muted">Valor neto</dt><dd>{{ filaListado?.valor_neto === null || filaListado?.valor_neto === undefined ? '—' : formatoMoneda(filaListado.valor_neto) }}</dd></div>
          <div class="flex justify-between"><dt class="text-muted">Último mantenimiento</dt><dd>{{ filaListado?.ultimo_mantenimiento ?? '—' }}</dd></div>
          <div class="flex justify-between"><dt class="text-muted">Próximo mantenimiento</dt><dd>{{ filaListado?.proximo_mantenimiento ?? '—' }}</dd></div>
        </dl>
        <div v-if="filaListado?.vida_util_meses" class="space-y-1">
          <p class="text-xs text-muted">Vida útil consumida</p>
          <div class="flex items-center gap-2">
            <UProgress :model-value="porcentajeVidaUtilConsumida()" size="sm" class="flex-1" />
            <span class="text-xs text-muted">{{ filaListado.vida_util_restante_meses !== null && filaListado.vida_util_restante_meses <= 0 ? 'Vencida' : `${String(filaListado.vida_util_restante_meses)} m restantes` }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- TAB 2 — General -->
    <section v-else-if="tabActiva === 'general'" class="grid sm:grid-cols-2 gap-4">
      <div class="rounded-lg border border-default p-4 space-y-3">
        <h2 class="font-medium">Clasificación</h2>
        <dl class="text-sm space-y-1.5">
          <div class="flex justify-between"><dt class="text-muted">Naturaleza del bien</dt><dd>{{ NATURALEZA_LABEL[activosStore.activo?.naturaleza_bien ?? ''] ?? '—' }}</dd></div>
          <div class="flex justify-between"><dt class="text-muted">Origen</dt><dd>{{ ORIGEN_LABEL[activosStore.activo?.origen ?? ''] ?? '—' }}</dd></div>
          <div class="flex justify-between items-center">
            <dt class="text-muted">Activo padre</dt>
            <dd>
              <NuxtLink v-if="activoPadre" :to="`/mantenimiento/activos/${activoPadre.id}`" class="text-primary hover:underline">
                {{ activoPadre.codigo }} — {{ activoPadre.nombre }}
              </NuxtLink>
              <span v-else>—</span>
            </dd>
          </div>
        </dl>
      </div>
      <div class="rounded-lg border border-default p-4 space-y-3">
        <h2 class="font-medium">Fechas</h2>
        <dl class="text-sm space-y-1.5">
          <div class="flex justify-between"><dt class="text-muted">Adquisición</dt><dd>{{ activosStore.activo?.fecha_adquisicion ?? '—' }}</dd></div>
          <div class="flex justify-between"><dt class="text-muted">Instalación</dt><dd>{{ activosStore.activo?.fecha_instalacion ?? '—' }}</dd></div>
          <div class="flex justify-between"><dt class="text-muted">Puesta en servicio</dt><dd>{{ activosStore.activo?.fecha_puesta_servicio ?? '—' }}</dd></div>
          <div v-if="activosStore.activo?.fecha_retiro" class="flex justify-between"><dt class="text-muted">Retiro</dt><dd>{{ activosStore.activo.fecha_retiro }}</dd></div>
        </dl>
      </div>
      <div class="rounded-lg border border-default p-4 space-y-2 sm:col-span-2">
        <h2 class="font-medium">Descripción</h2>
        <p class="text-sm text-muted">{{ activosStore.activo?.descripcion || 'Sin descripción.' }}</p>
      </div>
      <div v-if="documentoSoporte || documentoImagen" class="rounded-lg border border-default p-4 space-y-2 sm:col-span-2">
        <h2 class="font-medium">Documentos</h2>
        <div class="flex flex-col gap-1 text-sm">
          <button v-if="documentoSoporte" type="button" class="text-left text-primary hover:underline" @click="descargarDocumento(documentoSoporte)">
            📄 {{ documentoSoporte.nombre_archivo }} (soporte)
          </button>
          <button v-if="documentoImagen" type="button" class="text-left text-primary hover:underline" @click="descargarDocumento(documentoImagen)">
            🖼️ {{ documentoImagen.nombre_archivo }} (imagen)
          </button>
        </div>
      </div>
      <div class="rounded-lg border border-default p-4 sm:col-span-2">
        <UiGaleriaDocumentos
          :activo-id="activoId"
          solo-imagenes
          titulo="Fotos del activo"
          vacio="Todavía no hay fotos de este activo — se recomiendan al menos 5 (fachada, placa, estado general, detalles)."
          :editable="puedeEscribir"
          motivo-bloqueo="Tu rol solo tiene acceso de lectura — no puedes añadir fotos."
        />
      </div>
    </section>

    <!-- TAB 3 — Técnico (MANT-1 §3.4, sin cambios de fondo) -->
    <section v-else-if="tabActiva === 'tecnico'" class="space-y-6">
      <div class="rounded-lg border border-default p-4 space-y-3">
        <h2 class="font-medium">Identificación técnica</h2>
        <dl class="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
          <div class="flex justify-between"><dt class="text-muted">Marca</dt><dd>{{ activosStore.activo?.marca ?? '—' }}</dd></div>
          <div class="flex justify-between"><dt class="text-muted">Modelo</dt><dd>{{ activosStore.activo?.modelo ?? '—' }}</dd></div>
          <div class="flex justify-between"><dt class="text-muted">Fabricante</dt><dd>{{ activosStore.activo?.fabricante ?? '—' }}</dd></div>
          <div class="flex justify-between"><dt class="text-muted">Número de serie</dt><dd>{{ activosStore.activo?.numero_serie ?? '—' }}</dd></div>
        </dl>
      </div>

      <section class="space-y-4 rounded-lg border border-default p-4">
        <h2 class="font-medium">Atributos y especificaciones</h2>
        <p v-if="activosStore.definiciones.length === 0" class="text-sm text-muted">
          Este tipo de activo no tiene atributos técnicos definidos —
          <NuxtLink to="/mantenimiento/configuracion" class="text-primary underline">configúralos aquí</NuxtLink>.
        </p>
        <div v-else class="grid sm:grid-cols-2 gap-4">
          <UFormField
            v-for="def in activosStore.definiciones" :key="def.id"
            :label="`${def.nombre}${def.unidad_id ? ` (${nombreUnidad.get(def.unidad_id) ?? ''})` : ''}${def.obligatorio ? ' *' : ''}`"
            :name="def.codigo"
          >
            <UInput v-if="def.tipo_dato === 'numero'" v-model.number="form[def.codigo]" type="number" />
            <UInput v-else-if="def.tipo_dato === 'texto'" v-model="form[def.codigo]" type="text" />
            <UInput v-else-if="def.tipo_dato === 'fecha'" v-model="form[def.codigo]" type="date" />
            <USelect
              v-else-if="def.tipo_dato === 'booleano'" :model-value="booleanoValor(def.codigo)"
              :items="[{ label: 'Sí', value: true }, { label: 'No', value: false }]" class="w-full"
              @update:model-value="(v) => actualizarBooleano(def.codigo, v)"
            />
            <USelect
              v-else-if="def.tipo_dato === 'opcion'" :model-value="opcionValor(def.codigo)"
              :items="(def.opciones ?? []).map((o) => ({ label: o, value: o }))" class="w-full"
              @update:model-value="(v) => actualizarOpcion(def.codigo, v)"
            />
          </UFormField>
        </div>
        <UAlert v-if="errorGuardarAtributos" color="error" variant="soft" :title="errorGuardarAtributos" />
        <UAlert v-if="guardadoOk" color="success" variant="soft" title="Atributos guardados" />
        <UButton v-if="activosStore.definiciones.length > 0 && puedeEscribir" :loading="activosStore.guardando" @click="guardarAtributos()">
          Guardar atributos
        </UButton>
      </section>

      <section class="space-y-4 rounded-lg border border-default p-4">
        <h2 class="font-medium">Criticidad</h2>
        <UAlert
          v-if="activosStore.errorCriticidad?.includes('CRITICIDAD_SIN_SET_VIGENTE')"
          color="warning" variant="soft" title="No hay un set de criterios de criticidad vigente para esta copropiedad."
        >
          <template #description>
            <NuxtLink to="/mantenimiento/configuracion" class="text-primary underline">Configura y activa un set de criterios</NuxtLink>
          </template>
        </UAlert>
        <UAlert v-else-if="activosStore.errorCriticidad" color="warning" variant="soft" :title="activosStore.errorCriticidad" />

        <div v-if="activosStore.criteriosVigentes.length > 0" class="space-y-3">
          <div v-for="c in activosStore.criteriosVigentes" :key="c.id" class="flex items-center justify-between gap-4 flex-wrap">
            <p class="text-sm font-medium">{{ c.nombre }} <span class="text-muted">(peso {{ c.peso }})</span></p>
            <USelect
              :model-value="valorEvaluado(c.id)"
              :items="Object.keys(c.escala as Record<string, number>).map((k) => ({ label: k, value: k }))"
              placeholder="Sin evaluar" class="w-40"
              @update:model-value="(v) => v && evaluar(c.id, v as string)"
            />
          </div>
        </div>

        <div v-if="activosStore.criticidad" class="rounded-lg bg-elevated p-4 space-y-2">
          <div class="flex items-center gap-3">
            <p class="text-2xl font-semibold">{{ activosStore.criticidad.puntaje_total }}</p>
            <UBadge v-if="activosStore.criticidad.banda" variant="soft" size="lg" class="capitalize">{{ activosStore.criticidad.banda }}</UBadge>
          </div>
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-muted">
                <th class="font-normal py-1">Criterio</th><th class="font-normal py-1">Peso</th>
                <th class="font-normal py-1">Valor</th><th class="font-normal py-1">Puntaje</th><th class="font-normal py-1">Contribución</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="fila in activosStore.criticidad.desglose as unknown as {
                  criterio_codigo: string; criterio_nombre: string; peso: number; valor: string; puntaje: number; contribucion: number
                }[]"
                :key="fila.criterio_codigo"
              >
                <td class="py-1">{{ fila.criterio_nombre }}</td><td class="py-1">{{ fila.peso }}</td>
                <td class="py-1">{{ fila.valor }}</td><td class="py-1">{{ fila.puntaje }}</td><td class="py-1">{{ fila.contribucion }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </section>

    <!-- TAB 4 — Mantenimiento (costos existentes, MANT-6; el resto es Fase 5) -->
    <section v-else-if="tabActiva === 'mantenimiento'" class="space-y-6">
      <section class="space-y-4 rounded-lg border border-default p-4">
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <h2 class="font-medium">Costos de mantenimiento</h2>
          <div class="flex items-center gap-2">
            <UInput v-model="costosDesde" type="date" size="sm" @change="cargarCostos()" />
            <span class="text-muted text-sm">a</span>
            <UInput v-model="costosHasta" type="date" size="sm" @change="cargarCostos()" />
          </div>
        </div>
        <p class="text-2xl font-semibold tabular-nums">{{ formatoMoneda(costoActivo) }}</p>
        <p class="text-xs text-muted">
          Costo real acumulado en el rango, leído de la ejecución presupuestal — no incluye el
          costo estimado de ninguna OT (una estimación nunca sustituye al gasto real).
        </p>
      </section>

      <!-- Fase 5 (D-92): cada sección trae SOLO los registros de este activo (activo_id real en
           la consulta, no una lista del tenant completa filtrada a la vista) y enlaza al
           registro real cuando existe una ficha propia ([id].vue de ese módulo). -->
      <div class="grid sm:grid-cols-2 gap-4">
        <section class="space-y-2 rounded-lg border border-default p-4">
          <div class="flex items-center justify-between">
            <h2 class="font-medium text-sm">Órdenes de trabajo</h2>
            <UButton to="/mantenimiento/ordenes-trabajo" variant="ghost" size="xs">Ver todas</UButton>
          </div>
          <p v-if="otStore.ordenes.length === 0" class="text-sm text-muted">Sin órdenes de trabajo.</p>
          <ul v-else class="text-sm divide-y divide-default">
            <li v-for="o in otStore.ordenes.slice(0, 5)" :key="o.id" class="py-1.5">
              <NuxtLink :to="`/mantenimiento/ordenes-trabajo/${o.id}`" class="text-primary hover:underline">
                OT-{{ o.anio }}-{{ o.numero }} — {{ o.titulo }}
              </NuxtLink>
              <span class="text-xs text-muted"> · {{ o.estado.replaceAll('_', ' ') }}</span>
            </li>
          </ul>
        </section>

        <section class="space-y-2 rounded-lg border border-default p-4">
          <div class="flex items-center justify-between">
            <h2 class="font-medium text-sm">Programaciones (planes)</h2>
            <UButton to="/mantenimiento/planes" variant="ghost" size="xs">Ver todas</UButton>
          </div>
          <p v-if="planesStore.programaciones.length === 0" class="text-sm text-muted">Sin programaciones.</p>
          <ul v-else class="text-sm divide-y divide-default">
            <li v-for="p in planesStore.programaciones.slice(0, 5)" :key="p.id" class="py-1.5">
              <NuxtLink :to="`/mantenimiento/planes/${p.plan_id}`" class="text-primary hover:underline">
                {{ p.mant_planes?.nombre ?? 'Plan' }}
              </NuxtLink>
              <span class="text-xs text-muted"> · {{ p.fecha_programada }} · {{ p.estado.replaceAll('_', ' ') }}</span>
            </li>
          </ul>
        </section>

        <section class="space-y-2 rounded-lg border border-default p-4">
          <div class="flex items-center justify-between">
            <h2 class="font-medium text-sm">Incidencias</h2>
            <UButton to="/mantenimiento/incidencias" variant="ghost" size="xs">Ver todas</UButton>
          </div>
          <p v-if="incidenciasStore.incidencias.length === 0" class="text-sm text-muted">Sin incidencias.</p>
          <ul v-else class="text-sm divide-y divide-default">
            <li v-for="inc in incidenciasStore.incidencias.slice(0, 5)" :key="inc.id" class="py-1.5">
              <NuxtLink :to="`/mantenimiento/incidencias/${inc.id}`" class="text-primary hover:underline">
                INC-{{ inc.anio }}-{{ inc.numero }} — {{ inc.titulo }}
              </NuxtLink>
              <span class="text-xs text-muted"> · {{ inc.estado.replaceAll('_', ' ') }}</span>
            </li>
          </ul>
        </section>

        <section class="space-y-2 rounded-lg border border-default p-4">
          <div class="flex items-center justify-between">
            <h2 class="font-medium text-sm">Inspecciones</h2>
            <UButton to="/mantenimiento/inspecciones" variant="ghost" size="xs">Ver todas</UButton>
          </div>
          <p v-if="inspeccionesStore.inspecciones.length === 0" class="text-sm text-muted">Sin inspecciones.</p>
          <ul v-else class="text-sm divide-y divide-default">
            <li v-for="insp in inspeccionesStore.inspecciones.slice(0, 5)" :key="insp.id" class="py-1.5">
              {{ insp.fecha }} <span class="text-xs text-muted">· {{ insp.resultado.replaceAll('_', ' ') }}</span>
            </li>
          </ul>
        </section>

        <section class="space-y-2 rounded-lg border border-default p-4">
          <div class="flex items-center justify-between">
            <h2 class="font-medium text-sm">Contratos que cubren este activo</h2>
            <UButton to="/mantenimiento/contratos" variant="ghost" size="xs">Ver todos</UButton>
          </div>
          <p v-if="contratosStore.contratosPorActivo.length === 0" class="text-sm text-muted">Sin contratos asociados.</p>
          <ul v-else class="text-sm divide-y divide-default">
            <li v-for="c in contratosStore.contratosPorActivo" :key="c.id" class="py-1.5">
              <NuxtLink :to="`/mantenimiento/contratos/${c.id}`" class="text-primary hover:underline">
                {{ c.codigo }} — {{ c.objeto }}
              </NuxtLink>
            </li>
          </ul>
        </section>

        <section class="space-y-2 rounded-lg border border-default p-4">
          <h2 class="font-medium text-sm">Garantías vigentes</h2>
          <p v-if="garantiasStore.vigentes.length === 0" class="text-sm text-muted">Sin garantías vigentes hoy.</p>
          <ul v-else class="text-sm divide-y divide-default">
            <li v-for="g in garantiasStore.vigentes" :key="g.garantia_id" class="py-1.5">
              {{ g.origen }} <span class="text-xs text-muted">· vence {{ g.vigente_hasta ?? 'sin fecha' }}</span>
            </li>
          </ul>
        </section>

        <section class="space-y-2 rounded-lg border border-default p-4 sm:col-span-2">
          <div class="flex items-center justify-between">
            <h2 class="font-medium text-sm">Cumplimiento normativo</h2>
            <UButton to="/mantenimiento/cumplimiento" variant="ghost" size="xs">Ver todo</UButton>
          </div>
          <p v-if="cumplimientoActivo.length === 0" class="text-sm text-muted">Sin requisitos aplicables a este activo.</p>
          <ul v-else class="text-sm divide-y divide-default">
            <li v-for="req in cumplimientoActivo" :key="req.requisito_id" class="py-1.5 flex items-center justify-between">
              <span>{{ req.requisito_nombre }}</span>
              <UBadge :color="req.estado === 'vencido' ? 'error' : req.estado === 'por_vencer' ? 'warning' : 'success'" variant="soft" size="sm">
                {{ req.estado.replaceAll('_', ' ') }}
              </UBadge>
            </li>
          </ul>
        </section>

        <section class="space-y-2 rounded-lg border border-default p-4 sm:col-span-2">
          <div class="flex items-center justify-between">
            <h2 class="font-medium text-sm">Salud e inventario/consumos</h2>
          </div>
          <div class="flex flex-wrap gap-2">
            <UButton :to="`/mantenimiento/salud/${activoId}`" variant="soft" size="sm">Salud del activo</UButton>
            <UButton to="/mantenimiento/inventario" variant="soft" size="sm">Inventario y consumos</UButton>
          </div>
          <p class="text-xs text-muted">
            El inventario/consumos se registra por orden de trabajo, no directamente por activo
            (`mant_inventario_movimientos` no tiene `activo_id`) — el enlace lleva al módulo
            general en vez de un cruce en dos pasos (activo → OT → movimientos) que no aporta
            frente a los costos ya mostrados arriba.
          </p>
        </section>
      </div>
    </section>

    <!-- TAB 5 — Contabilidad (§14 TAB 5 + §15/§16 Fase 4: capitalizar/reconocer depreciación) -->
    <section v-else-if="tabActiva === 'contabilidad'" class="space-y-4">
      <div class="rounded-lg border border-default p-4 space-y-3">
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <div class="flex items-center gap-2">
            <h2 class="font-medium">Información contable</h2>
            <UBadge :color="activosStore.activo?.capitalizado ? 'success' : 'neutral'" variant="soft" size="sm">
              {{ activosStore.activo?.capitalizado ? 'Capitalizado' : 'No capitalizado' }}
            </UBadge>
          </div>
          <div class="flex items-center gap-2">
            <UButton v-if="puedeCapitalizar && puedeEscribir" size="sm" @click="abrirCapitalizar()">Capitalizar</UButton>
            <UButton v-if="activosStore.activo?.capitalizado && puedeEscribir" size="sm" variant="soft" @click="abrirDepreciacion()">
              Reconocer depreciación
            </UButton>
          </div>
        </div>

        <div v-if="!activosStore.activo?.capitalizado" class="space-y-2">
          <p class="text-sm text-muted">Este activo aún no está capitalizado.</p>
          <ul v-if="!puedeCapitalizar" class="text-xs text-muted space-y-1">
            <li>
              <span :class="requisitosCapitalizacion.noEsencial ? 'text-success' : 'text-error'">
                {{ requisitosCapitalizacion.noEsencial ? '✓' : '✗' }}
              </span>
              No es un bien común esencial
            </li>
            <li>
              <span :class="requisitosCapitalizacion.bloqueCompleto ? 'text-success' : 'text-error'">
                {{ requisitosCapitalizacion.bloqueCompleto ? '✓' : '✗' }}
              </span>
              Bloque contable completo (valor adquisición, fecha, cuenta, vida útil)
              <template v-if="puedeEscribir">
                — completar en <button type="button" class="text-primary hover:underline" @click="drawerAbierto = true">Editar</button>
              </template>
            </li>
          </ul>
        </div>
        <dl v-else class="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
          <div class="flex justify-between"><dt class="text-muted">Cuenta contable</dt><dd>{{ activosStore.ppeActivo?.cuenta_codigo ?? '—' }}</dd></div>
          <div class="flex justify-between"><dt class="text-muted">Centro de costo</dt><dd>{{ activosStore.activo?.centro_costo_id ? (nombreCentroCosto.get(activosStore.activo.centro_costo_id) ?? '—') : '—' }}</dd></div>
          <div class="flex justify-between"><dt class="text-muted">Valor adquisición</dt><dd>{{ activosStore.activo?.valor_adquisicion === null || activosStore.activo?.valor_adquisicion === undefined ? '—' : formatoMoneda(activosStore.activo.valor_adquisicion) }}</dd></div>
          <div class="flex justify-between"><dt class="text-muted">Depreciación acumulada</dt><dd>{{ activosStore.ppeActivo ? formatoMoneda(activosStore.ppeActivo.depreciacion_acumulada) : '—' }}</dd></div>
          <div class="flex justify-between"><dt class="text-muted">Valor neto</dt><dd>{{ activosStore.ppeActivo ? formatoMoneda(activosStore.ppeActivo.valor_neto) : '—' }}</dd></div>
          <div class="flex justify-between"><dt class="text-muted">Método de depreciación</dt><dd>{{ METODO_DEPRECIACION_LABEL[activosStore.activo?.metodo_depreciacion ?? ''] ?? '—' }}</dd></div>
          <div class="flex justify-between"><dt class="text-muted">Vida útil</dt><dd>{{ activosStore.activo?.vida_util_meses ?? '—' }} meses</dd></div>
          <div class="flex justify-between"><dt class="text-muted">Valor residual</dt><dd>{{ formatoMoneda(activosStore.activo?.valor_residual ?? 0) }}</dd></div>
          <div class="flex justify-between"><dt class="text-muted">Fecha inicio depreciación</dt><dd>{{ activosStore.activo?.fecha_inicio_depreciacion ?? '—' }}</dd></div>
        </dl>
        <p class="text-xs text-muted">
          Valores tal cual de `mant_ppe_por_activo` (MANT-0) — no se recalcula nada aquí.
        </p>
      </div>

      <div v-if="evidenciaTitulo" class="rounded-lg border border-default p-4 space-y-2">
        <h2 class="font-medium text-sm">{{ evidenciaTitulo }}</h2>
        <table class="w-full text-sm">
          <thead><tr class="text-left text-muted"><th class="font-normal py-1">Cuenta</th><th class="font-normal py-1 text-right">Débito</th><th class="font-normal py-1 text-right">Crédito</th></tr></thead>
          <tbody>
            <tr v-for="(l, i) in evidenciaLineas" :key="i" class="border-t border-default">
              <td class="py-1">{{ l.cuenta?.codigo }} — {{ l.cuenta?.nombre }}</td>
              <td class="py-1 text-right tabular-nums">{{ l.debito > 0 ? formatoMoneda(l.debito) : '—' }}</td>
              <td class="py-1 text-right tabular-nums">{{ l.credito > 0 ? formatoMoneda(l.credito) : '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- TAB 6 — Historial (§17-18 + Fase 4: cambiar estado / retirar) -->
    <section v-else-if="tabActiva === 'historial'" class="space-y-4">
      <div class="rounded-lg border border-default p-4 space-y-3">
        <h2 class="font-medium text-sm">Ciclo de vida</h2>
        <UAlert v-if="errorEstado" color="error" variant="soft" :title="errorEstado" />
        <div v-if="puedeEscribir" class="flex items-center gap-2 flex-wrap">
          <span class="text-xs text-muted">Transiciones válidas:</span>
          <UButton
            v-for="e in proximosEstados" :key="e" size="sm" variant="soft"
            :loading="cambiandoEstado" @click="cambiarA(e)"
          >
            {{ ESTADO_LABEL[e] ?? e }}
          </UButton>
          <span v-if="proximosEstados.length === 0 && !puedeRetirar" class="text-xs text-muted">Sin transiciones disponibles.</span>
          <UButton v-if="puedeRetirar" size="sm" variant="soft" color="error" @click="abrirRetiro()">Retirar</UButton>
        </div>
        <p v-else class="text-xs text-muted">Tu rol solo tiene acceso de lectura — no puedes cambiar el estado de este activo.</p>
      </div>

      <div class="rounded-lg border border-default overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-muted/30">
            <tr>
              <th class="p-2 text-left">Fecha</th><th class="p-2 text-left">Transición</th>
              <th class="p-2 text-left">Motivo</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="h in activosStore.historialEstado" :key="(h as EstadoHistorialRow).id" class="border-t border-default">
              <td class="p-2 text-xs whitespace-nowrap">{{ formatoFechaHistorial((h as EstadoHistorialRow).created_at) }}</td>
              <td class="p-2 text-xs">
                <span v-if="(h as EstadoHistorialRow).estado_anterior">{{ ESTADO_LABEL[(h as EstadoHistorialRow).estado_anterior!] }} → </span>
                {{ ESTADO_LABEL[(h as EstadoHistorialRow).estado_nuevo] }}
              </td>
              <td class="p-2 text-xs text-muted">{{ (h as EstadoHistorialRow).motivo ?? '—' }}</td>
            </tr>
            <tr v-if="activosStore.historialEstado.length === 0">
              <td colspan="3" class="p-6 text-center text-sm text-muted">Sin transiciones registradas todavía.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <MantenimientoActivosActivoFormDrawer
      :abierto="drawerAbierto"
      :activo="activosStore.activo"
      :tenant-id="tenantStore.activeTenant?.id ?? ''"
      :tipos-activo="tiposActivo"
      :categorias-activo="categoriasActivo"
      :activos-existentes="activosStore.activos"
      @cerrar="drawerAbierto = false"
      @guardado="alGuardar()"
    />

    <!-- Modal: Retirar (§19) -->
    <UModal v-model:open="modalRetiro" title="Retirar activo">
      <template #body>
        <div class="space-y-3">
          <UAlert v-if="errorRetiro" color="error" variant="soft" :title="errorRetiro" />
          <UFormField label="Motivo *" name="motivo">
            <UTextarea v-model="motivoRetiro" class="w-full" placeholder="Por qué se retira este activo" />
          </UFormField>
          <UFormField v-if="activosStore.activo?.capitalizado" label="Período contable (abierto)" name="periodo">
            <USelect v-model="periodoRetiro" :items="periodosAbiertos" class="w-full" placeholder="Selecciona un período" />
          </UFormField>
          <p v-if="activosStore.activo?.capitalizado" class="text-xs text-muted">
            Como está capitalizado, esto generará un comprobante de baja (depreciación acumulada
            + pérdida en retiro) vía `fn_mant_dar_baja_activo`.
          </p>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" @click="modalRetiro = false">Cancelar</UButton>
          <UButton
            color="error" :loading="retirando"
            :disabled="!motivoRetiro.trim() || (activosStore.activo?.capitalizado && !periodoRetiro)"
            @click="confirmarRetiro()"
          >
            Confirmar retiro
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- Modal: Capitalizar (§15) -->
    <UModal v-model:open="modalCapitalizar" title="Capitalizar activo">
      <template #body>
        <div class="space-y-3">
          <UAlert v-if="errorCapitalizar" color="error" variant="soft" :title="errorCapitalizar" />
          <p class="text-sm text-muted">
            Se reclasificará el gasto ya pagado (o se causará contra patrimonio, si no viene de una
            ejecución presupuestal vinculada) mediante `fn_mant_capitalizar_activo`.
          </p>
          <UFormField label="Período contable (abierto)" name="periodo">
            <USelect v-model="periodoCapitalizar" :items="periodosAbiertos" class="w-full" placeholder="Selecciona un período" />
          </UFormField>
          <p v-if="periodosAbiertos.length === 0" class="text-xs text-warning">
            No hay ningún período contable abierto en esta copropiedad.
          </p>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" @click="modalCapitalizar = false">Cancelar</UButton>
          <UButton :loading="capitalizando" :disabled="!periodoCapitalizar" @click="confirmarCapitalizar()">
            Confirmar capitalización
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- Modal: Reconocer depreciación (§16) -->
    <UModal v-model:open="modalDepreciacion" title="Reconocer depreciación">
      <template #body>
        <div class="space-y-3">
          <UAlert v-if="errorDepreciacion" color="error" variant="soft" :title="errorDepreciacion" />
          <UAlert v-if="resultadoDepreciacion" :color="resultadoDepreciacionColor" variant="soft" :title="resultadoDepreciacion" />
          <p class="text-sm text-muted">
            Reconoce la cuota del período para TODOS los activos capitalizados de la copropiedad
            (`fn_mant_reconocer_depreciacion`, idempotente) — no solo este; el resultado que se
            muestra abajo es el de este activo.
          </p>
          <UFormField label="Período contable (abierto)" name="periodo">
            <USelect v-model="periodoDepreciacion" :items="periodosAbiertos" class="w-full" placeholder="Selecciona un período" />
          </UFormField>
          <p v-if="cargandoPrevia" class="text-xs text-muted">Calculando vista previa…</p>
          <p v-else-if="previaDepreciacion" class="text-sm">
            Cuota proyectada este período: <strong>{{ formatoMoneda(previaDepreciacion.cuota_periodo) }}</strong>
          </p>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" @click="modalDepreciacion = false">Cerrar</UButton>
          <UButton :loading="reconociendo" :disabled="!periodoDepreciacion" @click="confirmarDepreciacion()">
            Reconocer depreciación
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
