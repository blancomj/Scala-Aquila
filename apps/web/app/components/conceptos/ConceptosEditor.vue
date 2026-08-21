<script setup lang="ts">
// Editor de concepto (crear/editar) — extraído de conceptos/index.vue al
// separar "Conceptos" en catálogo (ConceptosCatalogo.vue, solo lista +
// editar/archivar/nuevo, en /estado-cuenta/conceptos) + editor de
// página completa (aquí, /conceptos/nuevo y /conceptos/[id]). La fórmula
// AEL (texto/bloques/IR), pruebas y versionado no caben razonablemente en
// una pestaña ni en un drawer — se mantienen como página completa, sin
// reimplementar nada de su lógica.
//
// Header (nombre + badge de estado + Historial/Probar fórmula/Guardar) +
// 4 pestañas: Definición (campos básicos) / Alcance (Fase 5 — a qué
// inmuebles aplica) / Fórmula (Variables disponibles | Constructor de
// fórmula | Prueba de fórmula, en 3 columnas) / Auditoría (estado + flujo
// de maker-checker — enviar a revisión/aprobar/rechazar/volver a
// borrador, AEL-004 Fase 4 — + historial de versiones).
// "Guardar cambios" vive en el header porque los campos ahora están
// repartidos entre pestañas — ya no hay un único <form> que envolverlos;
// guardar() sigue siendo la misma función, solo cambió cómo se dispara.
//
// F6 — última pieza sin UI del DoD ("UI de conceptos y fórmulas", PLAN §5).
// Crear/editar conceptos con validación estática de la fórmula AEL en el
// cliente (parsear + analizar, packages/ael-language) antes de guardar —
// feedback inmediato en vez de esperar a que liquidar-periodo lo rechace.
// El catálogo de validación es una aproximación (ver utils/ael-validate.ts);
// la autoridad real sigue siendo liquidar-periodo contra el snapshot real.
import { validarFormulaAel } from '~/utils/ael-validate'
import { catalogoContratosEstatico, FUNCIONES_CATALOGO } from '~/utils/ael-catalogo'
import {
  camposRequeridos,
  ejecutarCasoPrueba,
  type CampoRequerido,
  type EntradaMock,
  type ResultadoCasoPrueba,
  type ValorMock,
} from '~/utils/ael-test-runner'
import {
  astABloques,
  bloquesAAst,
  diferenciarParDeListas,
  type BloqueRegla,
  type CatalogoBloques,
} from '~/utils/ael-bloques'
import type { CasoPrueba, PasoTrazaPrueba, ResultadoPruebaFormula } from '~/stores/concepto'
import type { Tipo } from '@aquila/ael-core'
import type { ModoRedondeo } from '@aquila/financial-kernel'
import type { CondicionGrupo } from '@aquila/liquidation-engine/alcance'
import { imprimir, parsear } from '@aquila/ael-language'

const props = defineProps<{ conceptoId?: string | null }>()

const router = useRouter()
const tenantStore = useTenantStore()
const conceptoStore = useConceptoStore()
const cuentaStore = useCuentaCorrienteStore()
const liquidacionStore = useLiquidacionStore()
const politicaFinancieraStore = usePoliticaFinancieraStore()
const presupuestoStore = usePresupuestoStore()

const editandoId = ref<string | null>(null)
const codigo = ref('')
const nombre = ref('')
const modoCalculo = ref<'directo' | 'distribucion'>('distribucion')
// modoValor: fijo: valorFijo es el monto directo, sin fórmula. formulado:
// formulaAel, único modo que existía antes.
const modoValor = ref<'fijo' | 'formulado'>('formulado')
const valorFijo = ref('')
const formulaAel = ref('')
const prioridad = ref(100)

// Fase 2 — tipo de recurrencia + periodicidad. 'novedad' se deja en el
// selector pero deshabilitada: su comportamiento real (concepto singleton,
// vínculo por inmueble) llega en Fase 4, no hay nada que hacer con ella
// todavía. fechaFin solo aplica a por_periodo — se limpia al salir de ese tipo.
const tipoRecurrencia = ref<'recurrente' | 'unico' | 'por_periodo' | 'novedad'>('recurrente')
const fechaInicioAnio = ref<number>(new Date().getFullYear())
const fechaInicioMes = ref<number>(new Date().getMonth() + 1)
const fechaFinAnio = ref<number | null>(null)
const fechaFinMes = ref<number | null>(null)
// Solo tiene sentido para 'recurrente' (conceptos_periodicidad_consistente) —
// cada cuántos periodos vuelve a aplicar desde fecha_inicio. mensual
// preserva el comportamiento pre-existente (aplica todos los periodos).
const periodicidad = ref<'mensual' | 'bimensual' | 'trimestral' | 'semestral' | 'anual'>('mensual')

// Fase 5 — alcance: 'todos' preserva el comportamiento previo a esta fase
// exactamente. Al pasar a 'calculado' se inicializa un grupo AND vacío (el
// usuario agrega condiciones desde ConceptosCondicionBuilder); al volver a
// 'todos' se descarta el árbol — conceptos_alcance_consistente exige
// alcance_condiciones null en ese caso.
const alcance = ref<'todos' | 'calculado'>('todos')
const alcanceCondiciones = ref<CondicionGrupo | null>(null)

// Cuenta presupuestal de ingreso (E9, dirección invertida 20260830200000) — a qué cuenta del
// árbol de presupuesto_cuenta clasifica el ingreso que genera este concepto. Solo hojas de
// naturaleza ingreso son elegibles (guard_concepto_presupuesto_cuenta lo exige), mismo criterio
// que opcionesComponentePresupuestal en estado-cuenta/novedades.vue.
const presupuestoCuentaId = ref<string | null>(null)
const opcionesCuentaPresupuestal = computed(() =>
  presupuestoStore.cuentas.filter((c) => c.es_hoja && c.naturaleza === 'ingreso'),
)
watch(alcance, (valor) => {
  if (valor === 'todos') {
    alcanceCondiciones.value = null
  } else if (alcanceCondiciones.value === null) {
    alcanceCondiciones.value = { op: 'and', condiciones: [] }
  }
})
function contarCondiciones(grupo: CondicionGrupo): number {
  return grupo.condiciones.reduce(
    (total, c) => total + ('op' in c ? contarCondiciones(c) : 1),
    0,
  )
}
const errorAlcance = computed(() => {
  if (alcance.value !== 'calculado') return null
  if (!alcanceCondiciones.value || contarCondiciones(alcanceCondiciones.value) === 0) {
    return 'Agrega al menos una condición, o cambia el alcance a "Todos".'
  }
  return null
})

watch(tipoRecurrencia, (valor) => {
  if (valor !== 'por_periodo') {
    fechaFinAnio.value = null
    fechaFinMes.value = null
  } else if (fechaFinAnio.value === null || fechaFinMes.value === null) {
    fechaFinAnio.value = fechaInicioAnio.value
    fechaFinMes.value = fechaInicioMes.value
  }
})
const errorTemporal = computed(() => {
  if (tipoRecurrencia.value !== 'por_periodo') return null
  if (fechaFinAnio.value === null || fechaFinMes.value === null) {
    return 'La fecha fin es obligatoria para un concepto "por un periodo".'
  }
  if (
    fechaFinAnio.value < fechaInicioAnio.value ||
    (fechaFinAnio.value === fechaInicioAnio.value && fechaFinMes.value < fechaInicioMes.value)
  ) {
    return 'La fecha fin no puede ser anterior a la fecha inicio.'
  }
  return null
})
const guardando = ref(false)
const error = ref<string | null>(null)
const cambiandoEstado = ref(false)
const cargando = ref(false)
const noEncontrado = ref(false)
const motivoRechazo = ref('')

onMounted(async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  cargando.value = true
  try {
    await Promise.all([
      conceptoStore.cargarConceptos(tenantId),
      cuentaStore.cargarInmuebles(tenantId),
      liquidacionStore.cargarPeriodos(tenantId),
      politicaFinancieraStore.cargarPoliticas(tenantId),
      presupuestoStore.cargarCuentas(tenantId),
    ])
    if (props.conceptoId) {
      const concepto = conceptoStore.conceptos.find((c) => c.id === props.conceptoId)
      if (!concepto) {
        noEncontrado.value = true
        return
      }
      await iniciarEdicion(concepto)
    }
  } finally {
    cargando.value = false
  }
})

const editorRef = ref<{
  irAPosicion: (linea: number, columna: number) => void
  insertarTexto: (texto: string) => void
} | null>(null)

// ── header + pestañas ────────────────────────────────────────────────
// Definición (campos básicos) / Alcance (Fase 5 — a quién aplica) /
// Fórmula (constructor + variables + prueba) / Auditoría (estado, flujo
// de aprobación, historial de versiones) — "Parámetros"/"Dependencias" de
// un mockup de referencia se descartaron: ya cubierto por
// AelCapabilityView (Fórmula) y por /conceptos/dependencias (grafo
// global, no por-concepto). El id interno 'configuracion' se conserva
// (solo cambió la etiqueta visible) para no tocar el resto de
// referencias a esa pestaña.
type TabConcepto = 'formula' | 'configuracion' | 'alcance' | 'auditoria'
const TODAS_TABS_CONCEPTO: ReadonlyArray<{ id: TabConcepto; etiqueta: string }> = [
  { id: 'configuracion', etiqueta: 'Definición' },
  { id: 'alcance', etiqueta: 'Alcance' },
  { id: 'formula', etiqueta: 'Fórmula' },
  { id: 'auditoria', etiqueta: 'Auditoría' },
]
// Un concepto fijo no tiene fórmula que construir/probar — la pestaña
// Fórmula solo tiene sentido para modoValor='formulado'.
const TABS_CONCEPTO = computed(() =>
  modoValor.value === 'fijo'
    ? TODAS_TABS_CONCEPTO.filter((t) => t.id !== 'formula')
    : TODAS_TABS_CONCEPTO,
)
const tabActiva = ref<TabConcepto>('configuracion')
watch(modoValor, (valor) => {
  if (valor === 'fijo' && tabActiva.value === 'formula') tabActiva.value = 'configuracion'
})

const COLOR_ESTADO_CONCEPTO: Record<string, 'success' | 'neutral' | 'warning'> = {
  borrador: 'neutral',
  en_revision: 'warning',
  activo: 'success',
  archivado: 'neutral',
}

/** Inserta una referencia (PARAMETER.X, UNIT.X, CONCEPTO.X o FUNCION())
 * desde el panel "Variables disponibles" en el cursor del editor de texto
 * — si está en modo Bloques, cambia a Texto primero (el arrastre a bloques
 * sigue disponible aparte, vía AelBlockPaleta). */
async function insertarVariable(texto: string): Promise<void> {
  if (modoFormula.value !== 'texto') {
    activarModoTexto()
    await nextTick()
  }
  editorRef.value?.insertarTexto(texto)
}

const codigosConceptosExistentes = computed(() =>
  conceptoStore.conceptos.map((c) => c.codigo).filter((c) => c !== codigo.value),
)

// El código es inmutable tras crear (:disabled más abajo) — el duplicado
// solo puede ocurrir al crear uno nuevo, pero se valida siempre por si el
// usuario reabre el formulario de creación sin haber recargado la lista.
const codigoDuplicado = computed(() => {
  if (editandoId.value !== null || !codigo.value.trim()) return false
  const normalizado = codigo.value.trim().toUpperCase()
  return conceptoStore.conceptos.some((c) => c.codigo.toUpperCase() === normalizado)
})

// Fase 4 — un solo concepto tipo_recurrencia='novedad' vivo por tenant
// (conceptos_novedad_singleton_idx). Se excluye el propio concepto en
// edición para no bloquearse a sí mismo al reabrir su ficha.
const existeSingletonNovedad = computed(() =>
  conceptoStore.conceptos.some(
    (c) =>
      c.tipo_recurrencia === 'novedad' && c.estado !== 'archivado' && c.id !== editandoId.value,
  ),
)
watch(tipoRecurrencia, (valor) => {
  if (valor === 'novedad') {
    modoValor.value = 'fijo'
    valorFijo.value = '0'
  }
})

const diagnosticosFormula = computed(() => {
  if (!formulaAel.value.trim()) return []
  return validarFormulaAel(formulaAel.value, codigosConceptosExistentes.value)
})

// Catálogo para los selects de ReferenciaContract/LlamadaFuncion del
// constructor visual — misma fuente que valida el texto (ael-catalogo.ts),
// para no ofrecer en bloques algo que fallaría al parsear/analizar.
const catalogoBloques = computed<CatalogoBloques>(() => {
  const catalogo = catalogoContratosEstatico(codigosConceptosExistentes.value)
  return {
    parameter: Object.keys(catalogo.PARAMETER ?? {}),
    unit: Object.keys(catalogo.UNIT ?? {}),
    concepto: Object.keys(catalogo.CONCEPTO ?? {}),
    funciones: Object.keys(FUNCIONES_CATALOGO),
  }
})

// ── constructor visual de bloques (AEL-004 Fase 7, E4) ──────────────────
// `bloqueEnEdicion` es el árbol que edita el canvas; `formulaAel` (texto)
// es la fuente de verdad para validar/probar/guardar. Cada edición en el
// canvas reconstruye formulaAel vía bloquesAAst()+imprimir() (watcher más
// abajo) — así el modo texto siempre refleja lo último, sin depender de
// que el usuario vuelva a cambiar de modo. astABloques() solo se llama al
// ENTRAR a modo bloques (no en cada edición): reconstruir desde el AST en
// cada tecla generaría ids nuevos para todo el árbol y forzaría un remount
// completo del canvas, perdiendo el foco del input activo.
const modoFormula = ref<'texto' | 'bloques'>('texto')
const bloqueEnEdicion = ref<BloqueRegla | null>(null)

function activarModoBloques(): void {
  const { regla } = parsear(formulaAel.value)
  bloqueEnEdicion.value = regla ? astABloques(regla) : null
  modoFormula.value = 'bloques'
}

function activarModoTexto(): void {
  modoFormula.value = 'texto'
}

watch(bloqueEnEdicion, (nuevo) => {
  if (nuevo) formulaAel.value = imprimir(bloquesAAst(nuevo))
})

// ── vista técnica IR/AST cruda (backlog Doc 10 §226 — "NO RAW IR BY
// DEFAULT": puede existir, pero oculta salvo que el usuario la abra). Lee
// el AST real (no el modelo de bloques) directamente del texto actual, con
// el mismo parsear() que ya usa activarModoBloques()/diagnosticosFormula.
const mostrarIr = ref(false)
const astActual = computed(() => {
  if (!formulaAel.value.trim()) return null
  return parsear(formulaAel.value).regla
})

// ── maker-checker (AEL-004 Fase 4) — el contenido solo se edita en
// borrador; guard_concepto_transicion rechaza cualquier otro caso con
// CONCEPTO_INMUTABLE, esto es solo la UX que evita llegar a ese error.
const conceptoEnEdicion = computed(
  () => conceptoStore.conceptos.find((c) => c.id === editandoId.value) ?? null,
)
const soloLectura = computed(
  () => conceptoEnEdicion.value !== null && conceptoEnEdicion.value.estado !== 'borrador',
)
const mensajeSoloLectura = computed(() => {
  if (!soloLectura.value || !conceptoEnEdicion.value) return null
  return `Este concepto está en estado "${conceptoEnEdicion.value.estado}" — el contenido es de solo lectura hasta volver a borrador.`
})

async function enviarARevision(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !editandoId.value) return
  cambiandoEstado.value = true
  try {
    await conceptoStore.enviarARevision(editandoId.value, tenantId)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo enviar a revisión.')
  } finally {
    cambiandoEstado.value = false
  }
}

async function aprobar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !editandoId.value) return
  cambiandoEstado.value = true
  try {
    await conceptoStore.aprobarConcepto(editandoId.value, tenantId)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo aprobar.')
  } finally {
    cambiandoEstado.value = false
  }
}

async function rechazar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  const motivo = motivoRechazo.value.trim()
  if (!tenantId || !editandoId.value) return
  if (!motivo) {
    error.value = 'Escribe un motivo de rechazo.'
    return
  }
  cambiandoEstado.value = true
  try {
    await conceptoStore.rechazarConcepto(editandoId.value, tenantId, motivo)
    motivoRechazo.value = ''
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo rechazar.')
  } finally {
    cambiandoEstado.value = false
  }
}

async function volverABorrador(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !editandoId.value) return
  cambiandoEstado.value = true
  try {
    await conceptoStore.volverABorrador(editandoId.value, tenantId)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo volver a borrador.')
  } finally {
    cambiandoEstado.value = false
  }
}

async function archivar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !editandoId.value) return
  cambiandoEstado.value = true
  try {
    await conceptoStore.cambiarEstado(editandoId.value, 'archivado', tenantId)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo archivar.')
  } finally {
    cambiandoEstado.value = false
  }
}

// ── historial de versiones + diff visual (AEL-004 Fase 3) ───────────────
const versionCompararA = ref<string | null>(null)
const versionCompararB = ref<string | null>(null)
const opcionesVersion = computed(() =>
  conceptoStore.versiones.map((v) => ({
    valor: v.id,
    etiqueta: `Versión ${v.version} — ${new Date(v.created_at).toLocaleString()}`,
  })),
)

const versionA = computed(
  () => conceptoStore.versiones.find((v) => v.id === versionCompararA.value) ?? null,
)
const versionB = computed(
  () => conceptoStore.versiones.find((v) => v.id === versionCompararB.value) ?? null,
)

// Diff visual bloque-a-bloque (E6+) — mismo par Texto/Bloques que el editor
// principal. diferenciarParDeListas() compara posicionalmente (ver su
// docstring en ael-bloques.ts); si alguna de las dos versiones no parsea,
// se cae a null y la UI ofrece solo el diff de texto para ese par.
const modoDiff = ref<'texto' | 'bloques'>('texto')
const diffBloques = computed(() => {
  if (!versionA.value || !versionB.value) return null
  const { regla: reglaA } = parsear(versionA.value.formula_ael ?? '')
  const { regla: reglaB } = parsear(versionB.value.formula_ael ?? '')
  if (reglaA === null || reglaB === null) return null
  return diferenciarParDeListas(astABloques(reglaA).cuerpo, astABloques(reglaB).cuerpo)
})

// ── casos de prueba (AEL-004 Fase 6) — ejecución 100% client-side, sin
// Edge Function: ejecutarCasoPrueba() ya encapsula probarFormula() + un
// ExecutionContext mock. moneda/modoRedondeoDinero salen del tenant/de su
// política vigente, igual que usaría liquidar-periodo de verdad.
const moneda = computed(() => tenantStore.activeTenant?.moneda ?? 'COP')

// Mismo mapeo que packages/liquidation-engine/src/snapshot-supabase.ts
// (privado a ese módulo) — tabla de 4 casos sin lógica real que valga la
// pena centralizar entre paquete y app.
function mapearModoRedondeo(modo: 'half_up' | 'half_even' | 'down' | 'up'): ModoRedondeo {
  switch (modo) {
    case 'half_up':
      return 'HALF_UP'
    case 'half_even':
      return 'HALF_EVEN'
    case 'down':
      return 'DOWN'
    case 'up':
      return 'UP'
  }
}

const modoRedondeoDinero = computed<ModoRedondeo>(() => {
  const vigente = politicaFinancieraStore.politicas.find((p) => p.estado === 'vigente')
  return vigente ? mapearModoRedondeo(vigente.redondeo_modo) : 'HALF_UP'
})

const camposFormulaActual = computed<readonly CampoRequerido[]>(() =>
  camposRequeridos(formulaAel.value),
)

function claveCampo(c: CampoRequerido): string {
  return `${c.contrato}.${c.campo}`
}

const nuevoCasoNombre = ref('')
const nuevoCasoTipoEsperado = ref<Tipo>('MONEY')
const nuevoCasoResultado = ref('')
const nuevoCasoResultadoBool = ref(true)
const entradasNuevoCaso = reactive<Record<string, string>>({})
const entradasNuevoCasoBool = reactive<Record<string, boolean>>({})
const errorCasoPrueba = ref<string | null>(null)
const guardandoCaso = ref(false)

function construirValorMock(tipo: Tipo, texto: string, bool: boolean): ValorMock {
  if (tipo === 'NUMBER') return { tipo: 'NUMBER', valor: texto }
  if (tipo === 'MONEY') return { tipo: 'MONEY', valor: texto }
  if (tipo === 'BOOLEAN') return { tipo: 'BOOLEAN', valor: bool }
  return { tipo: 'NULO' }
}

async function guardarCasoPrueba(): Promise<void> {
  errorCasoPrueba.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !editandoId.value || !nuevoCasoNombre.value.trim()) return

  const entradas: EntradaMock[] = camposFormulaActual.value.map((campo) => {
    const clave = claveCampo(campo)
    return {
      contrato: campo.contrato,
      campo: campo.campo,
      valor: construirValorMock(
        campo.tipo,
        entradasNuevoCaso[clave] ?? '',
        entradasNuevoCasoBool[clave] ?? false,
      ),
    }
  })

  const resultadoEsperado =
    nuevoCasoTipoEsperado.value === 'NULO'
      ? null
      : construirValorMock(
          nuevoCasoTipoEsperado.value,
          nuevoCasoResultado.value,
          nuevoCasoResultadoBool.value,
        )

  guardandoCaso.value = true
  try {
    await conceptoStore.crearCasoPrueba({
      tenantId,
      conceptoId: editandoId.value,
      nombre: nuevoCasoNombre.value.trim(),
      entradas,
      tipoEsperado: nuevoCasoTipoEsperado.value,
      resultadoEsperado,
    })
    nuevoCasoNombre.value = ''
    nuevoCasoResultado.value = ''
    for (const clave of Object.keys(entradasNuevoCaso)) entradasNuevoCaso[clave] = ''
  } catch (excepcion) {
    errorCasoPrueba.value = mensajeError(excepcion, 'No se pudo guardar el caso de prueba.')
  } finally {
    guardandoCaso.value = false
  }
}

async function eliminarCaso(caso: CasoPrueba): Promise<void> {
  if (!editandoId.value) return
  try {
    await conceptoStore.eliminarCasoPrueba(caso.id, editandoId.value)
  } catch (excepcion) {
    errorCasoPrueba.value = mensajeError(excepcion, 'No se pudo eliminar el caso de prueba.')
  }
}

const resultadosEjecucion = ref<Record<string, ResultadoCasoPrueba>>({})

const resumenEjecucion = computed(() => {
  const valores = Object.values(resultadosEjecucion.value)
  return {
    total: valores.length,
    passed: valores.filter((r) => r.estado === 'passed').length,
    failed: valores.filter((r) => r.estado === 'failed').length,
  }
})

function ejecutarTodos(): void {
  const catalogo = catalogoContratosEstatico(codigosConceptosExistentes.value)
  const resultados: Record<string, ResultadoCasoPrueba> = {}
  for (const caso of conceptoStore.casosPrueba) {
    resultados[caso.id] = ejecutarCasoPrueba(
      formulaAel.value,
      {
        entradas: caso.entradas,
        tipoEsperado: caso.tipoEsperado,
        resultadoEsperado: caso.resultadoEsperado,
      },
      catalogo,
      moneda.value,
      modoRedondeoDinero.value,
    )
  }
  resultadosEjecucion.value = resultados
}

async function iniciarEdicion(concepto: (typeof conceptoStore.conceptos)[number]): Promise<void> {
  editandoId.value = concepto.id
  codigo.value = concepto.codigo
  nombre.value = concepto.nombre
  modoCalculo.value = concepto.modo_calculo
  modoValor.value = concepto.modo_valor
  valorFijo.value = concepto.valor_fijo !== null ? String(concepto.valor_fijo) : ''
  formulaAel.value = concepto.formula_ael ?? ''
  prioridad.value = concepto.prioridad
  tipoRecurrencia.value = concepto.tipo_recurrencia
  fechaInicioAnio.value = concepto.fecha_inicio_anio ?? new Date().getFullYear()
  fechaInicioMes.value = concepto.fecha_inicio_mes ?? new Date().getMonth() + 1
  fechaFinAnio.value = concepto.fecha_fin_anio
  fechaFinMes.value = concepto.fecha_fin_mes
  periodicidad.value = concepto.periodicidad ?? 'mensual'
  alcance.value = concepto.alcance
  alcanceCondiciones.value = concepto.alcance_condiciones as unknown as CondicionGrupo | null
  presupuestoCuentaId.value = concepto.presupuesto_cuenta_id
  error.value = null
  modoFormula.value = 'texto'
  bloqueEnEdicion.value = null

  versionCompararA.value = null
  versionCompararB.value = null
  resultadosEjecucion.value = {}
  errorCasoPrueba.value = null
  await Promise.all([
    conceptoStore.cargarVersiones(concepto.id),
    conceptoStore.cargarCasosPrueba(concepto.id),
  ])
}

function volver(): void {
  router.back()
}

async function guardar(): Promise<void> {
  error.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !codigo.value || !nombre.value) return
  if (codigoDuplicado.value) {
    error.value = 'Ya existe un concepto con este código.'
    return
  }
  if (modoValor.value === 'formulado') {
    if (!formulaAel.value) return
    if (diagnosticosFormula.value.length > 0) {
      error.value = 'La fórmula tiene errores — corrígelos antes de guardar.'
      return
    }
  } else if (!valorFijo.value) {
    return
  }
  if (errorTemporal.value) {
    error.value = errorTemporal.value
    return
  }
  if (errorAlcance.value) {
    error.value = errorAlcance.value
    return
  }

  const esPorPeriodo = tipoRecurrencia.value === 'por_periodo'
  const esNovedad = tipoRecurrencia.value === 'novedad'
  const esRecurrente = tipoRecurrencia.value === 'recurrente'
  guardando.value = true
  try {
    if (editandoId.value) {
      await conceptoStore.actualizarConcepto({
        id: editandoId.value,
        tenantId,
        nombre: nombre.value,
        modoCalculo: modoCalculo.value,
        modoValor: modoValor.value,
        formulaAel: modoValor.value === 'formulado' ? formulaAel.value : null,
        valorFijo: modoValor.value === 'fijo' ? valorFijo.value : null,
        prioridad: prioridad.value,
        tipoRecurrencia: tipoRecurrencia.value,
        fechaInicioAnio: esNovedad ? null : fechaInicioAnio.value,
        fechaInicioMes: esNovedad ? null : fechaInicioMes.value,
        fechaFinAnio: esPorPeriodo ? fechaFinAnio.value : null,
        fechaFinMes: esPorPeriodo ? fechaFinMes.value : null,
        periodicidad: esRecurrente ? periodicidad.value : null,
        alcance: alcance.value,
        alcanceCondiciones: alcanceCondiciones.value,
        presupuestoCuentaId: presupuestoCuentaId.value,
      })
    } else {
      const creado = await conceptoStore.crearConcepto({
        tenantId,
        codigo: codigo.value,
        nombre: nombre.value,
        modoCalculo: modoCalculo.value,
        modoValor: modoValor.value,
        formulaAel: modoValor.value === 'formulado' ? formulaAel.value : null,
        valorFijo: modoValor.value === 'fijo' ? valorFijo.value : null,
        prioridad: prioridad.value,
        tipoRecurrencia: tipoRecurrencia.value,
        fechaInicioAnio: esNovedad ? null : fechaInicioAnio.value,
        fechaInicioMes: esNovedad ? null : fechaInicioMes.value,
        fechaFinAnio: esPorPeriodo ? fechaFinAnio.value : null,
        fechaFinMes: esPorPeriodo ? fechaFinMes.value : null,
        periodicidad: esRecurrente ? periodicidad.value : null,
        alcance: alcance.value,
        alcanceCondiciones: alcanceCondiciones.value,
        presupuestoCuentaId: presupuestoCuentaId.value,
      })
      // Tras crear, se navega al editor del concepto recién creado — ahí
      // (no antes) quedan disponibles versiones/casos de prueba, que
      // requieren un id ya persistido.
      await router.push(`/conceptos/${creado.id}`)
      return
    }
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo guardar el concepto.')
  } finally {
    guardando.value = false
  }
}

// ── probar fórmula (AEL-004 Fase 1) ─────────────────────────────────────
const inmuebleIdPrueba = ref<string | null>(null)
const periodoIdPrueba = ref<string | null>(null)
const opcionesInmueblePrueba = computed(() =>
  cuentaStore.inmuebles.map((i) => ({ valor: i.id, etiqueta: i.codigo })),
)
const opcionesPeriodoPrueba = computed(() =>
  liquidacionStore.periodos.map((p) => ({
    valor: p.id,
    etiqueta: `${p.anio}-${String(p.mes).padStart(2, '0')}`,
  })),
)
const probando = ref(false)
const errorPrueba = ref<string | null>(null)
const resultadoPrueba = ref<ResultadoPruebaFormula | null>(null)
const mostrarTraza = ref(false)

const etiquetaTipo: Record<string, string> = {
  MONEY: 'Dinero',
  NUMBER: 'Número',
  BOOLEAN: 'Verdadero/falso',
}

// "Detalle del cálculo" — lectura directa de la traza que ya devuelve el
// evaluador real (packages/ael-runtime/src/evaluator.ts vía
// probar-formula), no una re-derivación aparte que pudiera divergir del
// resultado. Formato de moneda igual al resto de paneles de presupuesto
// (PresupuestoTabControlValidaciones.vue): es-CO/COP fijo, sin
// multi-moneda dinámica — mismo criterio ya establecido en el proyecto.
function formatoValorPaso(paso: PasoTrazaPrueba): string {
  if (paso.tipo === 'MONEY') {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(Number(paso.valor))
  }
  if (paso.tipo === 'BOOLEAN') return paso.valor ? 'verdadero' : 'falso'
  if (paso.tipo === 'NULO') return '—'
  return String(paso.valor ?? '—')
}

async function probar(): Promise<void> {
  errorPrueba.value = null
  resultadoPrueba.value = null
  mostrarTraza.value = false
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !inmuebleIdPrueba.value || !periodoIdPrueba.value || !formulaAel.value) return

  probando.value = true
  try {
    resultadoPrueba.value = await conceptoStore.probarFormula({
      tenantId,
      inmuebleId: inmuebleIdPrueba.value,
      periodoId: periodoIdPrueba.value,
      formulaAel: formulaAel.value,
    })
  } catch (excepcion) {
    errorPrueba.value = mensajeError(excepcion, 'No se pudo probar la fórmula.')
  } finally {
    probando.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <button type="button" class="text-sm text-primary hover:underline" @click="volver">
      ← Volver a Conceptos
    </button>

    <p v-if="cargando" class="text-gray-500 text-sm">Cargando…</p>
    <UAlert
      v-else-if="noEncontrado"
      color="error"
      variant="soft"
      title="Este concepto no existe o no pertenece a esta copropiedad."
    />
    <template v-else>
      <!-- ── header ──────────────────────────────────────────────────── -->
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div class="flex items-center gap-2 flex-wrap">
            <h1 class="text-xl font-semibold">
              {{ editandoId ? nombre || codigo : 'Nuevo concepto' }}
            </h1>
            <UBadge
              v-if="conceptoEnEdicion"
              :color="COLOR_ESTADO_CONCEPTO[conceptoEnEdicion.estado] ?? 'neutral'"
              variant="subtle"
            >
              {{ conceptoEnEdicion.estado }}
            </UBadge>
          </div>
          <p v-if="editandoId" class="text-sm text-gray-500 mt-1">
            Código: <span class="font-mono">{{ codigo }}</span> · Modo: {{ modoCalculo }} · Valor:
            {{ modoValor === 'fijo' ? 'Fijo' : 'Formulado' }}
          </p>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <UButton v-if="editandoId" variant="soft" size="sm" @click="tabActiva = 'auditoria'">
            Historial de versiones
          </UButton>
          <UButton
            v-if="modoValor === 'formulado'"
            variant="soft"
            size="sm"
            @click="tabActiva = 'formula'"
          >
            Probar fórmula
          </UButton>
          <UButton v-if="!soloLectura" size="sm" :loading="guardando" @click="guardar">
            {{ editandoId ? 'Guardar cambios' : 'Crear concepto' }}
          </UButton>
          <UButton variant="ghost" size="sm" @click="volver">
            {{ soloLectura ? 'Cerrar' : 'Cancelar' }}
          </UButton>
        </div>
      </div>

      <UAlert v-if="mensajeSoloLectura" color="warning" variant="soft" :title="mensajeSoloLectura" />
      <UAlert v-if="error" color="error" variant="soft" :title="error" />

      <!-- ── pestañas ────────────────────────────────────────────────── -->
      <nav class="flex gap-1 border-b border-gray-200 dark:border-gray-800 overflow-x-auto">
        <button
          v-for="tab in TABS_CONCEPTO"
          :key="tab.id"
          type="button"
          class="px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors"
          :class="
            tabActiva === tab.id
              ? 'border-blue-600 text-blue-600 font-medium'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          "
          @click="tabActiva = tab.id"
        >
          {{ tab.etiqueta }}
        </button>
      </nav>

      <!-- ── Fórmula ─────────────────────────────────────────────────── -->
      <div v-if="tabActiva === 'formula'" class="space-y-6">
        <div class="grid grid-cols-1 lg:grid-cols-[260px_1fr_320px] gap-4 items-start">
          <ConceptosVariablesPanel
            :codigos-conceptos="codigosConceptosExistentes"
            @insertar="insertarVariable"
          />

          <div class="space-y-3 min-w-0">
            <p class="text-sm font-medium">Constructor de fórmula</p>
            <div class="flex items-center gap-2">
              <UButton
                type="button"
                size="xs"
                :variant="modoFormula === 'texto' ? 'solid' : 'soft'"
                @click="activarModoTexto"
              >
                Texto
              </UButton>
              <UButton
                type="button"
                size="xs"
                :variant="modoFormula === 'bloques' ? 'solid' : 'soft'"
                @click="activarModoBloques"
              >
                Bloques
              </UButton>
              <UButton
                type="button"
                size="xs"
                variant="ghost"
                class="ml-2"
                @click="mostrarIr = !mostrarIr"
              >
                {{ mostrarIr ? 'Ocultar IR' : 'Ver IR' }}
              </UButton>
            </div>

            <AelEditor
              v-if="modoFormula === 'texto'"
              ref="editorRef"
              v-model="formulaAel"
              :conceptos-disponibles="codigosConceptosExistentes"
              :diagnosticos="diagnosticosFormula"
              :readonly="soloLectura"
            />
            <template v-else>
              <AelBlockPaleta v-if="!soloLectura" :catalogo="catalogoBloques" class="mb-2" />
              <AelBlockCanvas
                v-model:bloque="bloqueEnEdicion"
                :readonly="soloLectura"
                :catalogo="catalogoBloques"
              />
            </template>

            <pre
              v-if="mostrarIr"
              class="mt-2 max-h-64 overflow-auto rounded-md border border-gray-200 bg-gray-50 p-2 text-[10px] dark:border-gray-800 dark:bg-gray-900/40"
            >{{ astActual ? JSON.stringify(astActual, null, 2) : 'La fórmula no parsea — no hay IR que mostrar.' }}</pre>

            <div v-if="diagnosticosFormula.length > 0" class="space-y-1">
              <p class="text-xs font-medium text-gray-500">
                {{ diagnosticosFormula.length }}
                {{ diagnosticosFormula.length === 1 ? 'diagnóstico' : 'diagnósticos' }}
              </p>
              <button
                v-for="(diag, i) in diagnosticosFormula"
                :key="i"
                type="button"
                class="block w-full text-left text-xs text-red-500 hover:underline"
                @click="editorRef?.irAPosicion(diag.span.inicio.linea, diag.span.inicio.columna)"
              >
                {{ diag.codigo }} ({{ diag.span.inicio.linea }}:{{ diag.span.inicio.columna }}):
                {{ diag.mensaje }}
              </button>
            </div>

            <AelCapabilityView :formula-ael="formulaAel" />
          </div>

          <div class="rounded-lg border border-gray-200 dark:border-gray-800 p-4 space-y-3">
            <p class="text-sm font-medium">Prueba de fórmula</p>
            <p class="text-xs text-gray-500">
              Evalúa el texto de arriba (guardado o no) contra un inmueble y periodo reales —
              AEL-004 Fase 1.
            </p>
            <div class="space-y-3">
              <UFormField label="Inmueble" name="inmueble_prueba">
                <UiSelectorBuscable
                  v-model="inmuebleIdPrueba"
                  :opciones="opcionesInmueblePrueba"
                  placeholder="— Elegir —"
                />
              </UFormField>
              <UFormField label="Periodo" name="periodo_prueba">
                <UiSelectorBuscable
                  v-model="periodoIdPrueba"
                  :opciones="opcionesPeriodoPrueba"
                  placeholder="— Elegir —"
                />
              </UFormField>
              <UButton
                type="button"
                size="sm"
                variant="soft"
                block
                :loading="probando"
                :disabled="!inmuebleIdPrueba || !periodoIdPrueba || !formulaAel"
                @click="probar"
              >
                Probar fórmula
              </UButton>
            </div>

            <UAlert v-if="errorPrueba" color="error" variant="soft" :title="errorPrueba" />

            <div v-if="resultadoPrueba" class="text-sm">
              <p v-if="resultadoPrueba.valido">
                Resultado:
                <span class="font-medium">{{ resultadoPrueba.resultado }}</span>
                <span class="text-gray-500">
                  ({{
                    resultadoPrueba.tipo
                      ? (etiquetaTipo[resultadoPrueba.tipo] ?? resultadoPrueba.tipo)
                      : '—'
                  }})
                </span>
              </p>
              <div v-else class="space-y-1">
                <p class="text-amber-500">La fórmula no es válida:</p>
                <p
                  v-for="(diag, i) in resultadoPrueba.diagnosticos"
                  :key="i"
                  class="text-xs text-red-500"
                >
                  {{ diag.codigo }} ({{ diag.linea }}:{{ diag.columna }}): {{ diag.mensaje }}
                </p>
              </div>

              <button
                v-if="resultadoPrueba.traza.length > 0"
                type="button"
                class="mt-2 text-xs text-primary hover:underline"
                @click="mostrarTraza = !mostrarTraza"
              >
                {{ mostrarTraza ? 'Ocultar' : 'Ver' }} detalle del cálculo
              </button>

              <div
                v-if="mostrarTraza && resultadoPrueba.traza.length > 0"
                class="mt-2 rounded-lg border border-gray-200 dark:border-gray-800 p-3 space-y-1"
              >
                <p class="text-xs font-medium text-gray-500 mb-1">Detalle del cálculo</p>
                <div
                  v-for="(paso, i) in resultadoPrueba.traza"
                  :key="i"
                  class="flex items-baseline justify-between gap-4 text-xs"
                  :class="paso.nombre === null ? 'pt-1 mt-1 border-t border-gray-200 dark:border-gray-800 font-medium' : ''"
                >
                  <span class="font-mono text-gray-500 truncate">
                    {{ i + 1 }}. {{ paso.nombre === null ? 'RETORNAR' : paso.nombre }} =
                    {{ paso.expresionTexto }}
                  </span>
                  <span class="shrink-0">{{ formatoValorPaso(paso) }}</span>
                </div>
                <div class="flex items-baseline justify-between gap-4 text-xs pt-1 font-semibold">
                  <span>TOTAL</span>
                  <span>{{ formatoValorPaso(resultadoPrueba.traza[resultadoPrueba.traza.length - 1]!) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="editandoId">
          <h2 class="text-lg font-semibold mb-2">Casos de prueba</h2>
          <p class="text-xs text-gray-500 mb-3">
            Ejecuta la fórmula de arriba (guardada o no) contra insumos fijos — reproducible, sin
            tocar Supabase. AEL-004 Fase 6.
          </p>

          <p v-if="conceptoStore.casosPrueba.length === 0" class="text-gray-500 text-sm mb-4">
            Sin casos de prueba todavía.
          </p>
          <template v-else>
            <div class="flex items-center gap-3 mb-2">
              <UButton size="sm" variant="soft" @click="ejecutarTodos">Ejecutar todos</UButton>
              <p v-if="resumenEjecucion.total > 0" class="text-sm">
                <span class="text-green-600">{{ resumenEjecucion.passed }} passed</span> ·
                <span class="text-red-500">{{ resumenEjecucion.failed }} failed</span>
              </p>
            </div>
            <UiTabla
              class="mb-4"
              :columnas="[
                { clave: 'nombre', etiqueta: 'Nombre' },
                { clave: 'esperado', etiqueta: 'Esperado' },
                { clave: 'resultado', etiqueta: 'Resultado' },
                { clave: 'acciones', etiqueta: '' },
              ]"
              :filas="conceptoStore.casosPrueba"
              :clave-fila="(caso) => caso.id"
            >
              <template #celda-nombre="{ fila }">{{ fila.nombre }}</template>
              <template #celda-esperado="{ fila }">
                <span class="text-gray-500">
                  {{ fila.tipoEsperado
                  }}<template v-if="fila.resultadoEsperado && fila.resultadoEsperado.tipo !== 'NULO'">
                    = {{ fila.resultadoEsperado.valor }}</template
                  >
                </span>
              </template>
              <template #celda-resultado="{ fila }">
                <span
                  v-if="resultadosEjecucion[fila.id]"
                  :class="
                    resultadosEjecucion[fila.id]?.estado === 'passed'
                      ? 'text-green-600'
                      : 'text-red-500'
                  "
                >
                  {{ resultadosEjecucion[fila.id]?.estado }} —
                  {{ resultadosEjecucion[fila.id]?.mensaje }}
                </span>
                <span v-else class="text-gray-400">sin ejecutar</span>
              </template>
              <template #celda-acciones="{ fila }">
                <UButton size="xs" variant="ghost" color="error" @click="eliminarCaso(fila)">
                  Eliminar
                </UButton>
              </template>
            </UiTabla>
          </template>

          <div class="rounded-lg border border-gray-200 dark:border-gray-800 p-4 space-y-3 max-w-lg">
            <p class="text-sm font-medium">Nuevo caso de prueba</p>

            <UFormField label="Nombre" name="caso_nombre">
              <UInput v-model="nuevoCasoNombre" class="w-full" />
            </UFormField>

            <div v-if="camposFormulaActual.length > 0" class="space-y-2">
              <p class="text-xs font-medium text-gray-500">Insumos</p>
              <div
                v-for="campo in camposFormulaActual"
                :key="claveCampo(campo)"
                class="flex items-center gap-2"
              >
                <span class="text-xs font-mono w-56">
                  {{ campo.contrato }}.{{ campo.campo }} ({{ campo.tipo }})
                </span>
                <select
                  v-if="campo.tipo === 'BOOLEAN'"
                  v-model="entradasNuevoCasoBool[claveCampo(campo)]"
                  class="rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5 text-sm"
                >
                  <option :value="true">verdadero</option>
                  <option :value="false">falso</option>
                </select>
                <UInput
                  v-else
                  v-model="entradasNuevoCaso[claveCampo(campo)]"
                  size="sm"
                  :placeholder="campo.tipo === 'MONEY' ? '542250' : '0'"
                  class="w-40"
                />
              </div>
            </div>
            <p v-else class="text-xs text-gray-500">
              Esta fórmula no referencia PARAMETER/UNIT/CONCEPTO.
            </p>

            <div class="grid grid-cols-2 gap-4">
              <UFormField label="Tipo esperado" name="caso_tipo">
                <select
                  v-model="nuevoCasoTipoEsperado"
                  class="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5"
                >
                  <option value="MONEY">MONEY</option>
                  <option value="NUMBER">NUMBER</option>
                  <option value="BOOLEAN">BOOLEAN</option>
                  <option value="NULO">NULO</option>
                </select>
              </UFormField>
              <UFormField
                v-if="nuevoCasoTipoEsperado === 'BOOLEAN'"
                label="Resultado esperado"
                name="caso_resultado"
              >
                <select
                  v-model="nuevoCasoResultadoBool"
                  class="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5"
                >
                  <option :value="true">verdadero</option>
                  <option :value="false">falso</option>
                </select>
              </UFormField>
              <UFormField
                v-else-if="nuevoCasoTipoEsperado !== 'NULO'"
                label="Resultado esperado"
                name="caso_resultado"
              >
                <UInput v-model="nuevoCasoResultado" class="w-full" />
              </UFormField>
            </div>

            <UAlert v-if="errorCasoPrueba" color="error" variant="soft" :title="errorCasoPrueba" />

            <UButton size="sm" :loading="guardandoCaso" @click="guardarCasoPrueba">
              Guardar caso de prueba
            </UButton>
          </div>
        </div>
      </div>

      <!-- ── Definición ──────────────────────────────────────────────── -->
      <div v-else-if="tabActiva === 'configuracion'" class="max-w-lg space-y-4">
        <div class="flex gap-4">
          <UFormField label="Nombre" name="nombre" class="flex-1 min-w-0">
            <UInput v-model="nombre" required :disabled="soloLectura" class="w-full" />
          </UFormField>

          <UFormField label="Código" name="codigo" class="w-24 shrink-0">
            <UInput
              v-model="codigo"
              :disabled="editandoId !== null"
              placeholder="ADMIN"
              maxlength="5"
              required
              class="w-full"
            />
          </UFormField>
        </div>
        <p v-if="codigoDuplicado" class="text-xs text-red-500 -mt-2">
          Ya existe un concepto con este código.
        </p>

        <UFormField label="Modo de cálculo" name="modo_calculo">
          <select
            v-model="modoCalculo"
            :disabled="soloLectura"
            class="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5"
          >
            <option value="distribucion">Distribución (total, se reparte)</option>
            <option value="directo">Directo (por inmueble)</option>
          </select>
          <p v-if="modoCalculo === 'distribucion'" class="text-xs text-gray-500 mt-1">
            La fórmula calcula un solo total para toda la copropiedad — el motor lo reparte
            automáticamente por periodo y luego por coeficiente entre los inmuebles.
          </p>
          <p v-else class="text-xs text-gray-500 mt-1">
            La fórmula se evalúa una vez por cada inmueble, con sus propios datos (área,
            coeficiente...) — el resultado es directamente el cargo de ese inmueble.
          </p>
        </UFormField>

        <template v-if="tipoRecurrencia !== 'novedad'">
          <div class="flex gap-4">
            <UFormField
              label="Modo de valor"
              name="modo_valor"
              :class="modoValor === 'fijo' ? 'w-60 shrink-0' : 'flex-1'"
            >
              <select
                v-model="modoValor"
                :disabled="soloLectura"
                class="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5"
              >
                <option value="formulado">Formulado (fórmula AEL)</option>
                <option value="fijo">Fijo (monto directo)</option>
              </select>
            </UFormField>

            <UFormField v-if="modoValor === 'fijo'" label="Valor fijo" name="valor_fijo" class="flex-1 min-w-0">
              <UInput v-model="valorFijo" type="number" step="0.01" :disabled="soloLectura" class="w-full" />
            </UFormField>
          </div>
          <p v-if="modoValor === 'formulado'" class="text-xs text-gray-500 mt-1">
            La fórmula se construye y prueba en la pestaña Fórmula.
          </p>
        </template>

        <div class="grid grid-cols-2 gap-4">
          <UFormField label="Tipo" name="tipo_recurrencia">
            <select
              v-model="tipoRecurrencia"
              :disabled="soloLectura"
              class="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5"
            >
              <option value="recurrente">Recurrente (cada ciclo, desde una fecha)</option>
              <option value="unico">Único (una sola vez)</option>
              <option value="por_periodo">Por un periodo (rango de fechas)</option>
              <option value="novedad" :disabled="existeSingletonNovedad">
                Novedad (aplicado por inmueble)
              </option>
            </select>
            <p v-if="existeSingletonNovedad && tipoRecurrencia !== 'novedad'" class="text-xs text-gray-500 mt-1">
              Ya existe un concepto Novedad para esta copropiedad — solo puede haber uno.
            </p>
            <p v-else-if="tipoRecurrencia === 'novedad'" class="text-xs text-gray-500 mt-1">
              No tiene fórmula ni fecha propias — cada novedad capturada en un inmueble elige este
              concepto para clasificarse como "Novedad" en la liquidación.
            </p>
          </UFormField>

          <UFormField label="Prioridad" name="prioridad">
            <UInput v-model.number="prioridad" type="number" :disabled="soloLectura" class="w-full" />
          </UFormField>
        </div>

        <UFormField v-if="tipoRecurrencia === 'recurrente'" label="Periodicidad" name="periodicidad" class="max-w-xs">
          <select
            v-model="periodicidad"
            :disabled="soloLectura"
            class="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5"
          >
            <option value="mensual">Mensual</option>
            <option value="bimensual">Bimensual</option>
            <option value="trimestral">Trimestral</option>
            <option value="semestral">Semestral</option>
            <option value="anual">Anual</option>
          </select>
        </UFormField>

        <template v-if="tipoRecurrencia !== 'novedad'">
          <div class="flex gap-4 flex-wrap">
            <UFormField
              :label="tipoRecurrencia === 'por_periodo' ? 'Inicia en' : 'A partir de'"
              name="fecha_inicio"
              class="max-w-xs"
            >
              <UiSelectorMesAnio
                :anio="fechaInicioAnio"
                :mes="fechaInicioMes"
                :disabled="soloLectura"
                @update:anio="fechaInicioAnio = $event"
                @update:mes="fechaInicioMes = $event"
              />
            </UFormField>

            <UFormField
              v-if="tipoRecurrencia === 'por_periodo'"
              label="Hasta"
              name="fecha_fin"
              class="max-w-xs"
            >
              <UiSelectorMesAnio
                :anio="fechaFinAnio"
                :mes="fechaFinMes"
                :disabled="soloLectura"
                @update:anio="fechaFinAnio = $event"
                @update:mes="fechaFinMes = $event"
              />
            </UFormField>
          </div>
          <UAlert v-if="errorTemporal" color="error" variant="soft" :title="errorTemporal" />
        </template>

        <UFormField label="Cuenta presupuestal" name="presupuesto_cuenta_id" class="max-w-xs">
          <select
            v-model="presupuestoCuentaId"
            :disabled="soloLectura"
            class="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5"
          >
            <option :value="null">— Sin clasificar —</option>
            <option v-for="c in opcionesCuentaPresupuestal" :key="c.id" :value="c.id">
              {{ c.nombre }}
            </option>
          </select>
          <p class="text-xs text-gray-500 mt-1">
            Bajo qué cuenta de ingreso del presupuesto se clasifica lo que cobra este concepto —
            su ejecutado se suma ahí automáticamente (Σ cargos facturados).
          </p>
        </UFormField>
      </div>

      <!-- ── Alcance ─────────────────────────────────────────────────── -->
      <!-- max-w-3xl (no max-w-lg como Definición): cada condición es un
           select de campo + operador + valor + "Quitar" en una sola fila —
           con max-w-lg envuelve a 2-3 líneas por condición. -->
      <div v-else-if="tabActiva === 'alcance'" class="max-w-3xl space-y-4">
        <UFormField label="Alcance" name="alcance" class="max-w-xs">
          <select
            v-model="alcance"
            :disabled="soloLectura"
            class="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5"
          >
            <option value="todos">Todos los inmuebles</option>
            <option value="calculado">Calculado (condiciones)</option>
          </select>
          <p v-if="alcance === 'todos'" class="text-xs text-gray-500 mt-1">
            Se aplica a todos los inmuebles de la copropiedad, sin filtrar.
          </p>
          <p v-else class="text-xs text-gray-500 mt-1">
            Solo se aplica a los inmuebles que cumplan las condiciones de abajo — si
            <code>distribución</code>, el reparto se recalcula solo entre esos inmuebles.
          </p>
        </UFormField>
        <ConceptosCondicionBuilder
          v-if="alcance === 'calculado' && alcanceCondiciones"
          v-model="alcanceCondiciones"
          :readonly="soloLectura"
        />
        <UAlert v-if="errorAlcance" color="error" variant="soft" :title="errorAlcance" />
      </div>

      <!-- ── Auditoría ───────────────────────────────────────────────── -->
      <div v-else-if="tabActiva === 'auditoria'">
        <p v-if="!editandoId" class="text-sm text-gray-500">
          El estado, el flujo de aprobación y el historial de versiones están disponibles después
          de crear el concepto.
        </p>
        <template v-else>
          <div class="rounded-lg border border-gray-200 dark:border-gray-800 p-4 mb-6">
            <div class="flex items-center justify-between flex-wrap gap-2">
              <p class="text-sm font-medium">Estado: {{ conceptoEnEdicion?.estado }}</p>
              <div class="flex items-center gap-2 flex-wrap">
                <template v-if="conceptoEnEdicion?.estado === 'borrador'">
                  <UButton size="xs" variant="soft" :loading="cambiandoEstado" @click="enviarARevision">
                    Enviar a revisión
                  </UButton>
                  <UButton size="xs" variant="soft" color="error" :loading="cambiandoEstado" @click="archivar">
                    Archivar
                  </UButton>
                </template>
                <template v-else-if="conceptoEnEdicion?.estado === 'en_revision'">
                  <UButton size="xs" variant="soft" :loading="cambiandoEstado" @click="aprobar">
                    Aprobar
                  </UButton>
                  <UInput v-model="motivoRechazo" size="xs" placeholder="Motivo de rechazo" class="w-40" />
                  <UButton size="xs" variant="soft" color="error" :loading="cambiandoEstado" @click="rechazar">
                    Rechazar
                  </UButton>
                </template>
                <template v-else-if="conceptoEnEdicion?.estado === 'activo'">
                  <UButton size="xs" variant="soft" :loading="cambiandoEstado" @click="volverABorrador">
                    Volver a borrador
                  </UButton>
                  <UButton size="xs" variant="soft" color="error" :loading="cambiandoEstado" @click="archivar">
                    Archivar
                  </UButton>
                </template>
              </div>
            </div>
          </div>

          <h2 class="text-lg font-semibold mb-2">Historial de versiones</h2>
          <p v-if="conceptoStore.versiones.length === 0" class="text-gray-500 text-sm">
            Sin versiones registradas todavía.
          </p>
          <template v-else>
            <UiTabla
              class="mb-4"
              :columnas="[
                { clave: 'version', etiqueta: 'Versión' },
                { clave: 'fecha', etiqueta: 'Fecha' },
                { clave: 'estado', etiqueta: 'Estado' },
              ]"
              :filas="conceptoStore.versiones"
              :clave-fila="(v) => v.id"
            >
              <template #celda-version="{ fila }">{{ fila.version }}</template>
              <template #celda-fecha="{ fila }"><span class="text-gray-500">{{ new Date(fila.created_at).toLocaleString() }}</span></template>
              <template #celda-estado="{ fila }"><span class="text-gray-500">{{ fila.estado_concepto }}</span></template>
            </UiTabla>

            <div class="flex items-end gap-4 flex-wrap mb-2">
              <UFormField label="Comparar — versión A (original)" name="version_a">
                <UiSelectorBuscable v-model="versionCompararA" :opciones="opcionesVersion" placeholder="— Elegir —" />
              </UFormField>
              <UFormField label="Comparar — versión B (nueva)" name="version_b">
                <UiSelectorBuscable v-model="versionCompararB" :opciones="opcionesVersion" placeholder="— Elegir —" />
              </UFormField>
            </div>

            <div v-if="versionA && versionB" class="space-y-2">
              <div class="flex items-center justify-between">
                <p class="text-xs text-gray-500">
                  Comparando versión {{ versionA.version }} (izquierda/original) → versión
                  {{ versionB.version }} (derecha/nueva).
                </p>
                <div class="flex items-center gap-2">
                  <UButton
                    type="button"
                    size="xs"
                    :variant="modoDiff === 'texto' ? 'solid' : 'soft'"
                    @click="modoDiff = 'texto'"
                  >
                    Texto
                  </UButton>
                  <UButton
                    type="button"
                    size="xs"
                    :variant="modoDiff === 'bloques' ? 'solid' : 'soft'"
                    @click="modoDiff = 'bloques'"
                  >
                    Bloques
                  </UButton>
                </div>
              </div>

              <AelVersionDiff
                v-if="modoDiff === 'texto'"
                :original="versionA.formula_ael ?? ''"
                :modificado="versionB.formula_ael ?? ''"
              />
              <div v-else-if="diffBloques" class="grid grid-cols-2 gap-3">
                <div class="rounded-lg border border-gray-200 bg-gray-50/50 p-3 dark:border-gray-800 dark:bg-gray-900/20">
                  <p class="mb-2 text-[10px] font-medium uppercase text-gray-400">Original</p>
                  <AelBlockInstruccionDiff :instrucciones="diffBloques.original" :catalogo="catalogoBloques" />
                </div>
                <div class="rounded-lg border border-gray-200 bg-gray-50/50 p-3 dark:border-gray-800 dark:bg-gray-900/20">
                  <p class="mb-2 text-[10px] font-medium uppercase text-gray-400">Nueva</p>
                  <AelBlockInstruccionDiff :instrucciones="diffBloques.nueva" :catalogo="catalogoBloques" />
                </div>
              </div>
              <p v-else class="text-xs text-gray-400 italic">
                Alguna de las dos versiones tiene errores de sintaxis — corrígelo en modo texto
                para ver el diff como bloques.
              </p>
            </div>
            <p v-else class="text-xs text-gray-500">Elige una versión A y una B para ver el diff.</p>
          </template>
        </template>
      </div>
    </template>
  </div>
</template>
