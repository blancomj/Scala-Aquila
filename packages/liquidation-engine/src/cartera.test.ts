import { describe, expect, it } from 'vitest'
import { money } from '@aquila/financial-kernel'
import type { CargoAbierto } from './cuenta-corriente.js'
import {
  calcularAntiguedad,
  calcularPosicionCartera,
  clasificarCartera,
  validarPoliticaClasificacion,
  type PoliticaClasificacion,
  type TramoClasificacion,
} from './cartera.js'
import { PoliticaClasificacionInvalidaError, TramoClasificacionNoEncontradoError } from './errors.js'

function cargo(over: Partial<CargoAbierto> & { id: string }): CargoAbierto {
  return {
    periodoClave: '2026-08',
    categoria: 'capital',
    conceptoPrioridad: null,
    fechaVencimiento: '2026-08-10',
    montoPendiente: money(500_000, 'COP'),
    novedadTipo: null,
    ...over,
  }
}

/** Política de 8 tramos sugerida en CAR §8.4 — sin tildes en los códigos. */
const TRAMOS_ESTANDAR: readonly TramoClasificacion[] = [
  { codigo: 'AL_DIA', diasMin: 0, diasMax: 0, nivelRiesgo: 'ninguno', etapaCobranza: 'preventiva', prioridad: 0 },
  { codigo: 'MORA_TEMPRANA', diasMin: 1, diasMax: 30, nivelRiesgo: 'bajo', etapaCobranza: 'administrativa', prioridad: 1 },
  { codigo: 'MORA_INICIAL', diasMin: 31, diasMax: 60, nivelRiesgo: 'bajo', etapaCobranza: 'administrativa', prioridad: 2 },
  { codigo: 'MORA_MEDIA', diasMin: 61, diasMax: 90, nivelRiesgo: 'medio', etapaCobranza: 'administrativa', prioridad: 3 },
  { codigo: 'MORA_AVANZADA', diasMin: 91, diasMax: 120, nivelRiesgo: 'medio', etapaCobranza: 'prejuridica', prioridad: 4 },
  { codigo: 'MORA_CRITICA', diasMin: 121, diasMax: 180, nivelRiesgo: 'alto', etapaCobranza: 'prejuridica', prioridad: 5 },
  { codigo: 'ALTO_RIESGO', diasMin: 181, diasMax: 360, nivelRiesgo: 'alto', etapaCobranza: 'juridica', prioridad: 6 },
  { codigo: 'CRITICA', diasMin: 361, diasMax: null, nivelRiesgo: 'critico', etapaCobranza: 'juridica', prioridad: 7 },
]

const POLITICA: PoliticaClasificacion = { id: 'pol-1', version: 3, tramos: TRAMOS_ESTANDAR }

describe('calcularAntiguedad', () => {
  it('PH-C01 — unidad al día: fecha_corte antes del vencimiento, dias_mora = 0', () => {
    const c = cargo({ id: 'c1', fechaVencimiento: '2026-08-10' })
    const [r] = calcularAntiguedad([c], '2026-08-05')
    expect(r!.diasMora).toBe(0)
  })

  it('el día del vencimiento todavía no cuenta como mora (dias_mora = 0)', () => {
    const c = cargo({ id: 'c1', fechaVencimiento: '2026-08-10' })
    const [r] = calcularAntiguedad([c], '2026-08-10')
    expect(r!.diasMora).toBe(0)
  })

  it('PH-C02 — mora de 1 día: primer día después del vencimiento', () => {
    const c = cargo({ id: 'c1', fechaVencimiento: '2026-08-10' })
    const [r] = calcularAntiguedad([c], '2026-08-11')
    expect(r!.diasMora).toBe(1)
  })

  it('PH-C03 — mora de 30 días, límite superior del tramo MORA_TEMPRANA', () => {
    const c = cargo({ id: 'c1', fechaVencimiento: '2026-08-10' })
    const [r] = calcularAntiguedad([c], '2026-09-09')
    expect(r!.diasMora).toBe(30)
  })

  it('PH-C04 — frontera 30 → 31 días (detecta off-by-one de rangos inclusivos)', () => {
    const c = cargo({ id: 'c1', fechaVencimiento: '2026-08-10' })
    const [r] = calcularAntiguedad([c], '2026-09-10')
    expect(r!.diasMora).toBe(31)
  })

  it('I-C01 — un cargo saldado (montoPendiente = 0) no participa en la antigüedad', () => {
    const pagado = cargo({ id: 'pagado', fechaVencimiento: '2026-03-10', montoPendiente: money(0, 'COP') })
    const vigente = cargo({ id: 'vigente', fechaVencimiento: '2026-06-10' })
    const resultado = calcularAntiguedad([pagado, vigente], '2026-08-16')
    expect(resultado.map((r) => r.cargo.id)).toEqual(['vigente'])
  })
})

describe('calcularPosicionCartera', () => {
  it('PH-C05 — el cargo más antiguo CON SALDO determina dias_mora_maximo, no el más antiguo en absoluto', () => {
    const pagado = cargo({
      id: 'C-001',
      fechaVencimiento: '2026-03-10',
      montoPendiente: money(0, 'COP'),
    })
    const vigente = cargo({ id: 'C-002', fechaVencimiento: '2026-06-10', montoPendiente: money(500_000, 'COP') })
    const conAntiguedad = calcularAntiguedad([pagado, vigente], '2026-08-16')
    const posicion = calcularPosicionCartera(conAntiguedad, 'COP')

    expect(posicion.cargoMasAntiguoId).toBe('C-002')
    expect(posicion.diasMoraMaximo).toBe(67) // 2026-06-10 -> 2026-08-16
  })

  it('PH-C06 — varias obligaciones con distintas antigüedades: detalle preservado, máximo correcto', () => {
    const cargos = [
      cargo({ id: 'marzo', fechaVencimiento: '2026-03-10', montoPendiente: money(500_000, 'COP') }),
      cargo({ id: 'abril', fechaVencimiento: '2026-04-10', montoPendiente: money(500_000, 'COP') }),
      cargo({ id: 'mayo', fechaVencimiento: '2026-05-10', montoPendiente: money(500_000, 'COP') }),
      cargo({ id: 'junio', fechaVencimiento: '2026-06-10', montoPendiente: money(500_000, 'COP') }),
    ]
    const conAntiguedad = calcularAntiguedad(cargos, '2026-08-16')
    expect(conAntiguedad.map((r) => r.diasMora)).toEqual([159, 128, 98, 67])

    const posicion = calcularPosicionCartera(conAntiguedad, 'COP')
    expect(posicion.diasMoraMaximo).toBe(159)
    expect(posicion.cargoMasAntiguoId).toBe('marzo')
    expect(posicion.cantidadCargosVencidos).toBe(4)
    expect(posicion.deudaTotal).toEqual(money(2_000_000, 'COP'))
  })

  it('PH-C09 — un cargo con saldo negativo (sobrepago no neteado) no cuenta como vencido ni resta la deuda', () => {
    const vencido = cargo({ id: 'vencido', fechaVencimiento: '2026-06-10', montoPendiente: money(500_000, 'COP') })
    const conAntiguedad = calcularAntiguedad([vencido], '2026-08-16')
    const posicion = calcularPosicionCartera(conAntiguedad, 'COP')
    // calcularAntiguedad ya filtra montos <= 0 (isNegativeMoney) — el sobrepago
    // vive en pago_aplicaciones/saldo_credito, nunca como cargo negativo aquí.
    expect(posicion.deudaTotal).toEqual(money(500_000, 'COP'))
  })

  it('agrega deuda por categoría (capital/interes/otro) por separado', () => {
    const cargos = [
      cargo({ id: 'cap', categoria: 'capital', montoPendiente: money(400_000, 'COP') }),
      cargo({ id: 'int', categoria: 'interes', montoPendiente: money(15_000, 'COP') }),
      cargo({ id: 'otr', categoria: 'otro', montoPendiente: money(5_000, 'COP') }),
    ]
    const posicion = calcularPosicionCartera(calcularAntiguedad(cargos, '2026-08-16'), 'COP')
    expect(posicion.deudaCapital).toEqual(money(400_000, 'COP'))
    expect(posicion.deudaInteres).toEqual(money(15_000, 'COP'))
    expect(posicion.deudaOtros).toEqual(money(5_000, 'COP'))
    expect(posicion.deudaTotal).toEqual(money(420_000, 'COP'))
  })

  it('sin cargos vencidos, dias_mora_maximo = 0 y cargoMasAntiguoId = null', () => {
    const alDia = cargo({ id: 'c1', fechaVencimiento: '2026-09-10' })
    const posicion = calcularPosicionCartera(calcularAntiguedad([alDia], '2026-08-16'), 'COP')
    expect(posicion.diasMoraMaximo).toBe(0)
    expect(posicion.cargoMasAntiguoId).toBeNull()
    expect(posicion.cantidadCargosVencidos).toBe(0)
  })
})

describe('clasificarCartera', () => {
  it('PH-C01 — 0 días de mora clasifica AL_DIA', () => {
    expect(clasificarCartera(0, POLITICA).codigo).toBe('AL_DIA')
  })

  it('PH-C02 — 1 día de mora clasifica MORA_TEMPRANA', () => {
    const r = clasificarCartera(1, POLITICA)
    expect(r.codigo).toBe('MORA_TEMPRANA')
    expect(r.etapaCobranza).toBe('administrativa')
  })

  it('PH-C03 — 30 días todavía en MORA_TEMPRANA', () => {
    expect(clasificarCartera(30, POLITICA).codigo).toBe('MORA_TEMPRANA')
  })

  it('PH-C04 — 31 días cruza a MORA_INICIAL', () => {
    expect(clasificarCartera(31, POLITICA).codigo).toBe('MORA_INICIAL')
  })

  it('clasifica correctamente el tramo sin tope superior (CRITICA, >360 días)', () => {
    const r = clasificarCartera(400, POLITICA)
    expect(r.codigo).toBe('CRITICA')
    expect(r.nivelRiesgo).toBe('critico')
  })

  it('congela politicaId y politicaVersion en el resultado (REC-CAR-011)', () => {
    const r = clasificarCartera(45, POLITICA)
    expect(r.politicaId).toBe('pol-1')
    expect(r.politicaVersion).toBe(3)
  })

  it('lanza TramoClasificacionNoEncontradoError si ningún tramo cubre los días — nunca un default', () => {
    const politicaIncompleta: PoliticaClasificacion = {
      id: 'pol-2',
      version: 1,
      tramos: [{ codigo: 'AL_DIA', diasMin: 0, diasMax: 30, nivelRiesgo: 'ninguno', etapaCobranza: 'preventiva', prioridad: 0 }],
    }
    expect(() => clasificarCartera(31, politicaIncompleta)).toThrow(TramoClasificacionNoEncontradoError)
  })
})

describe('validarPoliticaClasificacion — IC-TRAMO-01..05', () => {
  it('acepta la política estándar de 8 tramos', () => {
    expect(() => {
      validarPoliticaClasificacion(TRAMOS_ESTANDAR)
    }).not.toThrow()
  })

  it('IC-TRAMO-01 — rechaza un hueco en la cobertura', () => {
    const conHueco: TramoClasificacion[] = [
      { codigo: 'AL_DIA', diasMin: 0, diasMax: 30, nivelRiesgo: 'ninguno', etapaCobranza: 'preventiva', prioridad: 0 },
      { codigo: 'ALTO', diasMin: 35, diasMax: null, nivelRiesgo: 'alto', etapaCobranza: 'juridica', prioridad: 1 },
    ]
    expect(() => {
      validarPoliticaClasificacion(conHueco)
    }).toThrow(PoliticaClasificacionInvalidaError)
  })

  it('IC-TRAMO-02 — rechaza un solape entre tramos', () => {
    const conSolape: TramoClasificacion[] = [
      { codigo: 'AL_DIA', diasMin: 0, diasMax: 30, nivelRiesgo: 'ninguno', etapaCobranza: 'preventiva', prioridad: 0 },
      { codigo: 'ALTO', diasMin: 25, diasMax: null, nivelRiesgo: 'alto', etapaCobranza: 'juridica', prioridad: 1 },
    ]
    expect(() => {
      validarPoliticaClasificacion(conSolape)
    }).toThrow(PoliticaClasificacionInvalidaError)
  })

  it('IC-TRAMO-03 — rechaza una política sin ningún tramo abierto (sin dias_max=null)', () => {
    const sinTope: TramoClasificacion[] = [
      { codigo: 'AL_DIA', diasMin: 0, diasMax: 30, nivelRiesgo: 'ninguno', etapaCobranza: 'preventiva', prioridad: 0 },
      { codigo: 'MORA', diasMin: 31, diasMax: 60, nivelRiesgo: 'bajo', etapaCobranza: 'administrativa', prioridad: 1 },
    ]
    expect(() => {
      validarPoliticaClasificacion(sinTope)
    }).toThrow(PoliticaClasificacionInvalidaError)
  })

  it('IC-TRAMO-03 — rechaza dos tramos con dias_max=null (ambiguo cuál abre)', () => {
    const dosAbiertos: TramoClasificacion[] = [
      { codigo: 'A', diasMin: 0, diasMax: null, nivelRiesgo: 'ninguno', etapaCobranza: 'preventiva', prioridad: 0 },
      { codigo: 'B', diasMin: 31, diasMax: null, nivelRiesgo: 'alto', etapaCobranza: 'juridica', prioridad: 1 },
    ]
    expect(() => {
      validarPoliticaClasificacion(dosAbiertos)
    }).toThrow(PoliticaClasificacionInvalidaError)
  })

  it('IC-TRAMO-04 — rechaza una política sin tramo que arranque en 0', () => {
    const sinCero: TramoClasificacion[] = [
      { codigo: 'MORA', diasMin: 1, diasMax: null, nivelRiesgo: 'bajo', etapaCobranza: 'administrativa', prioridad: 0 },
    ]
    expect(() => {
      validarPoliticaClasificacion(sinCero)
    }).toThrow(PoliticaClasificacionInvalidaError)
  })

  it('IC-TRAMO-05 — rechaza códigos duplicados', () => {
    const duplicado: TramoClasificacion[] = [
      { codigo: 'X', diasMin: 0, diasMax: 30, nivelRiesgo: 'ninguno', etapaCobranza: 'preventiva', prioridad: 0 },
      { codigo: 'X', diasMin: 31, diasMax: null, nivelRiesgo: 'alto', etapaCobranza: 'juridica', prioridad: 1 },
    ]
    expect(() => {
      validarPoliticaClasificacion(duplicado)
    }).toThrow(PoliticaClasificacionInvalidaError)
  })

  it('rechaza una política sin tramos', () => {
    expect(() => {
      validarPoliticaClasificacion([])
    }).toThrow(PoliticaClasificacionInvalidaError)
  })
})
