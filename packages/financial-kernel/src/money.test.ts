import { describe, expect, it } from 'vitest'
import { InvalidCurrencyError, InvalidMoneyAmountError } from './errors.js'
import { isNegativeMoney, isZeroMoney, money } from './money.js'

describe('money()', () => {
  it('construye Money válido a partir de string, number o Decimal', () => {
    expect(money('100.50', 'COP').amount.toString()).toBe('100.5')
    expect(money(100, 'COP').amount.toString()).toBe('100')
  })

  it('rechaza moneda que no sea ISO 4217 de 3 letras mayúsculas', () => {
    expect(() => money(100, 'cop')).toThrow(InvalidCurrencyError)
    expect(() => money(100, 'COPX')).toThrow(InvalidCurrencyError)
    expect(() => money(100, '')).toThrow(InvalidCurrencyError)
  })

  it('rechaza un monto no numérico', () => {
    expect(() => money('no-es-un-numero', 'COP')).toThrow(InvalidMoneyAmountError)
  })

  it('rechaza un monto infinito', () => {
    expect(() => money(Infinity, 'COP')).toThrow(InvalidMoneyAmountError)
  })

  it('el resultado queda congelado (inmutable)', () => {
    expect(Object.isFrozen(money(1, 'COP'))).toBe(true)
  })
})

describe('isZeroMoney / isNegativeMoney', () => {
  it('identifica cero', () => {
    expect(isZeroMoney(money(0, 'COP'))).toBe(true)
    expect(isZeroMoney(money(1, 'COP'))).toBe(false)
  })

  it('identifica negativo', () => {
    expect(isNegativeMoney(money(-1, 'COP'))).toBe(true)
    expect(isNegativeMoney(money(1, 'COP'))).toBe(false)
    expect(isNegativeMoney(money(0, 'COP'))).toBe(false)
  })
})
