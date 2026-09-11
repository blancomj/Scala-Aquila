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
  CLAVE_VALOR_RESULTADO,
  CLAVE_VALORES_TRAZA,
  ETIQUETA_CONTRATO,
  etiquetaCampo,
} from '~/utils/ael-etiquetas'
import { resumirRegla } from '~/utils/ael-resumen'
import {
  COLOR_ESTADO_CONCEPTO,
  DESCRIPCION_ESTADO_CONCEPTO,
  ETIQUETA_ESTADO_CONCEPTO,
} from '~/utils/concepto-labels'
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
  bloqueReglaInicial,
  bloqueLlamadaFuncionDesde,
  bloqueReferenciaContractDesde,
  diferenciarParDeListas,
  type BloqueExpresion,
  type BloqueRegla,
  type CatalogoBloques,
  type PayloadPaleta,
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
const toast = useToast()

const editandoId = ref<string | null>(null)
const codigo = ref('')
const nombre = ref('')
const modoCalculo = ref<'directo' | 'distribucion'>('distribucion')
// modoValor: fijo: valorFijo es el monto directo, sin fórmula. formulado:
// formulaAel, único modo que existía antes.
const modoValor = ref<'fijo' | 'formulado'>('formulado')
const valorFijo = ref('')
const formulaAel = ref('')
// ADC-01-ADD (§14) — solo tiene efecto con modoCalculo='distribucion': qué
// magnitud pondera allocate() en el Paso 2. 'coeficiente' preserva el
// comportamiento histórico.
const criterioDistribucion = ref<'coeficiente' | 'area_privada'>('coeficiente')
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
const itemsCuentaPresupuestal = computed(() => [
  { label: '— Sin clasificar —', value: null as string | null },
  ...opcionesCuentaPresupuestal.value.map((c) => ({ label: c.nombre, value: c.id as string | null })),
])

// ── Ayuda bajo demanda ───────────────────────────────────────────────
// Los párrafos explicativos largos se repliegan detrás de un "?" en vez de
// ocupar espacio permanente: quien ya conoce el campo no vuelve a leerlos.
// Solo queda visible una pista de una línea donde la elección es
// genuinamente ambigua (distribución contra directo).
const ayudasAbiertas = ref(new Set<string>())
function alternarAyuda(clave: string): void {
  const siguiente = new Set(ayudasAbiertas.value)
  if (!siguiente.delete(clave)) siguiente.add(clave)
  ayudasAbiertas.value = siguiente
}

// Opciones de los selectores del formulario. Eran `<select>` crudos con
// Tailwind a mano, en una pantalla donde el resto usa componentes del sistema;
// y los tipos del caso de prueba se mostraban como `MONEY`/`BOOLEAN`/`NULO`,
// que son los nombres del motor. (Distinto de los selectores DENTRO de una
// expresión, que sí siguen siendo nativos a propósito — ver D-35.)
const ITEMS_SI_NO = [
  { label: 'Verdadero', value: true },
  { label: 'Falso', value: false },
]

const ITEMS_TIPO_ESPERADO = [
  { label: 'Dinero', value: 'MONEY' },
  { label: 'Número', value: 'NUMBER' },
  { label: 'Sí o no', value: 'BOOLEAN' },
  { label: 'Sin valor', value: 'NULO' },
]

const ITEMS_TIPO_RECURRENCIA = [
  { label: 'Recurrente (cada ciclo, desde una fecha)', value: 'recurrente' },
  { label: 'Único (una sola vez)', value: 'unico' },
  { label: 'Por un periodo (rango de fechas)', value: 'por_periodo' },
  { label: 'Novedad (aplicado por inmueble)', value: 'novedad' },
]

const ITEMS_PERIODICIDAD = [
  { label: 'Mensual', value: 'mensual' },
  { label: 'Bimensual', value: 'bimensual' },
  { label: 'Trimestral', value: 'trimestral' },
  { label: 'Semestral', value: 'semestral' },
  { label: 'Anual', value: 'anual' },
]

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const

const CADA_CUANTO: Record<string, string> = {
  mensual: 'cada mes',
  bimensual: 'cada dos meses',
  trimestral: 'cada trimestre',
  semestral: 'cada semestre',
  anual: 'cada año',
}

function mesAnio(mes: number | null, anio: number | null): string {
  if (!mes || !anio) return '—'
  return `${MESES[mes - 1]} de ${anio}`
}


/** Resumen en lenguaje llano de lo que hará el concepto — ensambla todos los
 * campos en una frase verificable de un vistazo. Devuelve segmentos (no HTML)
 * para poder resaltar los valores sin usar v-html: el nombre de la cuenta
 * viene de la base de datos y no debe interpolarse como marcado. */
const resumenConcepto = computed<{ t: string, b?: boolean }[]>(() => {
  const partes: { t: string, b?: boolean }[] = []

  if (tipoRecurrencia.value === 'novedad') {
    partes.push({ t: 'Clasifica como ' })
    partes.push({ t: 'Novedad', b: true })
    partes.push({ t: ' lo que se capture manualmente en cada inmueble. No tiene fórmula, monto ni fecha propios. ' })
  } else {
    partes.push({ t: 'Cobra ' })
    if (modoValor.value === 'fijo') {
      partes.push({ t: 'un monto fijo de ' })
      partes.push({ t: formatoMoneda(Number(valorFijo.value || 0)), b: true })
    } else {
      partes.push({ t: 'el resultado de su fórmula', b: true })
    }

    if (tipoRecurrencia.value === 'recurrente') {
      partes.push({ t: ' ' })
      partes.push({ t: CADA_CUANTO[periodicidad.value] ?? 'cada ciclo', b: true })
      partes.push({ t: ` desde ${mesAnio(fechaInicioMes.value, fechaInicioAnio.value)}` })
    } else if (tipoRecurrencia.value === 'por_periodo') {
      partes.push({ t: ' entre ' })
      partes.push({ t: mesAnio(fechaInicioMes.value, fechaInicioAnio.value), b: true })
      partes.push({ t: ' y ' })
      partes.push({ t: mesAnio(fechaFinMes.value, fechaFinAnio.value), b: true })
    } else {
      partes.push({ t: ' ' })
      partes.push({ t: 'una sola vez', b: true })
      partes.push({ t: ` en ${mesAnio(fechaInicioMes.value, fechaInicioAnio.value)}` })
    }

    partes.push({
      t: modoCalculo.value === 'distribucion'
        ? ', repartido entre los inmuebles por coeficiente. '
        : ', calculado por separado para cada inmueble. ',
    })

    if (alcance.value === 'todos') {
      partes.push({ t: 'Aplica a ' })
      partes.push({ t: 'todos', b: true })
      partes.push({ t: ' los inmuebles. ' })
    } else {
      partes.push({ t: 'Aplica solo a los inmuebles que ' })
      partes.push({ t: 'cumplan las condiciones', b: true })
      partes.push({ t: '. ' })
    }
  }

  const cuenta = opcionesCuentaPresupuestal.value.find((c) => c.id === presupuestoCuentaId.value)
  if (cuenta) {
    partes.push({ t: 'Se contabiliza en ' })
    partes.push({ t: `«${cuenta.nombre}»`, b: true })
    partes.push({ t: '.' })
  }

  return partes
})

/** Un concepto sin cuenta presupuestal cobra pero no aparece en la ejecución
 * del presupuesto — hoy eso solo se descubre semanas después. */
const faltaCuentaPresupuestal = computed(
  () => presupuestoCuentaId.value === null && tipoRecurrencia.value !== 'novedad',
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

const canvasRef = ref<{ insertarEnNodoActivo: (b: BloqueExpresion) => boolean } | null>(null)
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
type TabConcepto = 'formula' | 'configuracion' | 'auditoria'
// "Alcance" ya no es pestaña propia: era un select de dos opciones más un
// constructor condicional, y vive mejor como una sección de Definición, donde
// el usuario ya está decidiendo el comportamiento del concepto.
const TODAS_TABS_CONCEPTO: ReadonlyArray<{ id: TabConcepto; etiqueta: string }> = [
  { id: 'configuracion', etiqueta: 'Definición' },
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

// El mapa de estados vive en concepto-labels.ts (mismo criterio que
// presupuesto-labels.ts). Este componente lo redeclaraba con un color
// distinto para `en_revision` —warning aquí, primary en el catálogo—, así que
// el mismo estado se veía de dos colores según la pantalla; y mostraba el
// enum crudo (`en_revision`) en tres sitios.

/** Inserta un ítem del catálogo en el modo que esté activo (F4, mov. 06).
 * Antes esto forzaba el cambio a modo Texto sin avisar, porque el panel solo
 * sabía hablarle al editor de código; el modo bloques tenía su propia paleta
 * aparte, sin descripciones y solo arrastrable. */
function insertarVariable(texto: string, payload: PayloadPaleta): void {
  if (modoFormula.value === 'texto') {
    editorRef.value?.insertarTexto(texto)
    return
  }
  const bloque =
    payload.kind === 'campo'
      ? bloqueReferenciaContractDesde(payload.contrato, payload.campo)
      : bloqueLlamadaFuncionDesde(payload.nombre)

  if (!canvasRef.value?.insertarEnNodoActivo(bloque)) {
    toast.add({
      title: 'Elige primero dónde va.',
      description: 'Toca un valor del lienzo y vuelve a pulsar el del catálogo.',
      color: 'warning',
    })
  }
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

// F3 (mov. 05) — continuidad del árbol. Antes se re-derivaba SIEMPRE al
// entrar a bloques, así que bastaba un texto inválido para perderlo: cambiar
// el tipo de un valor a «Dato del sistema» nace con el campo sin elegir,
// imprime `PARAMETER.`, deja de parsear, y al volver el lienzo mostraba un
// error en vez del árbol (hallazgo C2, alcanzable en tres clics).
//
// `textoDelLienzo` guarda lo último que imprimió el propio lienzo. Si el
// texto sigue siendo ese, nadie lo editó a mano mientras estábamos en modo
// texto y el árbol en memoria sigue siendo la verdad — se conserva aunque no
// parsee. Solo se re-deriva cuando el texto cambió de verdad.
let textoDelLienzo: string | null = null

function activarModoBloques(): void {
  modoFormula.value = 'bloques'

  if (bloqueEnEdicion.value && formulaAel.value === textoDelLienzo) return

  const { regla } = parsear(formulaAel.value)
  if (regla) {
    bloqueEnEdicion.value = astABloques(regla)
  } else if (!formulaAel.value.trim()) {
    // Fórmula en blanco: se siembra en vez de acusar un error de sintaxis.
    bloqueEnEdicion.value = bloqueReglaInicial(codigo.value.trim().toLowerCase())
  } else {
    bloqueEnEdicion.value = null
  }
}

function activarModoTexto(): void {
  modoFormula.value = 'texto'
}

// Huecos del lienzo — los nodos se marcan a sí mismos con `data-incompleto`
// (AelBlockExpresion). Se cuentan desde el DOM en vez de recorrer el árbol
// para no duplicar la definición de «incompleto» en dos sitios que puedan
// divergir: el nodo es el que sabe cuándo le falta algo.
const lienzoRef = ref<HTMLElement | null>(null)
const huecosEnLienzo = ref(0)

function recontarHuecos(): void {
  huecosEnLienzo.value =
    modoFormula.value === 'bloques' ? (lienzoRef.value?.querySelectorAll('[data-incompleto]').length ?? 0) : 0
}

watch([bloqueEnEdicion, modoFormula], () => nextTick(recontarHuecos), { immediate: true })

function irAPrimerHueco(): void {
  const hueco = lienzoRef.value?.querySelector('[data-incompleto]')
  if (!hueco) return
  hueco.scrollIntoView({ block: 'center', behavior: 'smooth' })
  hueco.querySelector<HTMLElement>('select, input')?.focus()
}

watch(bloqueEnEdicion, (nuevo) => {
  if (!nuevo) return
  const texto = imprimir(bloquesAAst(nuevo))
  textoDelLienzo = texto
  formulaAel.value = texto
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

// F4, mov. 11 — «Qué calcula esta fórmula». El panel equivalente de la
// pestaña Definición («Qué hace este concepto») se detiene justo aquí: dice
// «Cobra el resultado de su fórmula» y no entra. Esta es la lectura que
// permite aprobar una fórmula sin saber AEL, y la única que no existía ni en
// texto ni en bloques.
const resumenFormula = computed(() => (astActual.value ? resumirRegla(astActual.value) : null))

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
  const estado = conceptoEnEdicion.value.estado
  const etiqueta = ETIQUETA_ESTADO_CONCEPTO[estado] ?? estado
  return `Este concepto está «${etiqueta}»: el contenido no se puede editar hasta que vuelva a borrador.`
})

// ── confirmación de las transiciones de estado ──────────────────────────
// Enviar a revisión, aprobar, rechazar, volver a borrador y archivar se
// ejecutaban al primer clic. Son movimientos del flujo de aprobación —y
// archivar es terminal— mientras que las acciones EN LOTE del catálogo sí
// pedían confirmación: la incoherencia estaba justo al revés de lo esperable.
type Transicion = 'revision' | 'aprobar' | 'rechazar' | 'borrador' | 'archivar'

const transicionPendiente = ref<Transicion | null>(null)
const errorMotivoRechazo = ref<string | undefined>(undefined)

const DETALLE_TRANSICION: Record<
  Transicion,
  { titulo: string; cuerpo: string; accion: string; destructiva?: boolean }
> = {
  revision: {
    titulo: '¿Enviar a revisión?',
    cuerpo:
      'El concepto deja de ser editable hasta que otra persona lo apruebe o lo devuelva a borrador.',
    accion: 'Enviar a revisión',
  },
  aprobar: {
    titulo: '¿Aprobar este concepto?',
    cuerpo: 'Queda activo y empezará a generar cargos en la próxima liquidación.',
    accion: 'Aprobar',
  },
  rechazar: {
    titulo: '¿Devolver a borrador?',
    cuerpo: 'Vuelve a ser editable. El motivo queda en el historial de la revisión.',
    accion: 'Rechazar',
    destructiva: true,
  },
  borrador: {
    titulo: '¿Volver a borrador?',
    cuerpo:
      'Deja de generar cargos nuevos hasta que se vuelva a aprobar. Los cargos ya generados no se tocan.',
    accion: 'Volver a borrador',
  },
  archivar: {
    titulo: '¿Archivar este concepto?',
    cuerpo:
      'Es una transición terminal: no hay forma de reactivarlo desde aquí. Deja de generar cargos nuevos; los ya generados no se modifican.',
    accion: 'Archivar',
    destructiva: true,
  },
}

const detalleTransicion = computed(() =>
  transicionPendiente.value ? DETALLE_TRANSICION[transicionPendiente.value] : null,
)

function pedirConfirmacion(transicion: Transicion): void {
  errorMotivoRechazo.value = undefined
  transicionPendiente.value = transicion
}

async function confirmarTransicion(): Promise<void> {
  const transicion = transicionPendiente.value
  if (!transicion) return

  if (transicion === 'rechazar' && !motivoRechazo.value.trim()) {
    errorMotivoRechazo.value = 'Escribe qué hay que corregir.'
    return
  }

  const ejecutar = {
    revision: enviarARevision,
    aprobar,
    rechazar,
    borrador: volverABorrador,
    archivar,
  }[transicion]

  await ejecutar()
  // Se cierra pase lo que pase: si falló, el UAlert de error queda visible
  // detrás del modal y volver a intentarlo sin leerlo no ayudaría.
  transicionPendiente.value = null
}

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
  criterioDistribucion.value = concepto.criterio_distribucion
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
    if (!formulaAel.value) {
      error.value = 'Escribe una fórmula antes de guardar.'
      tabActiva.value = 'formula'
      return
    }
    if (diagnosticosFormula.value.length > 0) {
      error.value = 'La fórmula tiene errores — corrígelos antes de guardar.'
      tabActiva.value = 'formula'
      return
    }
  } else if (!valorFijo.value) {
    error.value = 'Escribe un valor fijo antes de guardar.'
    tabActiva.value = 'configuracion'
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
          criterioDistribucion: criterioDistribucion.value,
          presupuestoCuentaId: presupuestoCuentaId.value,
        })
        toast.add({ title: 'Concepto actualizado', color: 'success' })
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
        criterioDistribucion: criterioDistribucion.value,
        presupuestoCuentaId: presupuestoCuentaId.value,
      })
      // Tras crear, se navega al editor del concepto recién creado — ahí
      // (no antes) quedan disponibles versiones/casos de prueba, que
      // requieren un id ya persistido.
      toast.add({ title: 'Concepto creado', color: 'success' })
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

// F4, mov. 07 — los valores calculados, sobre los bloques que los producen.
// La traza ya venía del evaluador real con nombre, valor y tipo por cada
// cálculo ejecutado, y se pintaba como una lista aparte en otra columna: el
// dato existía y estaba en pantalla, a 300 px de donde significa algo. Esto
// es lo único que un constructor visual puede hacer y el texto no — mostrar
// la fórmula y sus valores en el mismo sitio.
//
// La unión es por nombre de cálculo; el RETORNAR final viene con nombre null
// y se indexa bajo una clave reservada que AelBlockInstruccion conoce.
const valoresDeTraza = computed(() => {
  const mapa = new Map<string, string>()
  if (!resultadoPrueba.value?.valido) return mapa
  for (const paso of resultadoPrueba.value.traza) {
    mapa.set(paso.nombre ?? CLAVE_VALOR_RESULTADO, formatoValorPaso(paso))
  }
  return mapa
})
provide(CLAVE_VALORES_TRAZA, valoresDeTraza)

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

    <div v-if="cargando" class="space-y-3">
      <USkeleton class="h-24 w-full rounded-lg" />
      <USkeleton class="h-24 w-full rounded-lg" />
      <USkeleton class="h-24 w-full rounded-lg" />
    </div>
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
            <span
              v-if="editandoId"
              class="font-mono text-xs px-2 py-0.5 rounded border border-neutral-300 dark:border-neutral-700 text-neutral-500"
            >
              {{ codigo }}
            </span>
            <UBadge
              v-if="conceptoEnEdicion"
              :color="COLOR_ESTADO_CONCEPTO[conceptoEnEdicion.estado] ?? 'neutral'"
              variant="subtle"
            >
              {{ ETIQUETA_ESTADO_CONCEPTO[conceptoEnEdicion.estado] ?? conceptoEnEdicion.estado }}
            </UBadge>
          </div>
        </div>
        <!-- Solo acciones reales: "Historial de versiones" y "Probar fórmula"
             se retiraron porque no eran acciones — hacían `tabActiva = …`, o
             sea exactamente lo mismo que la barra de pestañas de abajo. El
             subtítulo "Código · Modo · Valor" también se fue: duplicaba tres
             campos que están unos centímetros más abajo, y mostraba el enum
             crudo sin traducir. El código ahora es un chip junto al título. -->
        <div class="flex items-center gap-2 flex-wrap">
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
      <nav class="flex gap-1 border-b border-neutral-200 dark:border-neutral-800 overflow-x-auto">
        <button
          v-for="tab in TABS_CONCEPTO"
          :key="tab.id"
          type="button"
          class="px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors"
          :class="
            tabActiva === tab.id
              ? 'border-blue-600 text-blue-600 font-medium'
              : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
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
            <!-- Segmentado, no dos botones sueltos: mismo patrón que "Modo de
                 cálculo" en la pestaña Definición — con dos opciones, un par
                 de botones que cambian de variante no lee como un selector. -->
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div
                class="grid grid-flow-col auto-cols-fr gap-0.5 rounded-md bg-neutral-100 p-0.5 dark:bg-neutral-800"
                role="group"
                aria-label="Modo del constructor de fórmula"
              >
                <button
                  type="button"
                  class="rounded px-3 py-1.5 text-sm transition-colors"
                  :class="
                    modoFormula === 'texto'
                      ? 'bg-white font-medium shadow-sm dark:bg-neutral-900'
                      : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                  "
                  :aria-pressed="modoFormula === 'texto'"
                  @click="activarModoTexto"
                >
                  Texto
                </button>
                <button
                  type="button"
                  class="rounded px-3 py-1.5 text-sm transition-colors"
                  :class="
                    modoFormula === 'bloques'
                      ? 'bg-white font-medium shadow-sm dark:bg-neutral-900'
                      : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                  "
                  :aria-pressed="modoFormula === 'bloques'"
                  @click="activarModoBloques"
                >
                  Bloques
                </button>
              </div>
              <UButton type="button" size="xs" variant="ghost" @click="mostrarIr = !mostrarIr">
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
            <div v-else ref="lienzoRef">
              <AelBlockCanvas
                ref="canvasRef"
                v-model:bloque="bloqueEnEdicion"
                :readonly="soloLectura"
                :catalogo="catalogoBloques"
              />
            </div>

            <pre
              v-if="mostrarIr"
              class="mt-2 max-h-64 overflow-auto rounded-md border border-neutral-200 bg-neutral-50 p-2 text-xs dark:border-neutral-800 dark:bg-neutral-900/40"
            >{{ astActual ? JSON.stringify(astActual, null, 2) : 'La fórmula no parsea — no hay IR que mostrar.' }}</pre>

            <!-- F3 (mov. 08) — en modo bloques la línea:columna es de un texto
                 que no está a la vista, y el clic llamaba a editorRef, que es
                 null porque el editor no está montado: el botón existía, se
                 subrayaba al pasar el puntero y no hacía nada (hallazgo A6).
                 Ahora cada modo ofrece la navegación que sí puede cumplir. -->
            <div v-if="huecosEnLienzo > 0" class="flex flex-wrap items-center gap-2">
              <span class="text-xs font-medium text-error">
                {{ huecosEnLienzo }}
                {{ huecosEnLienzo === 1 ? 'campo sin elegir' : 'campos sin elegir' }}
              </span>
              <button
                type="button"
                class="text-xs text-primary underline-offset-2 hover:underline"
                @click="irAPrimerHueco"
              >
                Ir al primero
              </button>
            </div>

            <div v-if="diagnosticosFormula.length > 0" class="space-y-1">
              <p class="text-xs font-medium text-neutral-500">
                {{ diagnosticosFormula.length }}
                {{ diagnosticosFormula.length === 1 ? 'diagnóstico' : 'diagnósticos' }}
              </p>
              <template v-if="modoFormula === 'texto'">
                <button
                  v-for="(diag, i) in diagnosticosFormula"
                  :key="i"
                  type="button"
                  class="block w-full text-left text-xs text-error hover:underline"
                  @click="editorRef?.irAPosicion(diag.span.inicio.linea, diag.span.inicio.columna)"
                >
                  {{ diag.codigo }} ({{ diag.span.inicio.linea }}:{{ diag.span.inicio.columna }}):
                  {{ diag.mensaje }}
                </button>
              </template>
              <p v-for="(diag, i) in diagnosticosFormula" v-else :key="`b-${i}`" class="text-xs text-error">
                {{ diag.mensaje }}
              </p>
            </div>

            <!-- Mismo patrón que «Qué hace este concepto» en la pestaña
                 Definición: una frase verificable de un vistazo (mov. 11). -->
            <div v-if="resumenFormula" class="overflow-hidden rounded-lg border border-primary/40">
              <header class="border-b border-primary/40 bg-primary/5 px-4 py-2.5">
                <h3 class="text-xs font-semibold tracking-wider text-primary uppercase">
                  Qué calcula esta fórmula
                </h3>
              </header>
              <p class="p-4 text-sm leading-relaxed">{{ resumenFormula }}</p>
            </div>

            <AelCapabilityView :formula-ael="formulaAel" />
          </div>

          <div class="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 space-y-3">
            <p class="text-sm font-medium">Prueba de fórmula</p>
            <p class="text-xs text-neutral-500">
              Evalúa la fórmula tal como está ahora —guardada o no— contra un inmueble y un
              periodo reales.
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
                <span class="text-neutral-500">
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
                class="mt-2 rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 space-y-1"
              >
                <p class="text-xs font-medium text-neutral-500 mb-1">Detalle del cálculo</p>
                <div
                  v-for="(paso, i) in resultadoPrueba.traza"
                  :key="i"
                  class="flex items-baseline justify-between gap-4 text-xs"
                  :class="paso.nombre === null ? 'pt-1 mt-1 border-t border-neutral-200 dark:border-neutral-800 font-medium' : ''"
                >
                  <span class="font-mono text-neutral-500 truncate">
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
          <p class="text-xs text-neutral-500 mb-3">
            Ejecuta la fórmula contra valores que tú fijas, siempre los mismos. A diferencia de
            «Probar fórmula», no depende de ningún inmueble ni periodo: el resultado no cambia
            con los datos de la copropiedad.
          </p>

          <p v-if="conceptoStore.casosPrueba.length === 0" class="text-neutral-500 text-sm mb-4">
            Sin casos de prueba todavía.
          </p>
          <template v-else>
            <div class="flex items-center gap-3 mb-2">
              <UButton size="sm" variant="soft" @click="ejecutarTodos">Ejecutar todos</UButton>
              <p v-if="resumenEjecucion.total > 0" class="text-sm">
                <span class="text-success">{{ resumenEjecucion.passed }} correctos</span> ·
                <span class="text-error">{{ resumenEjecucion.failed }} fallidos</span>
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
                <span class="text-neutral-500">
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
                    resultadosEjecucion[fila.id]?.estado === 'passed' ? 'text-success' : 'text-error'
                  "
                >
                  {{ resultadosEjecucion[fila.id]?.estado === 'passed' ? 'Correcto' : 'Falló' }} —
                  {{ resultadosEjecucion[fila.id]?.mensaje }}
                </span>
                <span v-else class="text-neutral-500">Sin ejecutar</span>
              </template>
              <template #celda-acciones="{ fila }">
                <UButton size="xs" variant="ghost" color="error" @click="eliminarCaso(fila)">
                  Eliminar
                </UButton>
              </template>
            </UiTabla>
          </template>

          <div class="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 space-y-3 max-w-lg">
            <p class="text-sm font-medium">Nuevo caso de prueba</p>

            <UFormField label="Nombre" name="caso_nombre">
              <UInput v-model="nuevoCasoNombre" class="w-full" />
            </UFormField>

            <div v-if="camposFormulaActual.length > 0" class="space-y-2">
              <p class="text-xs font-medium text-neutral-500">Insumos</p>
              <div
                v-for="campo in camposFormulaActual"
                :key="claveCampo(campo)"
                class="flex items-center gap-2"
              >
                <span class="w-56 text-xs">
                  {{ etiquetaCampo(campo.campo) }}
                  <span class="text-neutral-500">
                    · {{ ETIQUETA_CONTRATO[campo.contrato] ?? campo.contrato }}
                  </span>
                </span>
                <USelect
                  v-if="campo.tipo === 'BOOLEAN'"
                  v-model="entradasNuevoCasoBool[claveCampo(campo)]"
                  :items="ITEMS_SI_NO"
                  value-key="value"
                  size="sm"
                  class="w-40"
                />
                <UInput
                  v-else
                  v-model="entradasNuevoCaso[claveCampo(campo)]"
                  size="sm"
                  :placeholder="campo.tipo === 'MONEY' ? '542250' : '0'"
                  class="w-40"
                />
              </div>
            </div>
            <p v-else class="text-xs text-neutral-500">
              Esta fórmula no referencia PARAMETER/UNIT/CONCEPTO.
            </p>

            <div class="grid grid-cols-2 gap-4">
              <UFormField label="Tipo esperado" name="caso_tipo">
                <USelect
                  v-model="nuevoCasoTipoEsperado"
                  :items="ITEMS_TIPO_ESPERADO"
                  value-key="value"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                v-if="nuevoCasoTipoEsperado === 'BOOLEAN'"
                label="Resultado esperado"
                name="caso_resultado"
              >
                <USelect
                  v-model="nuevoCasoResultadoBool"
                  :items="ITEMS_SI_NO"
                  value-key="value"
                  class="w-full"
                />
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
      <!-- Antes: una sola columna `max-w-lg` con nueve campos apilados sin
           agrupar, que dejaba ~2/3 del ancho vacío. Ahora: dos columnas
           (formulario + resumen fijo) y cinco secciones rotuladas, que hacen
           visible una estructura que siempre estuvo ahí. "Alcance" se absorbió
           aquí desde su antigua pestaña propia. -->
      <div v-else-if="tabActiva === 'configuracion'">
        <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
          <div class="space-y-4">
            <!-- Identificación -->
            <section class="rounded-lg border border-neutral-200 dark:border-neutral-800">
              <header class="px-4 py-2.5 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/40">
                <h3 class="text-xs font-semibold uppercase tracking-wider text-neutral-500">Identificación</h3>
              </header>
              <div class="p-4 space-y-3">
                <div class="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-4">
                  <UFormField label="Nombre" name="nombre" class="min-w-0">
                    <UInput v-model="nombre" required :disabled="soloLectura" class="w-full" />
                  </UFormField>
                  <UFormField label="Código" name="codigo" class="min-w-0">
                    <UInput
                      v-model="codigo"
                      :disabled="editandoId !== null"
                      placeholder="ADMIN"
                      maxlength="5"
                      required
                      class="w-full font-mono"
                    />
                  </UFormField>
                </div>
                <p v-if="codigoDuplicado" class="text-xs text-red-500">
                  Ya existe un concepto con este código.
                </p>
                <p v-else-if="editandoId" class="text-xs text-neutral-500">
                  El código queda fijo una vez creado el concepto.
                </p>
              </div>
            </section>

            <!-- Cómo se calcula -->
            <section class="rounded-lg border border-neutral-200 dark:border-neutral-800">
              <header class="px-4 py-2.5 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/40">
                <h3 class="text-xs font-semibold uppercase tracking-wider text-neutral-500">Cómo se calcula</h3>
              </header>
              <div class="p-4 space-y-4">
                <div class="space-y-1.5">
                  <span class="flex items-center gap-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Modo de cálculo
                    <button
                      type="button"
                      class="size-4 shrink-0 rounded-full border border-neutral-300 dark:border-neutral-600 text-xs leading-none text-neutral-500 hover:border-primary hover:text-primary"
                      :aria-expanded="ayudasAbiertas.has('calculo')"
                      aria-label="Explicar modo de cálculo"
                      @click="alternarAyuda('calculo')"
                    >?</button>
                  </span>
                  <!-- Segmentado en vez de <select>: con solo dos opciones, un
                       desplegable esconde la mitad de la decisión tras un clic. -->
                  <div class="grid grid-flow-col auto-cols-fr gap-0.5 p-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800">
                    <button
                      v-for="opcion in [
                        { v: 'distribucion', t: 'Distribución' },
                        { v: 'directo', t: 'Directo' },
                      ]"
                      :key="opcion.v"
                      type="button"
                      :disabled="soloLectura"
                      :aria-pressed="modoCalculo === opcion.v"
                      class="px-3 py-1.5 text-sm rounded transition-colors disabled:opacity-50"
                      :class="
                        modoCalculo === opcion.v
                          ? 'bg-white dark:bg-neutral-900 font-medium shadow-sm'
                          : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                      "
                      @click="modoCalculo = opcion.v as 'distribucion' | 'directo'"
                    >
                      {{ opcion.t }}
                    </button>
                  </div>
                  <p class="text-xs text-neutral-500">
                    {{
                      modoCalculo === 'distribucion'
                        ? 'Un total para toda la copropiedad, repartido por coeficiente.'
                        : 'La fórmula se evalúa una vez por cada inmueble, con sus propios datos.'
                    }}
                  </p>
                  <p
                    v-if="ayudasAbiertas.has('calculo')"
                    class="text-xs text-neutral-600 dark:text-neutral-300 border-l-2 border-neutral-200 dark:border-neutral-700 pl-3 py-2 bg-neutral-50 dark:bg-neutral-900/40 rounded-r"
                  >
                    <strong>Distribución:</strong> la fórmula calcula un solo total para toda la
                    copropiedad — el motor lo reparte automáticamente por periodo y luego por
                    coeficiente entre los inmuebles.<br>
                    <strong>Directo:</strong> la fórmula se evalúa una vez por cada inmueble, con sus
                    propios datos (área, coeficiente...) — el resultado es directamente el cargo de
                    ese inmueble.
                  </p>
                </div>

                <div v-if="modoCalculo === 'distribucion'" class="space-y-1.5">
                  <span class="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Criterio de distribución</span>
                  <div class="grid grid-flow-col auto-cols-fr gap-0.5 p-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800 max-w-sm">
                    <button
                      v-for="opcion in [
                        { v: 'coeficiente', t: 'Coeficiente' },
                        { v: 'area_privada', t: 'Área privada' },
                      ]"
                      :key="opcion.v"
                      type="button"
                      :disabled="soloLectura"
                      :aria-pressed="criterioDistribucion === opcion.v"
                      class="px-3 py-1.5 text-sm rounded transition-colors disabled:opacity-50"
                      :class="
                        criterioDistribucion === opcion.v
                          ? 'bg-white dark:bg-neutral-900 font-medium shadow-sm'
                          : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                      "
                      @click="criterioDistribucion = opcion.v as 'coeficiente' | 'area_privada'"
                    >
                      {{ opcion.t }}
                    </button>
                  </div>
                  <p class="text-xs text-neutral-500">
                    {{
                      criterioDistribucion === 'coeficiente'
                        ? 'El total se reparte según el coeficiente de copropiedad de cada inmueble.'
                        : 'El total se reparte según el área privada — los inmuebles sin área diligenciada quedan fuera y se reportan en Verificación previa.'
                    }}
                  </p>
                </div>

                <div v-if="tipoRecurrencia !== 'novedad'" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div class="space-y-1.5">
                    <span class="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Modo de valor</span>
                    <div class="grid grid-flow-col auto-cols-fr gap-0.5 p-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800">
                      <button
                        v-for="opcion in [
                          { v: 'fijo', t: 'Fijo' },
                          { v: 'formulado', t: 'Formulado' },
                        ]"
                        :key="opcion.v"
                        type="button"
                        :disabled="soloLectura"
                        :aria-pressed="modoValor === opcion.v"
                        class="px-3 py-1.5 text-sm rounded transition-colors disabled:opacity-50"
                        :class="
                          modoValor === opcion.v
                            ? 'bg-white dark:bg-neutral-900 font-medium shadow-sm'
                            : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                        "
                        @click="modoValor = opcion.v as 'fijo' | 'formulado'"
                      >
                        {{ opcion.t }}
                      </button>
                    </div>
                  </div>

                  <UFormField v-if="modoValor === 'fijo'" label="Valor fijo" name="valor_fijo" class="min-w-0">
                    <UInput v-model="valorFijo" type="number" step="0.01" :disabled="soloLectura" class="w-full" />
                  </UFormField>
                  <div v-else class="space-y-1.5">
                    <span class="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Fórmula</span>
                    <UButton variant="soft" size="sm" class="w-full justify-center" @click="tabActiva = 'formula'">
                      Construir y probar →
                    </UButton>
                  </div>
                </div>
              </div>
            </section>

            <!-- Cuándo se cobra -->
            <section class="rounded-lg border border-neutral-200 dark:border-neutral-800">
              <header class="px-4 py-2.5 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/40">
                <h3 class="text-xs font-semibold uppercase tracking-wider text-neutral-500">Cuándo se cobra</h3>
              </header>
              <div class="p-4 space-y-4">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <UFormField label="Tipo" name="tipo_recurrencia">
                    <USelect
                      v-model="tipoRecurrencia"
                      :items="ITEMS_TIPO_RECURRENCIA.map((i) => ({ ...i, disabled: i.value === 'novedad' && existeSingletonNovedad }))"
                      value-key="value"
                      :disabled="soloLectura"
                      class="w-full"
                    />
                  </UFormField>

                  <UFormField v-if="tipoRecurrencia === 'recurrente'" label="Periodicidad" name="periodicidad">
                    <USelect
                      v-model="periodicidad"
                      :items="ITEMS_PERIODICIDAD"
                      value-key="value"
                      :disabled="soloLectura"
                      class="w-full"
                    />
                  </UFormField>
                </div>

                <p v-if="existeSingletonNovedad && tipoRecurrencia !== 'novedad'" class="text-xs text-neutral-500">
                  Ya existe un concepto Novedad para esta copropiedad — solo puede haber uno.
                </p>
                <p v-else-if="tipoRecurrencia === 'novedad'" class="text-xs text-neutral-500">
                  No tiene fórmula ni fecha propias — cada novedad capturada en un inmueble elige
                  este concepto para clasificarse como "Novedad" en la liquidación.
                </p>

                <div v-if="tipoRecurrencia !== 'novedad'" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <UFormField
                    :label="tipoRecurrencia === 'por_periodo' ? 'Inicia en' : 'A partir de'"
                    name="fecha_inicio"
                  >
                    <UiSelectorMesAnio
                      :anio="fechaInicioAnio"
                      :mes="fechaInicioMes"
                      :disabled="soloLectura"
                      @update:anio="fechaInicioAnio = $event"
                      @update:mes="fechaInicioMes = $event"
                    />
                  </UFormField>

                  <UFormField v-if="tipoRecurrencia === 'por_periodo'" label="Hasta" name="fecha_fin">
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

                <div class="max-w-[180px] space-y-1.5">
                  <span class="flex items-center gap-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Prioridad
                    <button
                      type="button"
                      class="size-4 shrink-0 rounded-full border border-neutral-300 dark:border-neutral-600 text-xs leading-none text-neutral-500 hover:border-primary hover:text-primary"
                      :aria-expanded="ayudasAbiertas.has('prioridad')"
                      aria-label="Explicar prioridad"
                      @click="alternarAyuda('prioridad')"
                    >?</button>
                  </span>
                  <UInput v-model.number="prioridad" type="number" :disabled="soloLectura" class="w-full" />
                </div>
                <p
                  v-if="ayudasAbiertas.has('prioridad')"
                  class="text-xs text-neutral-600 dark:text-neutral-300 border-l-2 border-neutral-200 dark:border-neutral-700 pl-3 py-2 bg-neutral-50 dark:bg-neutral-900/40 rounded-r"
                >
                  Define el orden de evaluación cuando varios conceptos concurren en la misma
                  liquidación — menor número se calcula antes.
                </p>
              </div>
            </section>

            <!-- A quién aplica (antes la pestaña "Alcance") -->
            <section class="rounded-lg border border-neutral-200 dark:border-neutral-800">
              <header class="px-4 py-2.5 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/40">
                <h3 class="text-xs font-semibold uppercase tracking-wider text-neutral-500">A quién aplica</h3>
              </header>
              <div class="p-4 space-y-3">
                <div class="max-w-sm space-y-1.5">
                  <span class="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Alcance</span>
                  <div class="grid grid-flow-col auto-cols-fr gap-0.5 p-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800">
                    <button
                      v-for="opcion in [
                        { v: 'todos', t: 'Todos los inmuebles' },
                        { v: 'calculado', t: 'Con condiciones' },
                      ]"
                      :key="opcion.v"
                      type="button"
                      :disabled="soloLectura"
                      :aria-pressed="alcance === opcion.v"
                      class="px-3 py-1.5 text-sm rounded transition-colors disabled:opacity-50"
                      :class="
                        alcance === opcion.v
                          ? 'bg-white dark:bg-neutral-900 font-medium shadow-sm'
                          : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                      "
                      @click="alcance = opcion.v as 'todos' | 'calculado'"
                    >
                      {{ opcion.t }}
                    </button>
                  </div>
                </div>

                <ConceptosCondicionBuilder
                  v-if="alcance === 'calculado' && alcanceCondiciones"
                  v-model="alcanceCondiciones"
                  :readonly="soloLectura"
                />
                <p v-if="alcance === 'calculado'" class="text-xs text-neutral-500">
                  En modo <code>distribución</code>, el reparto se recalcula solo entre los
                  inmuebles que cumplen.
                </p>
                <UAlert v-if="errorAlcance" color="error" variant="soft" :title="errorAlcance" />
              </div>
            </section>

            <!-- Clasificación contable -->
            <section class="rounded-lg border border-neutral-200 dark:border-neutral-800">
              <header class="px-4 py-2.5 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/40">
                <h3 class="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Clasificación contable
                </h3>
              </header>
              <div class="p-4 space-y-1.5">
                <span class="flex items-center gap-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Cuenta presupuestal de ingreso
                  <button
                    type="button"
                    class="size-4 shrink-0 rounded-full border border-neutral-300 dark:border-neutral-600 text-xs leading-none text-neutral-500 hover:border-primary hover:text-primary"
                    :aria-expanded="ayudasAbiertas.has('cuenta')"
                    aria-label="Explicar cuenta presupuestal"
                    @click="alternarAyuda('cuenta')"
                  >?</button>
                </span>
                <USelect
                  v-model="presupuestoCuentaId"
                  :items="itemsCuentaPresupuestal"
                  value-key="value"
                  :disabled="soloLectura"
                  class="w-full max-w-sm"
                />
                <p
                  v-if="ayudasAbiertas.has('cuenta')"
                  class="text-xs text-neutral-600 dark:text-neutral-300 border-l-2 border-neutral-200 dark:border-neutral-700 pl-3 py-2 bg-neutral-50 dark:bg-neutral-900/40 rounded-r"
                >
                  Bajo qué cuenta de ingreso del presupuesto se clasifica lo que cobra este
                  concepto — su ejecutado se suma ahí automáticamente (Σ cargos facturados).
                </p>
              </div>
            </section>
          </div>

          <!-- Resumen en vivo: la pieza que antes no existía. El usuario tenía
               que ensamblar mentalmente "distribución + fijo + único + ago 2026"
               para saber qué acababa de configurar. -->
          <aside class="lg:sticky lg:top-4 space-y-4">
            <div class="rounded-lg border border-primary/40 overflow-hidden">
              <header class="px-4 py-2.5 border-b border-primary/40 bg-primary/5">
                <h3 class="text-xs font-semibold uppercase tracking-wider text-primary">
                  Qué hace este concepto
                </h3>
              </header>
              <p class="p-4 text-sm leading-relaxed">
                <span
                  v-for="(parte, i) in resumenConcepto"
                  :key="i"
                  :class="parte.b ? 'font-semibold text-primary' : ''"
                >{{ parte.t }}</span>
              </p>
              <p
                v-if="faltaCuentaPresupuestal"
                class="flex gap-2 px-4 py-3 text-xs leading-relaxed border-t border-neutral-200 dark:border-neutral-800 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30"
              >
                <UIcon name="i-lucide-triangle-alert" class="size-4 shrink-0 mt-px" />
                <span>
                  Sin cuenta presupuestal: lo que cobre no se verá reflejado en la ejecución del
                  presupuesto.
                </span>
              </p>
            </div>
          </aside>
        </div>
      </div>

      <!-- ── Auditoría ───────────────────────────────────────────────── -->
      <div v-else-if="tabActiva === 'auditoria'">
        <p v-if="!editandoId" class="text-sm text-neutral-500">
          El estado, el flujo de aprobación y el historial de versiones están disponibles después
          de crear el concepto.
        </p>
        <template v-else>
          <div class="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 mb-6">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-sm text-neutral-500">Estado</span>
                  <UBadge
                    :color="COLOR_ESTADO_CONCEPTO[conceptoEnEdicion?.estado ?? ''] ?? 'neutral'"
                    variant="subtle"
                  >
                    {{ ETIQUETA_ESTADO_CONCEPTO[conceptoEnEdicion?.estado ?? ''] ?? conceptoEnEdicion?.estado }}
                  </UBadge>
                </div>
                <p class="mt-1.5 text-xs text-neutral-500">
                  {{ DESCRIPCION_ESTADO_CONCEPTO[conceptoEnEdicion?.estado ?? ''] }}
                </p>
              </div>

              <!-- Toda transición pasa por confirmación: son cambios de estado
                   del flujo de aprobación —algunos irreversibles— y hasta ahora
                   se ejecutaban al primer clic, mientras que las acciones EN
                   LOTE del catálogo sí confirmaban. -->
              <div class="flex flex-wrap items-center gap-2">
                <template v-if="conceptoEnEdicion?.estado === 'borrador'">
                  <UButton size="xs" variant="soft" @click="pedirConfirmacion('revision')">
                    Enviar a revisión
                  </UButton>
                  <UButton size="xs" variant="soft" color="error" @click="pedirConfirmacion('archivar')">
                    Archivar
                  </UButton>
                </template>
                <template v-else-if="conceptoEnEdicion?.estado === 'en_revision'">
                  <UButton size="xs" variant="soft" @click="pedirConfirmacion('aprobar')">
                    Aprobar
                  </UButton>
                  <UButton size="xs" variant="soft" color="error" @click="pedirConfirmacion('rechazar')">
                    Rechazar
                  </UButton>
                </template>
                <template v-else-if="conceptoEnEdicion?.estado === 'activo'">
                  <UButton size="xs" variant="soft" @click="pedirConfirmacion('borrador')">
                    Volver a borrador
                  </UButton>
                  <UButton size="xs" variant="soft" color="error" @click="pedirConfirmacion('archivar')">
                    Archivar
                  </UButton>
                </template>
              </div>
            </div>
          </div>

          <UModal
            :open="transicionPendiente !== null"
            :title="detalleTransicion?.titulo"
            @update:open="(abierto) => { if (!abierto) transicionPendiente = null }"
          >
            <template #body>
              <div class="space-y-3 text-sm">
                <p>{{ detalleTransicion?.cuerpo }}</p>
                <!-- El motivo era un UInput suelto de 160 px, sin etiqueta ni
                     validación visible, junto al botón que lo consumía. -->
                <UFormField
                  v-if="transicionPendiente === 'rechazar'"
                  label="Motivo del rechazo"
                  name="motivo_rechazo"
                  help="Lo verá quien redactó el concepto."
                  :error="errorMotivoRechazo"
                >
                  <UInput v-model="motivoRechazo" class="w-full" placeholder="Qué hay que corregir" />
                </UFormField>
              </div>
            </template>
            <template #footer>
              <div class="flex justify-end gap-2">
                <UButton variant="ghost" @click="transicionPendiente = null">Cancelar</UButton>
                <UButton
                  :color="detalleTransicion?.destructiva ? 'error' : 'primary'"
                  :loading="cambiandoEstado"
                  @click="confirmarTransicion"
                >
                  {{ detalleTransicion?.accion }}
                </UButton>
              </div>
            </template>
          </UModal>

          <h2 class="text-lg font-semibold mb-2">Historial de versiones</h2>
          <p v-if="conceptoStore.versiones.length === 0" class="text-neutral-500 text-sm">
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
              <template #celda-fecha="{ fila }"><span class="text-neutral-500">{{ new Date(fila.created_at).toLocaleString() }}</span></template>
              <template #celda-estado="{ fila }"><span class="text-neutral-500">{{ ETIQUETA_ESTADO_CONCEPTO[fila.estado_concepto] ?? fila.estado_concepto }}</span></template>
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
                <p class="text-xs text-neutral-500">
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
              <div v-else-if="diffBloques" class="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div class="rounded-lg border border-neutral-200 bg-neutral-50/50 p-3 dark:border-neutral-800 dark:bg-neutral-900/20">
                  <p class="mb-2 text-xs font-medium uppercase text-neutral-400">Original</p>
                  <AelBlockInstruccionDiff :instrucciones="diffBloques.original" :catalogo="catalogoBloques" />
                </div>
                <div class="rounded-lg border border-neutral-200 bg-neutral-50/50 p-3 dark:border-neutral-800 dark:bg-neutral-900/20">
                  <p class="mb-2 text-xs font-medium uppercase text-neutral-400">Nueva</p>
                  <AelBlockInstruccionDiff :instrucciones="diffBloques.nueva" :catalogo="catalogoBloques" />
                </div>
              </div>
              <p v-else class="text-xs text-neutral-400 italic">
                Alguna de las dos versiones tiene errores de sintaxis — corrígelo en modo texto
                para ver el diff como bloques.
              </p>
            </div>
            <p v-else class="text-xs text-neutral-500">Elige una versión A y una B para ver el diff.</p>
          </template>
        </template>
      </div>
    </template>
  </div>
</template>
