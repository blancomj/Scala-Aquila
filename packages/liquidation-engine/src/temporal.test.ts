/**
 * Conceptos avanzados Fase 2 — conceptoAplicaEnPeriodo(): unitario puro,
 * sin Supabase. Cubre los 4 tipos de recurrencia y los bordes de mes/año.
 */
import { describe, expect, it } from 'vitest'
import { ConceptoRecurrenciaSinFechaError } from './errors.js'
import { conceptoAplicaEnPeriodo } from './temporal.js'
import type { SnapshotConcepto } from './snapshot.js'

const BASE: SnapshotConcepto = {
  id: 'c1',
  codigo: 'X',
  modoCalculo: 'directo',
  modoValor: 'formulado',
  formulaAel: 'REGLA X\nRETORNAR 1',
  valorFijo: null,
  prioridad: 0,
  tipoRecurrencia: 'recurrente',
  fechaInicioAnio: 2026,
  fechaInicioMes: 6,
  fechaFinAnio: null,
  fechaFinMes: null,
  periodicidad: 'mensual',
  alcance: 'todos',
  alcanceCondiciones: null,
}

describe('conceptoAplicaEnPeriodo — novedad', () => {
  it('nunca aplica, sin importar el periodo (Fase 4: se factura por inmueble puntual)', () => {
    const concepto: SnapshotConcepto = {
      ...BASE,
      tipoRecurrencia: 'novedad',
      fechaInicioAnio: null,
      fechaInicioMes: null,
      periodicidad: null,
    }
    expect(conceptoAplicaEnPeriodo(concepto, 2000, 1)).toBe(false)
    expect(conceptoAplicaEnPeriodo(concepto, 2026, 6)).toBe(false)
    expect(conceptoAplicaEnPeriodo(concepto, 2099, 12)).toBe(false)
  })
})

describe('conceptoAplicaEnPeriodo — recurrente', () => {
  const concepto: SnapshotConcepto = { ...BASE, tipoRecurrencia: 'recurrente' }

  it('no aplica antes de fechaInicio', () => {
    expect(conceptoAplicaEnPeriodo(concepto, 2026, 5)).toBe(false)
    expect(conceptoAplicaEnPeriodo(concepto, 2025, 12)).toBe(false)
  })

  it('aplica en fechaInicio exacta y en todo lo posterior', () => {
    expect(conceptoAplicaEnPeriodo(concepto, 2026, 6)).toBe(true)
    expect(conceptoAplicaEnPeriodo(concepto, 2026, 7)).toBe(true)
    expect(conceptoAplicaEnPeriodo(concepto, 2027, 1)).toBe(true)
  })

  it('sin fechaInicio (snapshot inconsistente) lanza ConceptoRecurrenciaSinFechaError', () => {
    const roto: SnapshotConcepto = { ...concepto, fechaInicioAnio: null }
    expect(() => conceptoAplicaEnPeriodo(roto, 2026, 6)).toThrow(ConceptoRecurrenciaSinFechaError)
  })

  it('sin periodicidad (snapshot inconsistente) lanza ConceptoRecurrenciaSinFechaError', () => {
    const roto: SnapshotConcepto = { ...concepto, periodicidad: null }
    expect(() => conceptoAplicaEnPeriodo(roto, 2026, 6)).toThrow(ConceptoRecurrenciaSinFechaError)
  })
})

describe('conceptoAplicaEnPeriodo — recurrente con periodicidad no mensual', () => {
  it('bimensual: aplica cada 2 periodos desde fechaInicio, no en el intermedio', () => {
    const concepto: SnapshotConcepto = { ...BASE, periodicidad: 'bimensual' }
    expect(conceptoAplicaEnPeriodo(concepto, 2026, 6)).toBe(true)
    expect(conceptoAplicaEnPeriodo(concepto, 2026, 7)).toBe(false)
    expect(conceptoAplicaEnPeriodo(concepto, 2026, 8)).toBe(true)
    expect(conceptoAplicaEnPeriodo(concepto, 2026, 9)).toBe(false)
  })

  it('trimestral: aplica cada 3 periodos, y respeta el corte de año', () => {
    const concepto: SnapshotConcepto = { ...BASE, periodicidad: 'trimestral' }
    expect(conceptoAplicaEnPeriodo(concepto, 2026, 6)).toBe(true)
    expect(conceptoAplicaEnPeriodo(concepto, 2026, 8)).toBe(false)
    expect(conceptoAplicaEnPeriodo(concepto, 2026, 9)).toBe(true)
    expect(conceptoAplicaEnPeriodo(concepto, 2026, 12)).toBe(true)
    expect(conceptoAplicaEnPeriodo(concepto, 2027, 1)).toBe(false)
    expect(conceptoAplicaEnPeriodo(concepto, 2027, 3)).toBe(true)
  })

  it('semestral: aplica cada 6 periodos', () => {
    const concepto: SnapshotConcepto = { ...BASE, periodicidad: 'semestral' }
    expect(conceptoAplicaEnPeriodo(concepto, 2026, 6)).toBe(true)
    expect(conceptoAplicaEnPeriodo(concepto, 2026, 11)).toBe(false)
    expect(conceptoAplicaEnPeriodo(concepto, 2026, 12)).toBe(true)
    expect(conceptoAplicaEnPeriodo(concepto, 2027, 6)).toBe(true)
  })

  it('anual: aplica cada 12 periodos, solo en el mismo mes del año siguiente', () => {
    const concepto: SnapshotConcepto = { ...BASE, periodicidad: 'anual' }
    expect(conceptoAplicaEnPeriodo(concepto, 2026, 6)).toBe(true)
    expect(conceptoAplicaEnPeriodo(concepto, 2026, 12)).toBe(false)
    expect(conceptoAplicaEnPeriodo(concepto, 2027, 5)).toBe(false)
    expect(conceptoAplicaEnPeriodo(concepto, 2027, 6)).toBe(true)
    expect(conceptoAplicaEnPeriodo(concepto, 2028, 6)).toBe(true)
  })
})

describe('conceptoAplicaEnPeriodo — unico', () => {
  const concepto: SnapshotConcepto = { ...BASE, tipoRecurrencia: 'unico', periodicidad: null }

  it('aplica solo en el mes/año exactos', () => {
    expect(conceptoAplicaEnPeriodo(concepto, 2026, 6)).toBe(true)
  })

  it('no aplica ni antes ni después, mismo año o distinto', () => {
    expect(conceptoAplicaEnPeriodo(concepto, 2026, 5)).toBe(false)
    expect(conceptoAplicaEnPeriodo(concepto, 2026, 7)).toBe(false)
    expect(conceptoAplicaEnPeriodo(concepto, 2027, 6)).toBe(false)
  })
})

describe('conceptoAplicaEnPeriodo — por_periodo', () => {
  const concepto: SnapshotConcepto = {
    ...BASE,
    tipoRecurrencia: 'por_periodo',
    fechaInicioAnio: 2026,
    fechaInicioMes: 3,
    fechaFinAnio: 2026,
    fechaFinMes: 5,
    periodicidad: null,
  }

  it('no aplica antes del rango', () => {
    expect(conceptoAplicaEnPeriodo(concepto, 2026, 2)).toBe(false)
  })

  it('aplica en los bordes inclusive (inicio y fin) y en el medio', () => {
    expect(conceptoAplicaEnPeriodo(concepto, 2026, 3)).toBe(true)
    expect(conceptoAplicaEnPeriodo(concepto, 2026, 4)).toBe(true)
    expect(conceptoAplicaEnPeriodo(concepto, 2026, 5)).toBe(true)
  })

  it('no aplica después del rango', () => {
    expect(conceptoAplicaEnPeriodo(concepto, 2026, 6)).toBe(false)
  })

  it('rango que cruza fin de año (nov-2026 a feb-2027) evalúa por clave anio*12+mes, no por mes solo', () => {
    const cruzaAnio: SnapshotConcepto = {
      ...concepto,
      fechaInicioAnio: 2026,
      fechaInicioMes: 11,
      fechaFinAnio: 2027,
      fechaFinMes: 2,
    }
    expect(conceptoAplicaEnPeriodo(cruzaAnio, 2026, 12)).toBe(true)
    expect(conceptoAplicaEnPeriodo(cruzaAnio, 2027, 1)).toBe(true)
    expect(conceptoAplicaEnPeriodo(cruzaAnio, 2027, 3)).toBe(false)
  })

  it('sin fechaFin (snapshot inconsistente) lanza ConceptoRecurrenciaSinFechaError', () => {
    const roto: SnapshotConcepto = { ...concepto, fechaFinAnio: null }
    expect(() => conceptoAplicaEnPeriodo(roto, 2026, 4)).toThrow(ConceptoRecurrenciaSinFechaError)
  })
})
