import { describe, expect, it } from 'vitest'
import { money } from '@aquila/financial-kernel'
import {
  imputarPago,
  calcularInteresMora,
  type CargoAbierto,
  type EstrategiaImputacion,
} from './cuenta-corriente.js'
import {
  OrdenImputacionInvalidoError,
  EstrategiaImputacionInvalidaError,
  PoliticaMoraNoConfiguradaError,
} from './errors.js'

const ORDEN_ESTANDAR = ['interes', 'capital', 'otro'] as const

function cargo(over: Partial<CargoAbierto> & { id: string }): CargoAbierto {
  return {
    periodoClave: '2027-01',
    categoria: 'capital',
    conceptoPrioridad: null,
    fechaVencimiento: '2027-01-05',
    montoPendiente: money(100_000, 'COP'),
    ...over,
  }
}

function imputar(
  montoPago: number,
  cargos: readonly CargoAbierto[],
  estrategia: EstrategiaImputacion = 'deuda_mas_antigua',
  periodoActualClave = '2027-01',
) {
  return imputarPago(
    money(montoPago, 'COP'),
    cargos,
    [...ORDEN_ESTANDAR],
    estrategia,
    periodoActualClave,
  )
}

describe('imputarPago', () => {
  it('pago exacto cubre el único cargo, sin sobrante', () => {
    const c = cargo({ id: 'c1', montoPendiente: money(50_000, 'COP') })
    const plan = imputar(50_000, [c])
    expect(plan.aplicaciones).toEqual([{ cargoId: 'c1', monto: money(50_000, 'COP') }])
    expect(plan.aplicado.amount.toString()).toBe('50000')
    expect(plan.noAplicado.amount.toString()).toBe('0')
  })

  it('pago parcial: aplica interés antes que capital (orden de categoría)', () => {
    const capital = cargo({
      id: 'capital-1',
      categoria: 'capital',
      montoPendiente: money(100_000, 'COP'),
    })
    const interes = cargo({
      id: 'interes-1',
      categoria: 'interes',
      montoPendiente: money(10_000, 'COP'),
    })
    const plan = imputar(15_000, [capital, interes])

    expect(plan.aplicaciones).toEqual([
      { cargoId: 'interes-1', monto: money(10_000, 'COP') },
      { cargoId: 'capital-1', monto: money(5_000, 'COP') },
    ])
    expect(plan.noAplicado.amount.toString()).toBe('0')
  })

  it('pago que cruza dos periodos bajo deuda_mas_antigua: cubre el periodo más viejo primero', () => {
    const viejo = cargo({
      id: 'viejo',
      periodoClave: '2026-12',
      montoPendiente: money(30_000, 'COP'),
    })
    const actual = cargo({
      id: 'actual',
      periodoClave: '2027-01',
      montoPendiente: money(30_000, 'COP'),
    })
    const plan = imputar(40_000, [actual, viejo], 'deuda_mas_antigua')

    expect(plan.aplicaciones).toEqual([
      { cargoId: 'viejo', monto: money(30_000, 'COP') },
      { cargoId: 'actual', monto: money(10_000, 'COP') },
    ])
  })

  it('periodo_actual: prioriza el periodo indicado, luego cascadea al resto (nunca queda ocioso)', () => {
    const viejo = cargo({
      id: 'viejo',
      periodoClave: '2026-12',
      montoPendiente: money(30_000, 'COP'),
    })
    const actual = cargo({
      id: 'actual',
      periodoClave: '2027-01',
      montoPendiente: money(30_000, 'COP'),
    })
    const plan = imputar(40_000, [viejo, actual], 'periodo_actual', '2027-01')

    expect(plan.aplicaciones).toEqual([
      { cargoId: 'actual', monto: money(30_000, 'COP') },
      { cargoId: 'viejo', monto: money(10_000, 'COP') },
    ])
  })

  it('pago que excede todo lo pendiente: noAplicado > 0, sin fila especial (AD-34)', () => {
    const c = cargo({ id: 'c1', montoPendiente: money(20_000, 'COP') })
    const plan = imputar(50_000, [c])

    expect(plan.aplicaciones).toEqual([{ cargoId: 'c1', monto: money(20_000, 'COP') }])
    expect(plan.aplicado.amount.toString()).toBe('20000')
    expect(plan.noAplicado.amount.toString()).toBe('30000')
  })

  it('sin cargos abiertos: todo el pago queda como noAplicado', () => {
    const plan = imputar(10_000, [])
    expect(plan.aplicaciones).toEqual([])
    expect(plan.noAplicado.amount.toString()).toBe('10000')
  })

  it('desempate dentro de categoria "otro" por conceptoPrioridad ASC', () => {
    const bajaPrioridad = cargo({
      id: 'otro-baja',
      categoria: 'otro',
      conceptoPrioridad: 200,
      montoPendiente: money(5_000, 'COP'),
    })
    const altaPrioridad = cargo({
      id: 'otro-alta',
      categoria: 'otro',
      conceptoPrioridad: 100,
      montoPendiente: money(5_000, 'COP'),
    })
    const plan = imputar(5_000, [bajaPrioridad, altaPrioridad])
    expect(plan.aplicaciones).toEqual([{ cargoId: 'otro-alta', monto: money(5_000, 'COP') }])
  })

  it('OrdenImputacionInvalidoError si imputacion_orden no es una permutación exacta', () => {
    const c = cargo({ id: 'c1' })
    expect(() =>
      imputarPago(money(1000, 'COP'), [c], ['interes', 'capital'], 'deuda_mas_antigua', '2027-01'),
    ).toThrow(OrdenImputacionInvalidoError)
  })

  it('EstrategiaImputacionInvalidaError si la estrategia no es una de las dos válidas', () => {
    const c = cargo({ id: 'c1' })
    expect(() =>
      imputarPago(
        money(1000, 'COP'),
        [c],
        [...ORDEN_ESTANDAR],
        'otra_cosa' as EstrategiaImputacion,
        '2027-01',
      ),
    ).toThrow(EstrategiaImputacionInvalidaError)
  })
})

describe('calcularInteresMora', () => {
  const politica = { tasaMensual: '0.03', topeMensual: '0.05', diasGracia: 0 }
  const redondeo = { modo: 'HALF_UP' as const, escala: 0 }

  it('capital vencido genera interés proporcional a los días de mora', () => {
    const c = cargo({
      id: 'cap-1',
      categoria: 'capital',
      fechaVencimiento: '2027-01-01',
      montoPendiente: money(100_000, 'COP'),
    })
    const [generado] = calcularInteresMora([c], '2027-01-11', politica, redondeo)

    expect(generado?.cargoCapitalOrigenId).toBe('cap-1')
    expect(generado?.diasMora).toBe(10)
    // 100_000 * (0.03/30) * 10 = 1_000
    expect(generado?.monto.amount.toString()).toBe('1000')
    expect(generado?.topeAplicado).toBe(false)
  })

  it('aplica el tope cuando la tasa configurada lo supera', () => {
    const c = cargo({
      id: 'cap-1',
      categoria: 'capital',
      fechaVencimiento: '2027-01-01',
      montoPendiente: money(100_000, 'COP'),
    })
    const politicaAltaTasa = { tasaMensual: '0.10', topeMensual: '0.05', diasGracia: 0 }
    const [generado] = calcularInteresMora([c], '2027-01-11', politicaAltaTasa, redondeo)

    // 100_000 * (0.05/30) * 10 = 1_667 (HALF_UP, escala 0)
    expect(generado?.monto.amount.toString()).toBe('1667')
    expect(generado?.topeAplicado).toBe(true)
  })

  it('capital dentro del periodo de gracia no genera interés', () => {
    const c = cargo({
      id: 'cap-1',
      categoria: 'capital',
      fechaVencimiento: '2027-01-01',
      montoPendiente: money(100_000, 'COP'),
    })
    const politicaConGracia = { tasaMensual: '0.03', topeMensual: '0.05', diasGracia: 15 }
    const generados = calcularInteresMora([c], '2027-01-11', politicaConGracia, redondeo)
    expect(generados).toEqual([])
  })

  it('ignora cargos que no son categoria capital', () => {
    const c = cargo({ id: 'otro-1', categoria: 'otro', fechaVencimiento: '2027-01-01' })
    const generados = calcularInteresMora([c], '2027-01-11', politica, redondeo)
    expect(generados).toEqual([])
  })

  it('PoliticaMoraNoConfiguradaError si tasa/tope son null', () => {
    const c = cargo({ id: 'cap-1', fechaVencimiento: '2027-01-01' })
    expect(() =>
      calcularInteresMora(
        [c],
        '2027-01-11',
        { tasaMensual: null, topeMensual: null, diasGracia: 0 },
        redondeo,
      ),
    ).toThrow(PoliticaMoraNoConfiguradaError)
  })
})
