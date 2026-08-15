/**
 * AEL-004 Fase 6 — cobertura directa de ael-test-runner.ts. Sin Supabase:
 * probarFormula()/crearContextoMock() son puros, así que se prueban con
 * fórmulas AEL de texto y catálogos estáticos, igual que
 * ael-dependencias.test.ts.
 */
import { describe, expect, it } from 'vitest'
import { catalogoContratosEstatico } from './ael-catalogo'
import {
  camposRequeridos,
  compararResultado,
  ejecutarCasoPrueba,
  materializarValorMock,
} from './ael-test-runner'

const catalogo = catalogoContratosEstatico([])
const MONEDA = 'COP'
const REDONDEO = 'HALF_UP'

describe('camposRequeridos', () => {
  it('lista los campos PARAMETER usados con su tipo estático', () => {
    const campos = camposRequeridos('REGLA X\nRETORNAR PARAMETER.PRESUPUESTO_ANUAL')
    expect(campos).toEqual([{ contrato: 'PARAMETER', campo: 'PRESUPUESTO_ANUAL', tipo: 'MONEY' }])
  })

  it('sin referencias a Contracts, lista vacía', () => {
    expect(camposRequeridos('REGLA X\nRETORNAR 1')).toEqual([])
  })
})

describe('materializarValorMock', () => {
  it('MONEY usa la moneda dada', () => {
    const valor = materializarValorMock({ tipo: 'MONEY', valor: '100' }, 'COP')
    expect(valor).toEqual({ tipo: 'MONEY', valor: { amount: expect.anything(), currency: 'COP' } })
  })

  it('NULO no necesita valor', () => {
    expect(materializarValorMock({ tipo: 'NULO' }, 'COP')).toEqual({ tipo: 'NULO' })
  })
})

describe('compararResultado', () => {
  it('MONEY: igualdad decimal exacta pasa', () => {
    const actual = materializarValorMock({ tipo: 'MONEY', valor: '542250' }, MONEDA)
    const r = compararResultado(actual, 'MONEY', { tipo: 'MONEY', valor: '542250' }, MONEDA)
    expect(r.pasa).toBe(true)
  })

  it('MONEY: 100.00 y 100 son iguales (no comparación flotante ingenua)', () => {
    const actual = materializarValorMock({ tipo: 'MONEY', valor: '100.00' }, MONEDA)
    const r = compararResultado(actual, 'MONEY', { tipo: 'MONEY', valor: '100' }, MONEDA)
    expect(r.pasa).toBe(true)
  })

  it('MONEY: valores distintos falla con mensaje claro', () => {
    const actual = materializarValorMock({ tipo: 'MONEY', valor: '1000' }, MONEDA)
    const r = compararResultado(actual, 'MONEY', { tipo: 'MONEY', valor: '542250' }, MONEDA)
    expect(r.pasa).toBe(false)
    expect(r.mensaje).toContain('542250')
    expect(r.mensaje).toContain('1000')
  })

  it('tipo incorrecto falla antes de comparar el valor', () => {
    const actual = materializarValorMock({ tipo: 'MONEY', valor: '100' }, MONEDA)
    const r = compararResultado(actual, 'NUMBER', { tipo: 'NUMBER', valor: '100' }, MONEDA)
    expect(r.pasa).toBe(false)
    expect(r.mensaje).toContain('NUMBER')
    expect(r.mensaje).toContain('MONEY')
  })
})

describe('ejecutarCasoPrueba', () => {
  it('MONEY: pasa cuando el resultado coincide exactamente', () => {
    const resultado = ejecutarCasoPrueba(
      'REGLA X\nRETORNAR PARAMETER.PRESUPUESTO_ANUAL',
      {
        entradas: [
          {
            contrato: 'PARAMETER',
            campo: 'PRESUPUESTO_ANUAL',
            valor: { tipo: 'MONEY', valor: '542250' },
          },
        ],
        tipoEsperado: 'MONEY',
        resultadoEsperado: { tipo: 'MONEY', valor: '542250' },
      },
      catalogo,
      MONEDA,
      REDONDEO,
    )
    expect(resultado.estado).toBe('passed')
  })

  it('NUMBER: pasa/falla según el literal retornado', () => {
    const pasa = ejecutarCasoPrueba(
      'REGLA X\nRETORNAR 42',
      { entradas: [], tipoEsperado: 'NUMBER', resultadoEsperado: { tipo: 'NUMBER', valor: '42' } },
      catalogo,
      MONEDA,
      REDONDEO,
    )
    expect(pasa.estado).toBe('passed')

    const falla = ejecutarCasoPrueba(
      'REGLA X\nRETORNAR 42',
      { entradas: [], tipoEsperado: 'NUMBER', resultadoEsperado: { tipo: 'NUMBER', valor: '7' } },
      catalogo,
      MONEDA,
      REDONDEO,
    )
    expect(falla.estado).toBe('failed')
  })

  it('campo faltante en las entradas: falla con diagnóstico, no lanza', () => {
    const resultado = ejecutarCasoPrueba(
      'REGLA X\nRETORNAR PARAMETER.PRESUPUESTO_ANUAL',
      { entradas: [], tipoEsperado: 'MONEY', resultadoEsperado: { tipo: 'MONEY', valor: '1' } },
      catalogo,
      MONEDA,
      REDONDEO,
    )
    expect(resultado.estado).toBe('failed')
    expect(resultado.actual).toBeNull()
    expect(resultado.diagnosticos.length).toBeGreaterThan(0)
  })

  it('tipo de resultado incorrecto: falla con mensaje claro', () => {
    const resultado = ejecutarCasoPrueba(
      'REGLA X\nRETORNAR PARAMETER.PRESUPUESTO_ANUAL',
      {
        entradas: [
          {
            contrato: 'PARAMETER',
            campo: 'PRESUPUESTO_ANUAL',
            valor: { tipo: 'MONEY', valor: '100' },
          },
        ],
        tipoEsperado: 'NUMBER',
        resultadoEsperado: { tipo: 'NUMBER', valor: '100' },
      },
      catalogo,
      MONEDA,
      REDONDEO,
    )
    expect(resultado.estado).toBe('failed')
    expect(resultado.mensaje).toContain('NUMBER')
  })
})
