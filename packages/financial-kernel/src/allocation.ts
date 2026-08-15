/**
 * Motor de distribución (allocation) — Docs/19, con residual por mayor
 * resto (PLAN_MAESTRO §6.2, Docs/19 §23-31).
 *
 * Este archivo NUNCA importa decimal.ts ni decimal.js directamente
 * (Docs/19 §96 NO DIRECT DECIMAL LIBRARY) — vigilado por eslint.config.js.
 * Toda aritmética pasa por financial-operation-service.ts.
 */
import * as fos from './financial-operation-service.js'
import type { DecimalValue, RoundingPolicy } from './financial-operation-service.js'
import { money, type Money } from './money.js'
import {
  DuplicateTargetError,
  EmptyTargetsError,
  NegativeBasisError,
  ReconciliationFailedError,
  ZeroTotalBasisError,
} from './errors.js'

/** Docs/19 §6: subconjunto autorizado para V1 — el resto se añade cuando un concepto real lo exija. */
export type AllocationBasisType = 'coefficient' | 'equalShare'

interface AllocationTargetBase {
  readonly id: string
}

/** Docs/19 §7 COEFFICIENT: participación definida por el dominio, no necesariamente un porcentaje. */
interface AllocationTargetConCoeficiente extends AllocationTargetBase {
  readonly basis: DecimalValue
}

export type AllocationRequest =
  | {
      readonly basisType: 'coefficient'
      readonly sourceAmount: Money
      readonly targets: readonly AllocationTargetConCoeficiente[]
      readonly policy: RoundingPolicy
    }
  | {
      readonly basisType: 'equalShare'
      readonly sourceAmount: Money
      readonly targets: readonly AllocationTargetBase[]
      readonly policy: RoundingPolicy
    }

/** Docs/19 §32-35 ALLOCATION RESULT / ENTRY / EXACT AMOUNT / ALLOCATED AMOUNT. */
export interface AllocationEntry {
  readonly targetId: string
  /** Precisión interna, previa al redondeo (Docs/19 §20, §34). */
  readonly exactAmount: Money
  /** Resultado final: floor + residual distribuido (Docs/19 §22, §35). */
  readonly allocatedAmount: Money
}

export interface AllocationResult {
  readonly entries: readonly AllocationEntry[]
  /** Siempre cero tras una distribución completa; se conserva para auditoría (19 §23-26). */
  readonly residual: Money
  /** sourceAmount normalizado a policy.escala. */
  readonly sourceAmount: Money
}

/**
 * Lee una clave que el propio algoritmo garantiza haber poblado en el mismo
 * `for (const t of targets)` unas líneas antes. Un `undefined` aquí es un
 * bug del motor, no un caso de negocio — se reporta explícito en vez de
 * asumir con `!` (0AEL §23: errores typed, actionable, traceable).
 */
export function obtener<V>(mapa: ReadonlyMap<string, V>, id: string): V {
  const valor = mapa.get(id)
  if (valor === undefined) {
    throw new Error(
      `Invariante violado: no se encontró el target "${id}" — error interno del motor de asignación`,
    )
  }
  return valor
}

function validarTargetsUnicos(targets: readonly AllocationTargetBase[]): void {
  const vistos = new Set<string>()
  for (const t of targets) {
    if (vistos.has(t.id)) throw new DuplicateTargetError(t.id)
    vistos.add(t.id)
  }
}

/** exactAllocation(i) — Docs/19 §18 PROPORTIONAL FORMULA / §11 EQUAL SHARE. */
function calcularExactos(request: AllocationRequest, fuente: Money): Map<string, Money> {
  const exactos = new Map<string, Money>()

  if (request.basisType === 'equalShare') {
    const n = request.targets.length
    for (const t of request.targets) {
      exactos.set(t.id, fos.dividir(fuente, n))
    }
    return exactos
  }

  for (const t of request.targets) {
    if (fos.esNegativoDecimal(t.basis)) throw new NegativeBasisError(t.id)
  }
  const totalBasis = fos.sumarDecimales(request.targets.map((t) => t.basis))
  if (fos.esCeroDecimal(totalBasis)) throw new ZeroTotalBasisError()

  for (const t of request.targets) {
    const intermedio = fos.multiplicar(fuente, t.basis)
    exactos.set(t.id, fos.dividir(intermedio, totalBasis))
  }
  return exactos
}

/**
 * Verifica Σ allocatedAmount === sourceAmount, exacto, sin epsilon
 * (Docs/19 §92-94). Exportada para poder probar el guardia por sí solo
 * (100% cobertura sin necesitar forzar un estado inconsistente real).
 */
export function verificarSumaReconciliada(
  entries: readonly Pick<AllocationEntry, 'allocatedAmount'>[],
  fuente: Money,
): void {
  const total = entries.reduce(
    (acc, e) => fos.sumar(acc, e.allocatedAmount),
    money(0, fuente.currency),
  )
  if (!fos.esIgual(total, fuente)) {
    throw new ReconciliationFailedError(
      fuente.amount.toString(),
      total.amount.toString(),
      fos.restar(fuente, total).amount.toString(),
    )
  }
}

export function allocate(request: AllocationRequest): AllocationResult {
  const { targets, policy } = request

  if (targets.length === 0) throw new EmptyTargetsError()
  validarTargetsUnicos(targets)

  // Normaliza la fuente a la escala de la política antes de calcular: así
  // el residual siempre resulta un múltiplo entero de la unidad mínima
  // (demostración en el docstring de contarUnidadesResiduales).
  const fuente = fos.redondear(request.sourceAmount, policy)

  const exactos = calcularExactos(request, fuente)

  const bases = new Map<string, Money>()
  const remanentes = new Map<string, Money>()
  let sumaBases = money(0, fuente.currency)

  // Docs/19 §22 ROUNDING ORDER: exact → round (floor) → residual.
  const politicaFloor: RoundingPolicy = { modo: 'DOWN', escala: policy.escala }
  for (const t of targets) {
    const exacto = obtener(exactos, t.id)
    const base = fos.redondear(exacto, politicaFloor)
    bases.set(t.id, base)
    remanentes.set(t.id, fos.restar(exacto, base))
    sumaBases = fos.sumar(sumaBases, base)
  }

  const residualTotal = fos.restar(fuente, sumaBases)
  const numUnidadesResiduales = fos.contarUnidadesResiduales(residualTotal, policy.escala)

  // Docs/19 §29-30 REMAINDER ORDER / TIE BREAK: DESC por remanente, empate por id ASC.
  const ordenParaResidual = [...targets].sort((a, b) => {
    const cmp = fos.comparar(obtener(remanentes, b.id), obtener(remanentes, a.id))
    if (cmp !== 0) return cmp
    // validarTargetsUnicos ya garantizó a.id !== b.id — el empate 0 es imposible aquí.
    return a.id < b.id ? -1 : 1
  })
  const idsConResidual = new Set(ordenParaResidual.slice(0, numUnidadesResiduales).map((t) => t.id))
  const unidadMinima = fos.unidadMinima(policy.escala, fuente.currency)

  const entries: AllocationEntry[] = targets.map((t) => {
    const base = obtener(bases, t.id)
    const allocatedAmount = idsConResidual.has(t.id) ? fos.sumar(base, unidadMinima) : base
    return { targetId: t.id, exactAmount: obtener(exactos, t.id), allocatedAmount }
  })

  verificarSumaReconciliada(entries, fuente)

  return { entries, residual: money(0, fuente.currency), sourceAmount: fuente }
}
