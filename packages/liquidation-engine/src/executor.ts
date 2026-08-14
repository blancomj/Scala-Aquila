/**
 * Ejecuta el plan de cálculo — Docs/17 §158-166 (CALCULATION ORDER, BASE
 * CALCULATION, CONCEPT EVALUATION), PLAN §6.5 (doble reparto anual→periodo→
 * inmueble, ambos pasos con el mismo motor de allocation).
 */
import { analizar, parsear } from '@aquila/ael-language'
import { dinero, evaluar, type TypedValue } from '@aquila/ael-runtime'
import { allocate, type Money, type RoundingPolicy } from '@aquila/financial-kernel'
import { crearContexto, catalogoDesde } from './context.js'
import {
  ConceptoNoAnalizaLimpioError,
  EvaluacionConceptoFallidaError,
  ReconciliacionLiquidacionFallidaError,
} from './errors.js'
import { clavePeriodo, type DataSnapshot, type SnapshotConcepto } from './snapshot.js'

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

function ejecutarDirecto(
  concepto: SnapshotConcepto,
  snapshot: DataSnapshot,
  resultadosPrevios: ReadonlyMap<string, TypedValue>,
): ResultadoConcepto {
  const lineas = snapshot.inmuebles.map((inmueble): LineaLiquidacion => {
    const valor = evaluarConcepto(concepto, snapshot, resultadosPrevios, inmueble.id)
    return { inmuebleId: inmueble.id, conceptoCodigo: concepto.codigo, monto: dinero(valor).valor }
  })
  return { conceptoCodigo: concepto.codigo, valorAgregado: null, cuotaPeriodo: null, lineas }
}

/** PLAN §6.5: Paso 1 (anual → 12 periodos) + Paso 2 (cuota del periodo → inmuebles). */
function ejecutarDistribucion(
  concepto: SnapshotConcepto,
  snapshot: DataSnapshot,
  resultadosPrevios: ReadonlyMap<string, TypedValue>,
): ResultadoConcepto {
  const valorAgregado = evaluarConcepto(concepto, snapshot, resultadosPrevios, null)
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

  const paso2 = allocate({
    basisType: 'coefficient',
    sourceAmount: cuotaPeriodo,
    targets: snapshot.inmuebles.map((i) => ({ id: i.codigo, basis: i.coeficiente })),
    policy,
  })

  const lineas = paso2.entries.map((entrada): LineaLiquidacion => {
    const inmueble = snapshot.inmuebles.find((i) => i.codigo === entrada.targetId)
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
