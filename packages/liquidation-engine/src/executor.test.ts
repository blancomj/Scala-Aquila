/**
 * Conceptos avanzados Fase 1 — modo_valor='fijo' en ejecutarPlan(): el monto
 * es un dato directo (valorFijo), sin parsear/analizar/evaluar ninguna
 * fórmula. Cubre ambos modoCalculo (directo/distribucion) — el modo de valor
 * no cambia cómo se reparte, solo de dónde sale el monto.
 */
import { money } from '@aquila/financial-kernel'
import { describe, expect, it } from 'vitest'
import { ConceptoFijoSinValorError } from './errors.js'
import { ejecutarPlan } from './executor.js'
import type { DataSnapshot, SnapshotConcepto } from './snapshot.js'

/** Recurrente desde el centinela de backfill (2000-01) — irrelevante para
 * estos tests de modo_valor, pero cada SnapshotConcepto debe declararlo. */
const RECURRENTE_SIEMPRE = {
  tipoRecurrencia: 'recurrente',
  fechaInicioAnio: 2000,
  fechaInicioMes: 1,
  fechaFinAnio: null,
  fechaFinMes: null,
  periodicidad: 'mensual',
  alcance: 'todos',
  alcanceCondiciones: null,
} as const

/** Fase 5 (alcance.ts) — irrelevante para estos tests de modo_valor, pero
 * cada SnapshotInmueble debe declarar atributos. */
const ATRIBUTOS_VACIOS = {
  estadoLegal: null,
  habitabilidad: null,
  areaPrivada: null,
  tipoPropietario: null,
  tipoInquilino: null,
  usoPredio: null,
  saldoActual: null,
} as const

function snapshotBase(conceptos: readonly SnapshotConcepto[]): DataSnapshot {
  const periodo = { id: 'per-01', anio: 2026, mes: 1 }
  return {
    tenantId: 'tenant-fijo',
    moneda: 'COP',
    periodo,
    periodosDelAnio: [periodo],
    inmuebles: [
      { id: 'inm-1', codigo: 'INM-1', coeficiente: '0.6000000000', atributos: ATRIBUTOS_VACIOS },
      { id: 'inm-2', codigo: 'INM-2', coeficiente: '0.4000000000', atributos: ATRIBUTOS_VACIOS },
    ],
    conceptos,
    presupuestoVigente: null,
    politica: { redondeoModo: 'HALF_UP', redondeoEscala: 0 },
    parametros: {},
    unidades: {},
  }
}

describe('ejecutarPlan — modo_valor fijo', () => {
  it('directo: cada inmueble recibe exactamente el monto fijo, sin evaluar fórmula', () => {
    const concepto: SnapshotConcepto = {
      id: 'c1',
      codigo: 'CUOTA_FIJA',
      modoCalculo: 'directo',
      modoValor: 'fijo',
      formulaAel: '',
      valorFijo: '50000',
      prioridad: 0,
      ...RECURRENTE_SIEMPRE,
    }
    const [resultado] = ejecutarPlan(snapshotBase([concepto]), [concepto])

    expect(resultado?.valorAgregado).toBeNull()
    expect(resultado?.cuotaPeriodo).toBeNull()
    expect(resultado?.lineas).toEqual([
      { inmuebleId: 'inm-1', conceptoCodigo: 'CUOTA_FIJA', monto: money(50000, 'COP') },
      { inmuebleId: 'inm-2', conceptoCodigo: 'CUOTA_FIJA', monto: money(50000, 'COP') },
    ])
  })

  it('distribución: el monto fijo se reparte entre inmuebles por coeficiente', () => {
    const concepto: SnapshotConcepto = {
      id: 'c2',
      codigo: 'CUOTA_FIJA_DIST',
      modoCalculo: 'distribucion',
      modoValor: 'fijo',
      formulaAel: '',
      valorFijo: '100000',
      prioridad: 0,
      ...RECURRENTE_SIEMPRE,
    }
    const [resultado] = ejecutarPlan(snapshotBase([concepto]), [concepto])

    expect(resultado?.valorAgregado).toEqual({ tipo: 'MONEY', valor: money(100000, 'COP') })
    expect(resultado?.cuotaPeriodo).toEqual(money(100000, 'COP'))

    const porInmueble = new Map(resultado?.lineas.map((l) => [l.inmuebleId, l.monto.amount.toString()]))
    expect(porInmueble.get('inm-1')).toBe('60000')
    expect(porInmueble.get('inm-2')).toBe('40000')
  })

  it('fijo sin valorFijo (snapshot inconsistente con el CHECK real) lanza ConceptoFijoSinValorError', () => {
    const concepto: SnapshotConcepto = {
      id: 'c3',
      codigo: 'ROTO',
      modoCalculo: 'directo',
      modoValor: 'fijo',
      formulaAel: '',
      valorFijo: null,
      prioridad: 0,
      ...RECURRENTE_SIEMPRE,
    }
    expect(() => ejecutarPlan(snapshotBase([concepto]), [concepto])).toThrow(
      ConceptoFijoSinValorError,
    )
  })
})
