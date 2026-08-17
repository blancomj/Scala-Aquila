import { describe, expect, it } from 'vitest'
import { money } from '@aquila/financial-kernel'
import {
  calcularCureRate,
  calcularOverduePortfolioPct,
  calcularRollRatePorTramo,
  type FilaSnapshotIndicador,
} from './cartera-indicadores.js'

function fila(inmuebleId: string, deudaVencida: number, clasificacionCodigo: string): FilaSnapshotIndicador {
  return { inmuebleId, deudaVencida: money(deudaVencida, 'COP'), clasificacionCodigo }
}

describe('calcularOverduePortfolioPct', () => {
  it('divide vencida entre total', () => {
    expect(calcularOverduePortfolioPct(money(250_000, 'COP'), money(1_000_000, 'COP'))).toBeCloseTo(25, 6)
  })

  it('cartera total en cero: indeterminado (null), no 0%', () => {
    expect(calcularOverduePortfolioPct(money(0, 'COP'), money(0, 'COP'))).toBeNull()
  })
})

describe('calcularCureRate', () => {
  it('portafolio vacío: indeterminado', () => {
    expect(calcularCureRate([], [], 'COP')).toBeNull()
  })

  it('un inmueble vencido en t−1 y al día en t: 100% curado', () => {
    const anterior = [fila('i1', 100_000, 'MORA_INICIAL')]
    const actual = [fila('i1', 0, 'AL_DIA')]
    expect(calcularCureRate(anterior, actual, 'COP')).toBeCloseTo(100, 6)
  })

  it('un inmueble sigue vencido en t: 0% curado', () => {
    const anterior = [fila('i1', 100_000, 'MORA_INICIAL')]
    const actual = [fila('i1', 80_000, 'MORA_INICIAL')]
    expect(calcularCureRate(anterior, actual, 'COP')).toBeCloseTo(0, 6)
  })

  it('inmueble al día en t−1 no compite en el denominador', () => {
    const anterior = [fila('i1', 0, 'AL_DIA'), fila('i2', 200_000, 'MORA_INICIAL')]
    const actual = [fila('i1', 0, 'AL_DIA'), fila('i2', 0, 'AL_DIA')]
    // Solo i2 tiene deuda vencida en t−1 → denominador = 200_000, curado = 200_000 → 100%.
    expect(calcularCureRate(anterior, actual, 'COP')).toBeCloseTo(100, 6)
  })

  it('inmueble vencido en t−1 sin fila en t: cuenta en el denominador, no se cura', () => {
    const anterior = [fila('i1', 100_000, 'MORA_INICIAL')]
    const actual: FilaSnapshotIndicador[] = []
    expect(calcularCureRate(anterior, actual, 'COP')).toBeCloseTo(0, 6)
  })

  it('mezcla parcial: 300_000 vencidos, 100_000 curados → 33.33%', () => {
    const anterior = [fila('i1', 100_000, 'MORA_INICIAL'), fila('i2', 200_000, 'MORA_MEDIA')]
    const actual = [fila('i1', 0, 'AL_DIA'), fila('i2', 200_000, 'MORA_MEDIA')]
    expect(calcularCureRate(anterior, actual, 'COP')).toBeCloseTo(100 / 3, 6)
  })
})

describe('calcularRollRatePorTramo', () => {
  const tramos = [{ codigo: 'AL_DIA' }, { codigo: 'MORA_TEMPRANA' }, { codigo: 'MORA_INICIAL' }]

  it('un inmueble que rola de MORA_TEMPRANA a MORA_INICIAL cuenta como rolado', () => {
    const anterior = [fila('i1', 100_000, 'MORA_TEMPRANA')]
    const actual = [fila('i1', 100_000, 'MORA_INICIAL')]
    const resultado = calcularRollRatePorTramo(anterior, actual, tramos, 'COP')
    const temprana = resultado.find((t) => t.tramoCodigo === 'MORA_TEMPRANA')
    expect(temprana?.tramoSiguienteCodigo).toBe('MORA_INICIAL')
    expect(temprana?.rollRate).toBeCloseTo(100, 6)
  })

  it('un inmueble que permanece en el mismo tramo no cuenta como rolado', () => {
    const anterior = [fila('i1', 100_000, 'MORA_TEMPRANA')]
    const actual = [fila('i1', 100_000, 'MORA_TEMPRANA')]
    const resultado = calcularRollRatePorTramo(anterior, actual, tramos, 'COP')
    const temprana = resultado.find((t) => t.tramoCodigo === 'MORA_TEMPRANA')
    expect(temprana?.rollRate).toBeCloseTo(0, 6)
  })

  it('un inmueble que salta MÁS de un tramo no cuenta para el tramo de origen (solo T→T+1)', () => {
    // i1 pasa de AL_DIA directo a MORA_INICIAL, saltándose MORA_TEMPRANA — no es "AL_DIA → MORA_TEMPRANA".
    const anterior = [fila('i1', 50_000, 'AL_DIA')]
    const actual = [fila('i1', 50_000, 'MORA_INICIAL')]
    const resultado = calcularRollRatePorTramo(anterior, actual, tramos, 'COP')
    const alDia = resultado.find((t) => t.tramoCodigo === 'AL_DIA')
    expect(alDia?.rollRate).toBeCloseTo(0, 6)
  })

  it('el último tramo no tiene tramoSiguiente ni rollRate (nada a donde deteriorar más)', () => {
    const resultado = calcularRollRatePorTramo([], [], tramos, 'COP')
    const ultimo = resultado.find((t) => t.tramoCodigo === 'MORA_INICIAL')
    expect(ultimo?.tramoSiguienteCodigo).toBeNull()
    expect(ultimo?.rollRate).toBeNull()
  })

  it('tramo sin deuda en t−1: rollRate indeterminado (null), no 0%', () => {
    const resultado = calcularRollRatePorTramo([], [], tramos, 'COP')
    const temprana = resultado.find((t) => t.tramoCodigo === 'MORA_TEMPRANA')
    expect(temprana?.rollRate).toBeNull()
  })
})
