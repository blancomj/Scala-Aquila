import { describe, expect, it } from 'vitest'
import {
  evaluarAccionesAplicables,
  type AccionHistorica,
  type EstrategiaCobranza,
} from './cartera-cobranza.js'

function estrategia(over: Partial<EstrategiaCobranza> & { id: string }): EstrategiaCobranza {
  return {
    tramoCodigo: 'MORA_TEMPRANA',
    tipoAccion: 'email',
    diasDesdeClasificacion: 0,
    frecuenciaDias: 7,
    maxIntentos: 3,
    montoMinimoDeuda: null,
    activa: true,
    ...over,
  }
}

function accion(over: Partial<AccionHistorica> & { estrategiaId: string }): AccionHistorica {
  return {
    estado: 'ejecutada',
    fechaProgramada: '2026-08-01',
    ...over,
  }
}

describe('evaluarAccionesAplicables', () => {
  it('propone una estrategia sin historial cuando ya corresponde por días (PH)', () => {
    const resultado = evaluarAccionesAplicables({
      clasificacionCodigo: 'MORA_TEMPRANA',
      diasEnTramoActual: 3,
      deudaTotal: '500000',
      estrategias: [estrategia({ id: 'e1', diasDesdeClasificacion: 2 })],
      historialAcciones: [],
      fechaCorte: '2026-08-10',
    })

    expect(resultado.propuestas).toEqual([{ estrategiaId: 'e1', tipoAccion: 'email', intentoNumero: 1 }])
    expect(resultado.omitidas).toEqual([])
  })

  it('ignora estrategias de otros tramos', () => {
    const resultado = evaluarAccionesAplicables({
      clasificacionCodigo: 'MORA_TEMPRANA',
      diasEnTramoActual: 10,
      deudaTotal: '500000',
      estrategias: [estrategia({ id: 'e1', tramoCodigo: 'MORA_MEDIA' })],
      historialAcciones: [],
      fechaCorte: '2026-08-10',
    })

    expect(resultado.propuestas).toEqual([])
    expect(resultado.omitidas).toEqual([])
  })

  it('ignora estrategias inactivas', () => {
    const resultado = evaluarAccionesAplicables({
      clasificacionCodigo: 'MORA_TEMPRANA',
      diasEnTramoActual: 10,
      deudaTotal: '500000',
      estrategias: [estrategia({ id: 'e1', activa: false })],
      historialAcciones: [],
      fechaCorte: '2026-08-10',
    })

    expect(resultado.propuestas).toEqual([])
    expect(resultado.omitidas).toEqual([])
  })

  it('omite por DEUDA_INSUFICIENTE cuando la deuda no alcanza el mínimo (CAR §9.3)', () => {
    const resultado = evaluarAccionesAplicables({
      clasificacionCodigo: 'MORA_TEMPRANA',
      diasEnTramoActual: 5,
      deudaTotal: '10000',
      estrategias: [estrategia({ id: 'e1', montoMinimoDeuda: '50000' })],
      historialAcciones: [],
      fechaCorte: '2026-08-10',
    })

    expect(resultado.propuestas).toEqual([])
    expect(resultado.omitidas).toEqual([{ estrategiaId: 'e1', motivo: 'DEUDA_INSUFICIENTE' }])
  })

  it('omite por AUN_NO_CORRESPONDE cuando faltan días desde que entró al tramo', () => {
    const resultado = evaluarAccionesAplicables({
      clasificacionCodigo: 'MORA_TEMPRANA',
      diasEnTramoActual: 1,
      deudaTotal: '500000',
      estrategias: [estrategia({ id: 'e1', diasDesdeClasificacion: 5 })],
      historialAcciones: [],
      fechaCorte: '2026-08-10',
    })

    expect(resultado.propuestas).toEqual([])
    expect(resultado.omitidas).toEqual([{ estrategiaId: 'e1', motivo: 'AUN_NO_CORRESPONDE' }])
  })

  it('omite por ESTRATEGIA_AGOTADA cuando ya se alcanzó max_intentos (I-C07)', () => {
    const resultado = evaluarAccionesAplicables({
      clasificacionCodigo: 'MORA_TEMPRANA',
      diasEnTramoActual: 30,
      deudaTotal: '500000',
      estrategias: [estrategia({ id: 'e1', maxIntentos: 2, frecuenciaDias: 1 })],
      historialAcciones: [
        accion({ estrategiaId: 'e1', fechaProgramada: '2026-08-01' }),
        accion({ estrategiaId: 'e1', fechaProgramada: '2026-08-05' }),
      ],
      fechaCorte: '2026-08-20',
    })

    expect(resultado.propuestas).toEqual([])
    expect(resultado.omitidas).toEqual([{ estrategiaId: 'e1', motivo: 'ESTRATEGIA_AGOTADA' }])
  })

  it('omite por DENTRO_DE_VENTANA_FRECUENCIA cuando la última acción fue reciente', () => {
    const resultado = evaluarAccionesAplicables({
      clasificacionCodigo: 'MORA_TEMPRANA',
      diasEnTramoActual: 30,
      deudaTotal: '500000',
      estrategias: [estrategia({ id: 'e1', frecuenciaDias: 7 })],
      historialAcciones: [accion({ estrategiaId: 'e1', fechaProgramada: '2026-08-05' })],
      fechaCorte: '2026-08-08',
    })

    expect(resultado.propuestas).toEqual([])
    expect(resultado.omitidas).toEqual([{ estrategiaId: 'e1', motivo: 'DENTRO_DE_VENTANA_FRECUENCIA' }])
  })

  it('propone de nuevo (intento 2) una vez pasada la ventana de frecuencia', () => {
    const resultado = evaluarAccionesAplicables({
      clasificacionCodigo: 'MORA_TEMPRANA',
      diasEnTramoActual: 30,
      deudaTotal: '500000',
      estrategias: [estrategia({ id: 'e1', frecuenciaDias: 7 })],
      historialAcciones: [accion({ estrategiaId: 'e1', fechaProgramada: '2026-08-01' })],
      fechaCorte: '2026-08-10',
    })

    expect(resultado.propuestas).toEqual([{ estrategiaId: 'e1', tipoAccion: 'email', intentoNumero: 2 }])
  })

  it('omite por ACCION_UNICA_YA_REALIZADA cuando frecuenciaDias es null y ya existe una acción vigente', () => {
    const resultado = evaluarAccionesAplicables({
      clasificacionCodigo: 'MORA_TEMPRANA',
      diasEnTramoActual: 30,
      deudaTotal: '500000',
      estrategias: [estrategia({ id: 'e1', frecuenciaDias: null, maxIntentos: 1 })],
      historialAcciones: [accion({ estrategiaId: 'e1', estado: 'programada', fechaProgramada: '2026-08-05' })],
      fechaCorte: '2026-08-20',
    })

    expect(resultado.propuestas).toEqual([])
    expect(resultado.omitidas).toEqual([{ estrategiaId: 'e1', motivo: 'ACCION_UNICA_YA_REALIZADA' }])
  })

  it('no cuenta acciones rechazadas/fallidas/canceladas como vigentes para la anti-duplicación', () => {
    const resultado = evaluarAccionesAplicables({
      clasificacionCodigo: 'MORA_TEMPRANA',
      diasEnTramoActual: 30,
      deudaTotal: '500000',
      estrategias: [estrategia({ id: 'e1', frecuenciaDias: null, maxIntentos: 1 })],
      historialAcciones: [
        accion({ estrategiaId: 'e1', estado: 'rechazada', fechaProgramada: '2026-08-05' }),
        accion({ estrategiaId: 'e1', estado: 'fallida', fechaProgramada: '2026-08-06' }),
        accion({ estrategiaId: 'e1', estado: 'cancelada', fechaProgramada: '2026-08-07' }),
      ],
      fechaCorte: '2026-08-20',
    })

    expect(resultado.propuestas).toEqual([{ estrategiaId: 'e1', tipoAccion: 'email', intentoNumero: 1 }])
  })

  it('CAR §12.5: un acuerdo vigente suspende TODO el flujo normal, aunque las estrategias ya correspondan', () => {
    const resultado = evaluarAccionesAplicables({
      clasificacionCodigo: 'MORA_TEMPRANA',
      diasEnTramoActual: 30,
      deudaTotal: '500000',
      estrategias: [estrategia({ id: 'e1' }), estrategia({ id: 'e2', tipoAccion: 'llamada' })],
      historialAcciones: [],
      fechaCorte: '2026-08-20',
      tieneAcuerdoVigente: true,
    })

    expect(resultado.propuestas).toEqual([])
    expect(resultado.omitidas).toEqual([
      { estrategiaId: 'e1', motivo: 'ACUERDO_VIGENTE' },
      { estrategiaId: 'e2', motivo: 'ACUERDO_VIGENTE' },
    ])
  })

  it('evalúa varias estrategias del mismo tramo de forma independiente', () => {
    const resultado = evaluarAccionesAplicables({
      clasificacionCodigo: 'MORA_TEMPRANA',
      diasEnTramoActual: 15,
      deudaTotal: '500000',
      estrategias: [
        estrategia({ id: 'e1', tipoAccion: 'email', diasDesdeClasificacion: 0 }),
        estrategia({ id: 'e2', tipoAccion: 'llamada', diasDesdeClasificacion: 20 }),
      ],
      historialAcciones: [],
      fechaCorte: '2026-08-20',
    })

    expect(resultado.propuestas).toEqual([{ estrategiaId: 'e1', tipoAccion: 'email', intentoNumero: 1 }])
    expect(resultado.omitidas).toEqual([{ estrategiaId: 'e2', motivo: 'AUN_NO_CORRESPONDE' }])
  })
})
