import { money } from '@aquila/financial-kernel'
import { describe, expect, it } from 'vitest'
import { InvarianteEvaluadorError } from './errors.js'
import { booleano, dinero, numero } from './typed-value.js'

describe('guardas de estrechamiento de TypedValue', () => {
  it('numero() acepta NUMBER y rechaza el resto', () => {
    const v = numero({ tipo: 'NUMBER', valor: money(1, 'COP').amount })
    expect(v.tipo).toBe('NUMBER')
    expect(() => numero({ tipo: 'BOOLEAN', valor: true })).toThrow(InvarianteEvaluadorError)
  })

  it('dinero() acepta MONEY y rechaza el resto', () => {
    const v = dinero({ tipo: 'MONEY', valor: money(1, 'COP') })
    expect(v.tipo).toBe('MONEY')
    expect(() => dinero({ tipo: 'NULO' })).toThrow(InvarianteEvaluadorError)
  })

  it('booleano() acepta BOOLEAN y rechaza el resto', () => {
    const v = booleano({ tipo: 'BOOLEAN', valor: false })
    expect(v.tipo).toBe('BOOLEAN')
    expect(() => booleano({ tipo: 'NULO' })).toThrow(InvarianteEvaluadorError)
  })
})
