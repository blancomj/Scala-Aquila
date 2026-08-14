import { describe, expect, it } from 'vitest'
import {
  CodigoDiagnosticoInvalidoError,
  crearDiagnostico,
  esCodigoValido,
  esError,
  ordenarDiagnosticos,
  type Diagnostico,
} from './diagnostics.js'

const span = (linea: number, columna: number) => ({
  inicio: { linea, columna },
  fin: { linea, columna: columna + 1 },
})

const diag = (codigo: string, linea: number, columna: number): Diagnostico =>
  crearDiagnostico({
    codigo,
    severidad: 'ERROR',
    mensaje: 'mensaje de prueba',
    span: span(linea, columna),
    origen: 'test.ael',
  })

describe('códigos de diagnóstico', () => {
  it('acepta el formato AEL-<CAPA>-<NOMBRE>', () => {
    expect(esCodigoValido('AEL-TYPE-001')).toBe(true)
    expect(esCodigoValido('AEL-ANALYZER-UNDEFINED')).toBe(true)
    expect(esCodigoValido('AEL-RUNTIME-INSTRUCTION_LIMIT')).toBe(true)
  })

  it('rechaza códigos sin estructura', () => {
    expect(esCodigoValido('TYPE-001')).toBe(false)
    expect(esCodigoValido('ael-type-001')).toBe(false)
    expect(esCodigoValido('')).toBe(false)
  })

  it('lanza al crear un diagnóstico con código inválido', () => {
    expect(() => diag('roto', 1, 1)).toThrow(CodigoDiagnosticoInvalidoError)
  })
})

describe('diagnóstico', () => {
  it('queda congelado tras crearse', () => {
    const d = diag('AEL-TYPE-001', 1, 1)
    expect(Object.isFrozen(d)).toBe(true)
  })

  it('identifica la severidad ERROR', () => {
    const d = diag('AEL-TYPE-001', 1, 1)
    expect(esError(d)).toBe(true)
    expect(esError({ ...d, severidad: 'WARNING' })).toBe(false)
  })
})

describe('orden canónico — 0AEL §21 determinismo', () => {
  it('ordena por línea, luego columna, luego código', () => {
    const entrada = [
      diag('AEL-TYPE-002', 3, 1),
      diag('AEL-TYPE-001', 1, 5),
      diag('AEL-TYPE-003', 1, 2),
      diag('AEL-TYPE-001', 1, 2),
    ]

    const orden = ordenarDiagnosticos(entrada).map(
      (d) => `${String(d.span.inicio.linea)}:${String(d.span.inicio.columna)}:${d.codigo}`,
    )

    expect(orden).toEqual([
      '1:2:AEL-TYPE-001',
      '1:2:AEL-TYPE-003',
      '1:5:AEL-TYPE-001',
      '3:1:AEL-TYPE-002',
    ])
  })

  it('es estable: ordenar dos veces da el mismo resultado', () => {
    const entrada = [diag('AEL-B-001', 2, 1), diag('AEL-A-001', 2, 1)]
    const uno = ordenarDiagnosticos(entrada)
    const dos = ordenarDiagnosticos(uno)
    expect(dos).toEqual(uno)
  })

  it('no muta la entrada', () => {
    const entrada = [diag('AEL-Z-001', 9, 1), diag('AEL-A-001', 1, 1)]
    const copia = [...entrada]
    ordenarDiagnosticos(entrada)
    expect(entrada).toEqual(copia)
  })
})
