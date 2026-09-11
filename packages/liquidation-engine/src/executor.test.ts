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
  tipoInmueble: null,
  agrupacionRuta: null,
} as const

function snapshotBase(conceptos: readonly SnapshotConcepto[]): DataSnapshot {
  const periodo = { id: 'per-01', anio: 2026, mes: 1 }
  return {
    tenantId: 'tenant-fijo',
    moneda: 'COP',
    periodo,
    periodosDelAnio: [periodo],
    inmuebles: [
      { id: 'inm-1', codigo: 'INM-1', coeficiente: '0.6000000000', fraccionActiva: '1', atributos: ATRIBUTOS_VACIOS },
      { id: 'inm-2', codigo: 'INM-2', coeficiente: '0.4000000000', fraccionActiva: '1', atributos: ATRIBUTOS_VACIOS },
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

describe('ejecutarPlan — H2 prorrateo temporal (auditoría externa 2026-08-26)', () => {
  /** inm-2 activo solo la mitad del periodo — inm-1 sigue completo. */
  function snapshotConProrrateo(conceptos: readonly SnapshotConcepto[]): DataSnapshot {
    const base = snapshotBase(conceptos)
    return {
      ...base,
      inmuebles: [
        base.inmuebles[0]!,
        { ...base.inmuebles[1]!, fraccionActiva: '0.5' },
      ],
    }
  }

  it('directo: el monto se multiplica por la fracción de días activos de cada inmueble', () => {
    const concepto: SnapshotConcepto = {
      id: 'c4',
      codigo: 'CUOTA_PRORRATEADA',
      modoCalculo: 'directo',
      modoValor: 'fijo',
      formulaAel: '',
      valorFijo: '50000',
      prioridad: 0,
      ...RECURRENTE_SIEMPRE,
    }
    const [resultado] = ejecutarPlan(snapshotConProrrateo([concepto]), [concepto])

    const porInmueble = new Map(resultado?.lineas.map((l) => [l.inmuebleId, l.monto.amount.toString()]))
    expect(porInmueble.get('inm-1')).toBe('50000') // fracción 1: sin cambio.
    expect(porInmueble.get('inm-2')).toBe('25000') // fracción 0.5: la mitad.
  })

  it('distribución: el inmueble prorrateado paga menos y los demás absorben la diferencia — Σ=fuente exacta', () => {
    const concepto: SnapshotConcepto = {
      id: 'c5',
      codigo: 'CUOTA_DIST_PRORRATEADA',
      modoCalculo: 'distribucion',
      modoValor: 'fijo',
      formulaAel: '',
      valorFijo: '100000',
      prioridad: 0,
      ...RECURRENTE_SIEMPRE,
    }
    const [resultado] = ejecutarPlan(snapshotConProrrateo([concepto]), [concepto])

    const porInmueble = new Map(resultado?.lineas.map((l) => [l.inmuebleId, l.monto.amount.toNumber()]))
    const inm1 = porInmueble.get('inm-1')!
    const inm2 = porInmueble.get('inm-2')!

    // coeficiente 0.6/0.4 iguales a los de snapshotBase; basis efectivo
    // 0.6×1=0.6 vs 0.4×0.5=0.2 → inm-1 se lleva 3/4 de la cuota, no 3/5.
    expect(inm1).toBeGreaterThan(60000) // más de lo que se llevaría sin prorrateo.
    expect(inm2).toBeLessThan(40000) // menos de lo que se llevaría sin prorrateo.
    expect(inm1 + inm2).toBe(100000) // nada se pierde: se redistribuye, no se descuenta.
  })
})
