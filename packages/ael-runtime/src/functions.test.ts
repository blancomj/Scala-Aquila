import { crearDecimal, money } from '@aquila/financial-kernel'
import { describe, expect, it } from 'vitest'
import { InvarianteEvaluadorError } from './errors.js'
import { FUNCIONES } from './functions.js'
import type { TypedValue } from './typed-value.js'

function n(valor: string | number): TypedValue {
  return { tipo: 'NUMBER', valor: crearDecimal(valor) }
}
function m(valor: string | number, moneda = 'COP'): TypedValue {
  return { tipo: 'MONEY', valor: money(valor, moneda) }
}

describe('FUNCIONES.MIN / MAX (01 §21)', () => {
  it('MIN devuelve el menor', () => {
    const r = FUNCIONES.MIN?.([n(5), n(2)], 'HALF_UP')
    expect(r).toMatchObject({ tipo: 'NUMBER' })
    if (r?.tipo !== 'NUMBER') throw new Error()
    expect(r.valor.toString()).toBe('2')
  })

  it('MAX devuelve el mayor', () => {
    const r = FUNCIONES.MAX?.([n(5), n(2)], 'HALF_UP')
    if (r?.tipo !== 'NUMBER') throw new Error()
    expect(r.valor.toString()).toBe('5')
  })

  it('MIN/MAX con argumentos iguales', () => {
    const r = FUNCIONES.MIN?.([n(3), n(3)], 'HALF_UP')
    if (r?.tipo !== 'NUMBER') throw new Error()
    expect(r.valor.toString()).toBe('3')
  })
})

describe('FUNCIONES.PORCENTAJE (02 §"PORCENTAJE(total, 10) -> MONEY")', () => {
  it('10% de 100 COP es 10 COP', () => {
    const r = FUNCIONES.PORCENTAJE?.([m(100), n(10)], 'HALF_UP')
    if (r?.tipo !== 'MONEY') throw new Error()
    expect(r.valor.amount.toString()).toBe('10')
    expect(r.valor.currency).toBe('COP')
  })
})

describe('FUNCIONES.REDONDEAR_DINERO (07 §"FUNCTION EXAMPLE")', () => {
  it('redondea con el modo del contexto y la escala del argumento', () => {
    const half = FUNCIONES.REDONDEAR_DINERO?.([m('100.5'), n(0)], 'HALF_UP')
    if (half?.tipo !== 'MONEY') throw new Error()
    expect(half.valor.amount.toString()).toBe('101')

    const down = FUNCIONES.REDONDEAR_DINERO?.([m('100.5'), n(0)], 'DOWN')
    if (down?.tipo !== 'MONEY') throw new Error()
    expect(down.valor.amount.toString()).toBe('100')
  })

  it('respeta una escala distinta de 0', () => {
    const r = FUNCIONES.REDONDEAR_DINERO?.([m('10.567', 'USD'), n(2)], 'HALF_UP')
    if (r?.tipo !== 'MONEY') throw new Error()
    expect(r.valor.amount.toString()).toBe('10.57')
  })
})

describe('argumentos faltantes (aridad debió validarse en el Analyzer)', () => {
  it('MIN sin argumentos lanza InvarianteEvaluadorError', () => {
    expect(() => FUNCIONES.MIN?.([], 'HALF_UP')).toThrow(InvarianteEvaluadorError)
  })

  it('MIN con un solo argumento lanza InvarianteEvaluadorError', () => {
    expect(() => FUNCIONES.MIN?.([n(1)], 'HALF_UP')).toThrow(InvarianteEvaluadorError)
  })
})

describe('argumentos con el tipo equivocado', () => {
  it('PORCENTAJE con MONEY,MONEY lanza InvarianteEvaluadorError', () => {
    expect(() => FUNCIONES.PORCENTAJE?.([m(100), m(10)], 'HALF_UP')).toThrow(
      InvarianteEvaluadorError,
    )
  })
})
