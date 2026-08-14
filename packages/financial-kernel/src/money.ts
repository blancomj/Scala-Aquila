/**
 * Money — Docs/16 §37-39: amount + currency, precisión decimal explícita,
 * nunca coincidencia de punto flotante.
 *
 * Este módulo solo construye y lee Money. Las OPERACIONES (suma, resta,
 * redondeo…) viven en financial-operation-service.ts (Docs/19 §95) —
 * es la separación entre "dato" y "operación sobre el dato".
 */
import { Decimal, type DecimalValue } from './decimal.js'
import { InvalidCurrencyError, InvalidMoneyAmountError } from './errors.js'

/** ISO 4217, 3 letras mayúsculas. Docs/16 §40: la moneda debe ser explícita. */
const PATRON_MONEDA = /^[A-Z]{3}$/

export interface Money {
  readonly amount: Decimal
  readonly currency: string
}

export function money(amount: DecimalValue, currency: string): Money {
  if (!PATRON_MONEDA.test(currency)) {
    throw new InvalidCurrencyError(
      `Moneda inválida: "${currency}". Se espera código ISO 4217 de 3 letras mayúsculas (16 §40).`,
    )
  }

  let valor: Decimal
  try {
    valor = new Decimal(amount)
  } catch {
    throw new InvalidMoneyAmountError(`Monto de dinero inválido: ${String(amount)}`)
  }
  if (!valor.isFinite()) {
    throw new InvalidMoneyAmountError(`El monto de dinero debe ser finito: ${String(amount)}`)
  }

  return Object.freeze({ amount: valor, currency })
}

export function isZeroMoney(m: Money): boolean {
  return m.amount.isZero()
}

export function isNegativeMoney(m: Money): boolean {
  return m.amount.isNegative()
}
