/**
 * Ejecuta el plan de cálculo — Docs/17 §158-166 (CALCULATION ORDER, BASE
 * CALCULATION, CONCEPT EVALUATION), PLAN §6.5 (doble reparto anual→periodo→
 * inmueble, ambos pasos con el mismo motor de allocation).
 */
import { analizar, parsear } from '@aquila/ael-language'
import { dinero, evaluar, type TypedValue } from '@aquila/ael-runtime'
import {
  allocate,
  money,
  multiplicar,
  multiplicarDecimales,
  type Money,
  type RoundingPolicy,
} from '@aquila/financial-kernel'
import { inmuebleCumpleCondiciones } from './alcance.js'
import { crearContexto, catalogoDesde } from './context.js'
import {
  ConceptoFijoSinValorError,
  ConceptoNoAnalizaLimpioError,
  EvaluacionConceptoFallidaError,
  ReconciliacionLiquidacionFallidaError,
} from './errors.js'
import { clavePeriodo, type DataSnapshot, type SnapshotConcepto, type SnapshotInmueble } from './snapshot.js'

export interface LineaLiquidacion {
  readonly inmuebleId: string
  readonly conceptoCodigo: string
  readonly monto: Money
}

export interface ResultadoConcepto {
  readonly conceptoCodigo: string
  /** Lo que evaluó la fórmula: el total agregado si `distribucion`, o `null` si `directo`
   * (un concepto directo no tiene un único valor agregado — cada inmueble tiene el suyo). */
  readonly valorAgregado: TypedValue | null
  /** Monto de este periodo tras el Paso 1 (solo `distribucion`, PLAN §6.5). */
  readonly cuotaPeriodo: Money | null
  readonly lineas: readonly LineaLiquidacion[]
}

function politicaDesde(snapshot: DataSnapshot): RoundingPolicy {
  return { modo: snapshot.politica.redondeoModo, escala: snapshot.politica.redondeoEscala }
}

/** Docs/06 §428: parsear → analizar → evaluar. Nunca se evalúa una fórmula que no analiza limpio. */
function evaluarConcepto(
  concepto: SnapshotConcepto,
  snapshot: DataSnapshot,
  resultadosPrevios: ReadonlyMap<string, TypedValue>,
  inmuebleId: string | null,
): TypedValue {
  const { regla, diagnosticos: diagnosticosParser } = parsear(concepto.formulaAel, concepto.codigo)
  if (regla === null) {
    throw new ConceptoNoAnalizaLimpioError(concepto.codigo, diagnosticosParser)
  }

  const { diagnosticos: diagnosticosAnalyzer } = analizar(
    regla,
    catalogoDesde(snapshot),
    concepto.codigo,
  )
  if (diagnosticosAnalyzer.length > 0) {
    throw new ConceptoNoAnalizaLimpioError(concepto.codigo, diagnosticosAnalyzer)
  }

  const contexto = crearContexto(snapshot, resultadosPrevios, inmuebleId)
  const { resultado, diagnosticos } = evaluar(regla, contexto, concepto.codigo)
  if (resultado === null || diagnosticos.length > 0) {
    throw new EvaluacionConceptoFallidaError(concepto.codigo, diagnosticos)
  }

  return resultado
}

/** modo_valor='fijo': el monto es un dato directo, sin parsear/analizar/evaluar
 * ninguna fórmula (no tiene una que evaluar — formulaAel es ''). */
function valorFijoComoTypedValue(concepto: SnapshotConcepto, snapshot: DataSnapshot): TypedValue {
  if (concepto.valorFijo === null) {
    throw new ConceptoFijoSinValorError(concepto.codigo)
  }
  return { tipo: 'MONEY', valor: money(concepto.valorFijo, snapshot.moneda) }
}

function valorDeConcepto(
  concepto: SnapshotConcepto,
  snapshot: DataSnapshot,
  resultadosPrevios: ReadonlyMap<string, TypedValue>,
  inmuebleId: string | null,
): TypedValue {
  return concepto.modoValor === 'fijo'
    ? valorFijoComoTypedValue(concepto, snapshot)
    : evaluarConcepto(concepto, snapshot, resultadosPrevios, inmuebleId)
}

/** Fase 5 (alcance.ts): alcance='todos' preserva el comportamiento anterior
 * a esta fase exactamente (todo snapshot.inmuebles, sin filtrar). Con
 * 'calculado', solo pasan los que cumplen alcanceCondiciones — decisión del
 * usuario (2026-08-20): en distribución, el reparto se recalcula SOLO
 * sobre ese subconjunto, no sobre el edificio completo. */
function inmueblesQueAplican(
  concepto: SnapshotConcepto,
  snapshot: DataSnapshot,
): readonly SnapshotInmueble[] {
  const { alcanceCondiciones } = concepto
  if (concepto.alcance === 'todos' || alcanceCondiciones === null) {
    return snapshot.inmuebles
  }
  const contexto = { mesActual: snapshot.periodo.mes, anioActual: snapshot.periodo.anio }
  return snapshot.inmuebles.filter((inmueble) =>
    inmuebleCumpleCondiciones(
      alcanceCondiciones,
      inmueble.atributos,
      contexto,
      inmueble.coeficiente,
    ),
  )
}

function ejecutarDirecto(
  concepto: SnapshotConcepto,
  snapshot: DataSnapshot,
  resultadosPrevios: ReadonlyMap<string, TypedValue>,
): ResultadoConcepto {
  const lineas = inmueblesQueAplican(concepto, snapshot).map((inmueble): LineaLiquidacion => {
    const valor = valorDeConcepto(concepto, snapshot, resultadosPrevios, inmueble.id)
    // H2 (auditoría externa 2026-08-26): sin total compartido que reconciliar
    // aquí (cada inmueble calcula el suyo de forma independiente) — se
    // multiplica directo, sin redondear todavía (redondeo único al final,
    // igual que el resto del kernel).
    const monto = multiplicar(dinero(valor).valor, inmueble.fraccionActiva)
    return { inmuebleId: inmueble.id, conceptoCodigo: concepto.codigo, monto }
  })
  return { conceptoCodigo: concepto.codigo, valorAgregado: null, cuotaPeriodo: null, lineas }
}

/** PLAN §6.5: Paso 1 (anual → 12 periodos) + Paso 2 (cuota del periodo → inmuebles).
 * Un concepto fijo en modo distribución sigue repartiendo su único valor (el
 * monto fijo, mismo valor sin importar el inmueble) por el mismo camino que uno
 * formulado — el modo de valor no cambia cómo se reparte, solo de dónde sale. */
function ejecutarDistribucion(
  concepto: SnapshotConcepto,
  snapshot: DataSnapshot,
  resultadosPrevios: ReadonlyMap<string, TypedValue>,
): ResultadoConcepto {
  const valorAgregado = valorDeConcepto(concepto, snapshot, resultadosPrevios, null)
  const totalAnual = dinero(valorAgregado).valor
  const policy = politicaDesde(snapshot)

  const paso1 = allocate({
    basisType: 'equalShare',
    sourceAmount: totalAnual,
    targets: snapshot.periodosDelAnio.map((p) => ({ id: clavePeriodo(p) })),
    policy,
  })

  const claveActual = clavePeriodo(snapshot.periodo)
  const entradaPeriodo = paso1.entries.find((e) => e.targetId === claveActual)
  if (!entradaPeriodo) {
    throw new ReconciliacionLiquidacionFallidaError(
      'R7',
      `el periodo "${claveActual}" no recibió cuota en el reparto anual del concepto ${concepto.codigo}`,
    )
  }
  const cuotaPeriodo = entradaPeriodo.allocatedAmount

  // alcance='calculado' con cero inmuebles que cumplan: 0 líneas, no error —
  // mismo criterio que ejecutarDirecto sobre un snapshot sin inmuebles.
  // allocate() exige targets.length > 0 (EmptyTargetsError), así que este
  // caso se salta el paso2 en vez de llamarlo.
  const inmueblesAplican = inmueblesQueAplican(concepto, snapshot)
  if (inmueblesAplican.length === 0) {
    return { conceptoCodigo: concepto.codigo, valorAgregado, cuotaPeriodo, lineas: [] }
  }

  // H2 (auditoría externa 2026-08-26): coeficiente efectivo = coeficiente ×
  // fracción de días activos — allocate() sigue repartiendo exactamente
  // cuotaPeriodo (Σ=fuente intacta), así que lo que un inmueble prorrateado
  // deja de pagar lo absorben los demás según su propio coeficiente, no
  // queda déficit de recaudo (decisión del usuario, 2026-08-26).
  const paso2 = allocate({
    basisType: 'coefficient',
    sourceAmount: cuotaPeriodo,
    targets: inmueblesAplican.map((i) => ({
      id: i.codigo,
      basis: multiplicarDecimales(i.coeficiente, i.fraccionActiva),
    })),
    policy,
  })

  const lineas = paso2.entries.map((entrada): LineaLiquidacion => {
    const inmueble = inmueblesAplican.find((i) => i.codigo === entrada.targetId)
    if (!inmueble) {
      throw new ReconciliacionLiquidacionFallidaError(
        'R1',
        `allocate() devolvió un targetId ("${entrada.targetId}") que no corresponde a ningún inmueble del snapshot`,
      )
    }
    return {
      inmuebleId: inmueble.id,
      conceptoCodigo: concepto.codigo,
      monto: entrada.allocatedAmount,
    }
  })

  return { conceptoCodigo: concepto.codigo, valorAgregado, cuotaPeriodo, lineas }
}

/** Docs/17 §158 CALCULATION ORDER: recorre el plan en el orden ya topológico. */
export function ejecutarPlan(
  snapshot: DataSnapshot,
  plan: readonly SnapshotConcepto[],
): readonly ResultadoConcepto[] {
  const resultadosPrevios = new Map<string, TypedValue>()
  const resultados: ResultadoConcepto[] = []

  for (const concepto of plan) {
    const resultado =
      concepto.modoCalculo === 'directo'
        ? ejecutarDirecto(concepto, snapshot, resultadosPrevios)
        : ejecutarDistribucion(concepto, snapshot, resultadosPrevios)

    if (resultado.valorAgregado !== null) {
      resultadosPrevios.set(concepto.codigo, resultado.valorAgregado)
    }
    resultados.push(resultado)
  }

  return resultados
}
