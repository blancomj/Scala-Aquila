/**
 * FinancialOperationService — Docs/19 §95: "Todas las operaciones deben
 * delegarse en FinancialOperationService". Este módulo, junto con
 * decimal.ts y money.ts, es el ÚNICO lugar del paquete que instancia
 * decimal.js directamente. `allocation.ts` y todo lo que esté por encima
 * de esta capa consumen exclusivamente estas funciones (Docs/19 §96 NO
 * DIRECT DECIMAL LIBRARY, vigilado por eslint.config.js).
 */
import { Decimal, type DecimalValue } from './decimal.js'
import { money, type Money } from './money.js'
import { CurrencyMismatchError, NonFiniteDecimalError, NonIntegerResidualError } from './errors.js'

export type { DecimalValue } from './decimal.js'
export type { Decimal } from './decimal.js'

/** Docs/16 §44 ROUNDING: modos soportados. */
export type ModoRedondeo = 'HALF_UP' | 'HALF_EVEN' | 'DOWN' | 'UP'

/** Docs/16 §44-45: política explícita de modo + ubicación (escala aquí). */
export interface RoundingPolicy {
  readonly modo: ModoRedondeo
  readonly escala: number
}

const MODOS_DECIMAL = {
  HALF_UP: Decimal.ROUND_HALF_UP,
  HALF_EVEN: Decimal.ROUND_HALF_EVEN,
  DOWN: Decimal.ROUND_DOWN,
  UP: Decimal.ROUND_UP,
} as const satisfies Record<ModoRedondeo, unknown>

function verificarMonedaIgual(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new CurrencyMismatchError(a.currency, b.currency)
  }
}

// ───────────────────────── Operaciones sobre Money ─────────────────────

export function sumar(a: Money, b: Money): Money {
  verificarMonedaIgual(a, b)
  return money(a.amount.plus(b.amount), a.currency)
}

export function restar(a: Money, b: Money): Money {
  verificarMonedaIgual(a, b)
  return money(a.amount.minus(b.amount), a.currency)
}

export function multiplicar(dinero: Money, factor: DecimalValue): Money {
  return money(dinero.amount.times(factor), dinero.currency)
}

export function dividir(dinero: Money, divisor: DecimalValue): Money {
  return money(dinero.amount.dividedBy(divisor), dinero.currency)
}

export function redondear(dinero: Money, policy: RoundingPolicy): Money {
  const redondeado = dinero.amount.toDecimalPlaces(policy.escala, MODOS_DECIMAL[policy.modo])
  return money(redondeado, dinero.currency)
}

/** Negativo / cero / positivo, en ese orden. Sin moneda de por medio. */
export function comparar(a: Money, b: Money): number {
  verificarMonedaIgual(a, b)
  return a.amount.comparedTo(b.amount)
}

/** Docs/19 §94 NO EPSILON: igualdad decimal exacta, nunca `abs(a-b) < ε`. */
export function esIgual(a: Money, b: Money): boolean {
  verificarMonedaIgual(a, b)
  return a.amount.equals(b.amount)
}

/** `10^-escala` en la moneda dada: 1 para COP (escala 0), 0.01 para escala 2. */
export function unidadMinima(escala: number, currency: string): Money {
  return money(new Decimal(10).pow(-escala), currency)
}

/**
 * Convierte un residual Money a un conteo entero de unidades mínimas.
 * Docs/19 §25 RESIDUAL UNIT: el residual se distribuye en unidades de la
 * mínima denominación monetaria. Frontera controlada Decimal→number: el
 * conteo de unidades residuales es, por construcción del método de mayor
 * resto (PLAN §6.2), siempre un entero pequeño y acotado.
 */
export function contarUnidadesResiduales(residual: Money, escala: number): number {
  const unidades = residual.amount.times(new Decimal(10).pow(escala))
  if (!unidades.isInteger()) {
    throw new NonIntegerResidualError(residual.amount.toString(), escala)
  }
  return unidades.toNumber()
}

// ────────────────── Operaciones sobre Decimal puro (coeficientes) ──────
// Docs/16 §43 RATE: un coeficiente/tasa no es Money — no tiene moneda.
// Viven aquí, no en allocation.ts, porque construir un Decimal desde un
// DecimalValue crudo (string|number) es precisamente lo que 19 §96 prohíbe
// hacer fuera de este módulo.

export function sumarDecimales(valores: readonly DecimalValue[]): Decimal {
  return valores.reduce<Decimal>((acc, v) => acc.plus(v), new Decimal(0))
}

export function restarDecimales(a: DecimalValue, b: DecimalValue): Decimal {
  return new Decimal(a).minus(b)
}

export function multiplicarDecimales(a: DecimalValue, b: DecimalValue): Decimal {
  return new Decimal(a).times(b)
}

/**
 * A diferencia de `dividir()` (Money), este resultado no pasa por `money()`
 * — nada valida aquí que sea finito. decimal.js no lanza en división por
 * cero (produce Infinity), así que lo comprobamos explícitamente: 0AEL §20
 * "detect → report → block", nunca propagar un NUMBER no finito en silencio.
 */
export function dividirDecimales(a: DecimalValue, b: DecimalValue): Decimal {
  const resultado = new Decimal(a).dividedBy(b)
  if (!resultado.isFinite()) {
    throw new NonFiniteDecimalError(`${String(a)} / ${String(b)}`)
  }
  return resultado
}

export function compararDecimales(a: DecimalValue, b: DecimalValue): number {
  return new Decimal(a).comparedTo(b)
}

export function negarDecimal(a: DecimalValue): Decimal {
  return new Decimal(a).negated()
}

/**
 * Único punto autorizado para parsear un lexema NUMBER crudo a Decimal
 * (19 §19 NO PARSEFLOAT). Lo necesita ael-runtime para materializar un
 * `NumeroLiteral` — no existe otro paquete que deba construir un Decimal
 * "pelado" desde texto.
 */
export function crearDecimal(valor: DecimalValue): Decimal {
  return new Decimal(valor)
}

export function esNegativoDecimal(valor: DecimalValue): boolean {
  return new Decimal(valor).isNegative()
}

export function esCeroDecimal(valor: DecimalValue): boolean {
  return new Decimal(valor).isZero()
}
