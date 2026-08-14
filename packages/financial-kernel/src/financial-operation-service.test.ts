import { describe, expect, it } from 'vitest'
import { CurrencyMismatchError, NonFiniteDecimalError, NonIntegerResidualError } from './errors.js'
import * as fos from './financial-operation-service.js'
import { money } from './money.js'

describe('operaciones sobre Money', () => {
  it('sumar / restar respetan la moneda', () => {
    expect(fos.sumar(money(100, 'COP'), money(50, 'COP')).amount.toString()).toBe('150')
    expect(fos.restar(money(100, 'COP'), money(30, 'COP')).amount.toString()).toBe('70')
  })

  it('sumar / restar / comparar / esIgual rechazan monedas distintas', () => {
    expect(() => fos.sumar(money(1, 'COP'), money(1, 'USD'))).toThrow(CurrencyMismatchError)
    expect(() => fos.restar(money(1, 'COP'), money(1, 'USD'))).toThrow(CurrencyMismatchError)
    expect(() => fos.comparar(money(1, 'COP'), money(1, 'USD'))).toThrow(CurrencyMismatchError)
    expect(() => fos.esIgual(money(1, 'COP'), money(1, 'USD'))).toThrow(CurrencyMismatchError)
  })

  it('multiplicar / dividir por un factor escalar', () => {
    // 01 §16: Money × Number → Money
    expect(fos.multiplicar(money(100, 'COP'), 4500).amount.toString()).toBe('450000')
    expect(fos.dividir(money(100, 'COP'), 4).amount.toString()).toBe('25')
  })

  it('comparar: negativo, cero, positivo', () => {
    expect(fos.comparar(money(1, 'COP'), money(2, 'COP'))).toBeLessThan(0)
    expect(fos.comparar(money(2, 'COP'), money(2, 'COP'))).toBe(0)
    expect(fos.comparar(money(3, 'COP'), money(2, 'COP'))).toBeGreaterThan(0)
  })

  it('esIgual: igualdad decimal exacta, sin epsilon (19 §94)', () => {
    expect(fos.esIgual(money('100.0000000001', 'COP'), money('100', 'COP'))).toBe(false)
    expect(fos.esIgual(money('100', 'COP'), money('100', 'COP'))).toBe(true)
  })
})

describe('redondear (16 §44-45)', () => {
  it('HALF_UP a 0 decimales', () => {
    expect(
      fos.redondear(money('1250000.5', 'COP'), { modo: 'HALF_UP', escala: 0 }).amount.toString(),
    ).toBe('1250001')
  })

  it('DOWN (floor) — usado internamente por el método de mayor resto', () => {
    expect(
      fos.redondear(money('1250000.99', 'COP'), { modo: 'DOWN', escala: 0 }).amount.toString(),
    ).toBe('1250000')
  })

  it('UP', () => {
    expect(
      fos.redondear(money('1250000.01', 'COP'), { modo: 'UP', escala: 0 }).amount.toString(),
    ).toBe('1250001')
  })

  it("HALF_EVEN (banker's rounding) en el punto medio", () => {
    expect(
      fos.redondear(money('2.5', 'COP'), { modo: 'HALF_EVEN', escala: 0 }).amount.toString(),
    ).toBe('2')
    expect(
      fos.redondear(money('3.5', 'COP'), { modo: 'HALF_EVEN', escala: 0 }).amount.toString(),
    ).toBe('4')
  })

  it('respeta la escala (COP=0, otra moneda con decimales)', () => {
    expect(
      fos.redondear(money('10.567', 'COP'), { modo: 'HALF_UP', escala: 2 }).amount.toString(),
    ).toBe('10.57')
  })
})

describe('unidadMinima (19 §25)', () => {
  it('escala 0 → 1 unidad', () => {
    expect(fos.unidadMinima(0, 'COP').amount.toString()).toBe('1')
  })

  it('escala 2 → 0.01', () => {
    expect(fos.unidadMinima(2, 'USD').amount.toString()).toBe('0.01')
  })
})

describe('contarUnidadesResiduales', () => {
  it('convierte un residual exacto a conteo entero', () => {
    expect(fos.contarUnidadesResiduales(money(2, 'COP'), 0)).toBe(2)
    expect(fos.contarUnidadesResiduales(money('0.02', 'USD'), 2)).toBe(2)
  })

  it('rechaza un residual que no es múltiplo entero de la unidad mínima', () => {
    expect(() => fos.contarUnidadesResiduales(money('0.5', 'COP'), 0)).toThrow(
      NonIntegerResidualError,
    )
  })
})

describe('operaciones sobre Decimal puro (coeficientes, 16 §43)', () => {
  it('sumarDecimales suma exactamente', () => {
    expect(
      fos.sumarDecimales(['0.15', '0.15', '0.165', '0.165', '0.185', '0.185']).toString(),
    ).toBe('1')
    expect(fos.sumarDecimales([]).toString()).toBe('0')
  })

  it('esNegativoDecimal / esCeroDecimal', () => {
    expect(fos.esNegativoDecimal(-1)).toBe(true)
    expect(fos.esNegativoDecimal(1)).toBe(false)
    expect(fos.esCeroDecimal(0)).toBe(true)
    expect(fos.esCeroDecimal(0.0001)).toBe(false)
  })

  it('restarDecimales / multiplicarDecimales / dividirDecimales / compararDecimales', () => {
    expect(fos.restarDecimales(10, 3).toString()).toBe('7')
    expect(fos.multiplicarDecimales('2.5', 4).toString()).toBe('10')
    expect(fos.dividirDecimales(10, 4).toString()).toBe('2.5')
    expect(fos.compararDecimales(1, 2)).toBeLessThan(0)
    expect(fos.compararDecimales(2, 2)).toBe(0)
    expect(fos.compararDecimales(3, 2)).toBeGreaterThan(0)
  })

  it('dividirDecimales rechaza un resultado no finito (división por cero, 0AEL §20)', () => {
    expect(() => fos.dividirDecimales(1, 0)).toThrow(NonFiniteDecimalError)
  })

  it('negarDecimal', () => {
    expect(fos.negarDecimal(5).toString()).toBe('-5')
    expect(fos.negarDecimal(-5).toString()).toBe('5')
  })

  it('crearDecimal parsea un lexema crudo sin parseFloat (19 §19)', () => {
    expect(fos.crearDecimal('100.50').toString()).toBe('100.5')
  })
})
