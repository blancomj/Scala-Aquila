import { describe, expect, it } from 'vitest'
import { money } from '@aquila/financial-kernel'
import {
  imputarPago,
  calcularInteresMora,
  type CargoAbierto,
  type EstrategiaImputacion,
  type PoliticaMora,
  type SegmentoTasa,
} from './cuenta-corriente.js'
import {
  OrdenImputacionInvalidoError,
  EstrategiaImputacionInvalidaError,
  PoliticaMoraNoConfiguradaError,
  SegmentacionDayCountNoSoportadoError,
  SegmentosTasaSolapadosError,
} from './errors.js'

const ORDEN_ESTANDAR = ['interes', 'capital', 'otro'] as const

function cargo(over: Partial<CargoAbierto> & { id: string }): CargoAbierto {
  return {
    periodoClave: '2027-01',
    categoria: 'capital',
    conceptoPrioridad: null,
    fechaVencimiento: '2027-01-05',
    montoPendiente: money(100_000, 'COP'),
    novedadTipo: null,
    ...over,
  }
}

/** D-23: default = comportamiento histórico (mismo que antes de REQ-MORA-003/REQ-NOVEDAD-003). */
function politicaMora(over: Partial<PoliticaMora> = {}): PoliticaMora {
  return {
    tasaMensual: '0.03',
    topeMensual: '0.05',
    diasGracia: 0,
    dayCount: 'mensual_30_dias_reales',
    descuentoOrden: 'interes_sobre_capital_completo',
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
  const politica = politicaMora()
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
    const politicaAltaTasa = politicaMora({ tasaMensual: '0.10' })
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
    const politicaConGracia = politicaMora({ diasGracia: 15 })
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
        politicaMora({ tasaMensual: null, topeMensual: null }),
        redondeo,
      ),
    ).toThrow(PoliticaMoraNoConfiguradaError)
  })

  describe('REQ-MORA-003 (D-23) — day-count configurable', () => {
    const c = cargo({
      id: 'cap-1',
      categoria: 'capital',
      fechaVencimiento: '2027-01-01',
      montoPendiente: money(100_000, 'COP'),
    })

    it('actual_365: tasaDiaria = tasaMensual × 12 / 365, sobre días reales', () => {
      const [generado] = calcularInteresMora(
        [c],
        '2027-01-11',
        politicaMora({ dayCount: 'actual_365' }),
        redondeo,
      )
      // 100_000 * (0.03*12/365) * 10 = 986.30... → HALF_UP escala 0 = 986
      expect(generado?.monto.amount.toString()).toBe('986')
    })

    it('actual_360: tasaDiaria = tasaMensual × 12 / 360, sobre días reales', () => {
      const [generado] = calcularInteresMora(
        [c],
        '2027-01-11',
        politicaMora({ dayCount: 'actual_360' }),
        redondeo,
      )
      // 100_000 * (0.03*12/360) * 10 = 1_000 (0.36/360 == 0.03/30, coincide con mensual_30_dias_reales)
      expect(generado?.monto.amount.toString()).toBe('1000')
    })

    it('treinta_360: cada mes cuenta 30 días — distinto de días calendario reales', () => {
      // enero tiene 31 días calendario reales; 30/360 los cuenta como 30.
      const [generadoCalendario] = calcularInteresMora(
        [c],
        '2027-02-01',
        politicaMora({ dayCount: 'mensual_30_dias_reales' }),
        redondeo,
      )
      const [generadoTreinta360] = calcularInteresMora(
        [c],
        '2027-02-01',
        politicaMora({ dayCount: 'treinta_360' }),
        redondeo,
      )
      expect(generadoCalendario?.diasMora).toBe(31)
      expect(generadoTreinta360?.diasMora).toBe(30)
      expect(generadoCalendario?.monto.amount.toString()).toBe('3100')
      expect(generadoTreinta360?.monto.amount.toString()).toBe('3000')
    })
  })

  describe('REQ-NOVEDAD-003 (D-23) — orden descuento-vs-interés', () => {
    const capital = cargo({
      id: 'cap-1',
      categoria: 'capital',
      periodoClave: '2027-01',
      fechaVencimiento: '2027-01-01',
      montoPendiente: money(100_000, 'COP'),
    })
    const descuento = cargo({
      id: 'desc-1',
      categoria: 'otro',
      periodoClave: '2027-01',
      novedadTipo: 'DISCOUNT',
      montoPendiente: money(-30_000, 'COP'),
    })

    it('interes_sobre_capital_completo (default): el DISCOUNT no afecta el interés', () => {
      const [generado] = calcularInteresMora([capital, descuento], '2027-01-11', politica, redondeo)
      expect(generado?.monto.amount.toString()).toBe('1000')
    })

    it('descuento_antes_interes: reduce la base de capital antes de aplicar la tasa', () => {
      const politicaConOrden = politicaMora({ descuentoOrden: 'descuento_antes_interes' })
      const [generado] = calcularInteresMora(
        [capital, descuento],
        '2027-01-11',
        politicaConOrden,
        redondeo,
      )
      // (100_000 - 30_000) * (0.03/30) * 10 = 700
      expect(generado?.monto.amount.toString()).toBe('700')
    })

    it('descuento_antes_interes con piso cero: un descuento mayor al capital no genera interés negativo', () => {
      const descuentoGrande = cargo({
        id: 'desc-2',
        categoria: 'otro',
        periodoClave: '2027-01',
        novedadTipo: 'DISCOUNT',
        montoPendiente: money(-150_000, 'COP'),
      })
      const politicaConOrden = politicaMora({ descuentoOrden: 'descuento_antes_interes' })
      const generados = calcularInteresMora(
        [capital, descuentoGrande],
        '2027-01-11',
        politicaConOrden,
        redondeo,
      )
      expect(generados).toEqual([])
    })

    it('descuento_antes_interes ignora cargos "otro" que no son DISCOUNT', () => {
      const ajuste = cargo({
        id: 'ajuste-1',
        categoria: 'otro',
        periodoClave: '2027-01',
        novedadTipo: 'ADJUSTMENT',
        montoPendiente: money(-30_000, 'COP'),
      })
      const politicaConOrden = politicaMora({ descuentoOrden: 'descuento_antes_interes' })
      const [generado] = calcularInteresMora([capital, ajuste], '2027-01-11', politicaConOrden, redondeo)
      expect(generado?.monto.amount.toString()).toBe('1000')
    })
  })
})

describe('calcularInteresMora con SegmentoTasa[] (CAR §13.3, GAP-CAR-004, PH-C11)', () => {
  const redondeo = { modo: 'HALF_UP' as const, escala: 0 }

  function segmento(over: Partial<SegmentoTasa> & { desde: string; hasta: string }): SegmentoTasa {
    return { tasaMensual: '0.03', fuenteResolucion: 'test', ...over }
  }

  it('retrocompatible: un solo segmento que cubre toda la ventana reproduce EXACTAMENTE el monto sin segmentar', () => {
    const c = cargo({
      id: 'cap-1',
      categoria: 'capital',
      fechaVencimiento: '2027-01-05',
      montoPendiente: money(100_000, 'COP'),
    })
    const politica = politicaMora({ tasaMensual: '0.03', topeMensual: '0.05' })

    const sinSegmentar = calcularInteresMora([c], '2027-02-05', politica, redondeo)
    const conUnSegmento = calcularInteresMora([c], '2027-02-05', politica, redondeo, [
      segmento({ desde: '2027-01-05', hasta: '2027-02-05', tasaMensual: '0.03' }),
    ])

    expect(conUnSegmento).toEqual(sinSegmentar)
    expect(conUnSegmento[0]?.monto.amount.toString()).toBe('3100') // 100_000 * (0.03/30) * 31
  })

  it('PH-C11: reparte el interés entre dos tramos cuando la tasa cambia a mitad de la mora', () => {
    const c = cargo({
      id: 'cap-1',
      categoria: 'capital',
      fechaVencimiento: '2026-06-01',
      montoPendiente: money(100_000, 'COP'),
    })
    const politica = politicaMora({ tasaMensual: '0.03', topeMensual: '0.10' })

    const [generado] = calcularInteresMora([c], '2026-07-16', politica, redondeo, [
      segmento({ desde: '2026-06-01', hasta: '2026-07-01', tasaMensual: '0.03' }), // 30 días
      segmento({ desde: '2026-07-01', hasta: '2026-07-16', tasaMensual: '0.06' }), // 15 días
    ])

    // Tramo 1: 100_000 * (0.03/30) * 30 = 3_000
    // Tramo 2: 100_000 * (0.06/30) * 15 = 3_000
    expect(generado?.diasMora).toBe(45)
    expect(generado?.monto.amount.toString()).toBe('6000')
    expect(generado?.topeAplicado).toBe(false)

    // Prueba de que segmentar de verdad cambia el resultado — no es un
    // envoltorio inerte: una sola tasa de 0.03 sobre los mismos 45 días
    // habría dado 4_500, no 6_000.
    const [sinSegmentar] = calcularInteresMora([c], '2026-07-16', politica, redondeo)
    expect(sinSegmentar?.monto.amount.toString()).toBe('4500')
  })

  it('el tope legal se aplica por segmento, no solo de forma global', () => {
    const c = cargo({
      id: 'cap-1',
      categoria: 'capital',
      fechaVencimiento: '2027-01-01',
      montoPendiente: money(100_000, 'COP'),
    })
    const politica = politicaMora({ tasaMensual: '0.03', topeMensual: '0.05' })

    const [generado] = calcularInteresMora([c], '2027-01-31', politica, redondeo, [
      segmento({ desde: '2027-01-01', hasta: '2027-01-31', tasaMensual: '0.20' }), // muy por encima del tope
    ])

    // tope 0.05, no la tasa 0.20 del segmento: 100_000 * (0.05/30) * 30 = 5_000
    expect(generado?.monto.amount.toString()).toBe('5000')
    expect(generado?.topeAplicado).toBe(true)
  })

  it('la gracia desplaza el inicio de acumulación también con segmentos', () => {
    const c = cargo({
      id: 'cap-1',
      categoria: 'capital',
      fechaVencimiento: '2026-06-01',
      montoPendiente: money(100_000, 'COP'),
    })
    const politica = politicaMora({ tasaMensual: '0.03', topeMensual: '0.10', diasGracia: 5 })

    const [generado] = calcularInteresMora([c], '2026-07-01', politica, redondeo, [
      segmento({ desde: '2026-06-01', hasta: '2026-07-01', tasaMensual: '0.03' }),
    ])

    // Sin gracia serían 30 días; con 5 de gracia, 25.
    expect(generado?.diasMora).toBe(25)
    expect(generado?.monto.amount.toString()).toBe('2500') // 100_000 * (0.03/30) * 25
  })

  it('un array de segmentos vacío se comporta igual que no pasar segmentos', () => {
    const c = cargo({
      id: 'cap-1',
      categoria: 'capital',
      fechaVencimiento: '2027-01-01',
      montoPendiente: money(100_000, 'COP'),
    })
    const politica = politicaMora()
    const sinSegmentos = calcularInteresMora([c], '2027-01-11', politica, redondeo)
    const conArregloVacio = calcularInteresMora([c], '2027-01-11', politica, redondeo, [])
    expect(conArregloVacio).toEqual(sinSegmentos)
  })

  it('SegmentosTasaSolapadosError si dos segmentos se solapan', () => {
    const c = cargo({ id: 'cap-1', categoria: 'capital', fechaVencimiento: '2027-01-01' })
    const politica = politicaMora()
    expect(() =>
      calcularInteresMora([c], '2027-03-01', politica, redondeo, [
        segmento({ desde: '2027-01-01', hasta: '2027-02-01', fuenteResolucion: 'res-A' }),
        segmento({ desde: '2027-01-15', hasta: '2027-03-01', fuenteResolucion: 'res-B' }), // solapa con A
      ]),
    ).toThrow(SegmentosTasaSolapadosError)
  })

  it('SegmentacionDayCountNoSoportadoError con day-count treinta_360', () => {
    const c = cargo({ id: 'cap-1', categoria: 'capital', fechaVencimiento: '2027-01-01' })
    const politica = politicaMora({ dayCount: 'treinta_360' })
    expect(() =>
      calcularInteresMora([c], '2027-02-01', politica, redondeo, [
        segmento({ desde: '2027-01-01', hasta: '2027-02-01' }),
      ]),
    ).toThrow(SegmentacionDayCountNoSoportadoError)
  })

  it('sin segmentos, treinta_360 sigue funcionando normalmente (solo se rechaza CON segmentos)', () => {
    const c = cargo({
      id: 'cap-1',
      categoria: 'capital',
      fechaVencimiento: '2027-01-01',
      montoPendiente: money(100_000, 'COP'),
    })
    const politica = politicaMora({ dayCount: 'treinta_360' })
    expect(() => calcularInteresMora([c], '2027-02-01', politica, redondeo)).not.toThrow()
  })
})
