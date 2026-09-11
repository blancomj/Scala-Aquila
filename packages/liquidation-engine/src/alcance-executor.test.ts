/**
 * Fase 5 (alcance.ts + executor.ts) — integración: un concepto
 * alcance='calculado' filtra snapshot.inmuebles ANTES de calcular/repartir.
 * Snapshot propio (4 inmuebles, forma similar a GC-001) — no toca los
 * conceptos reales de golden-case-gc001.test.ts (5D del plan).
 */
import { money } from '@aquila/financial-kernel'
import { describe, expect, it } from 'vitest'
import { ejecutarPlan } from './executor.js'
import type { DataSnapshot, SnapshotConcepto, SnapshotInmueble } from './snapshot.js'

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

const INMUEBLES: readonly SnapshotInmueble[] = [
  { id: 'r1', codigo: 'R1', coeficiente: '0.3000000000', fraccionActiva: '1', atributos: { ...ATRIBUTOS_VACIOS, usoPredio: 'residencial' } },
  { id: 'r2', codigo: 'R2', coeficiente: '0.3000000000', fraccionActiva: '1', atributos: { ...ATRIBUTOS_VACIOS, usoPredio: 'residencial' } },
  { id: 'c1', codigo: 'C1', coeficiente: '0.2000000000', fraccionActiva: '1', atributos: { ...ATRIBUTOS_VACIOS, usoPredio: 'comercial' } },
  { id: 'c2', codigo: 'C2', coeficiente: '0.2000000000', fraccionActiva: '1', atributos: { ...ATRIBUTOS_VACIOS, usoPredio: 'comercial' } },
]

const CONDICION_COMERCIAL = { campo: 'uso_predio', operador: 'eq', valor: 'comercial' } as const

function snapshotCon(conceptos: readonly SnapshotConcepto[]): DataSnapshot {
  const periodo = { id: 'per-03', anio: 2027, mes: 3 }
  return {
    tenantId: 'tenant-alcance',
    moneda: 'COP',
    periodo,
    periodosDelAnio: [periodo],
    inmuebles: INMUEBLES,
    conceptos,
    presupuestoVigente: null,
    politica: { redondeoModo: 'HALF_UP', redondeoEscala: 0 },
    parametros: {},
    unidades: {},
  }
}

const BASE_CONCEPTO = {
  id: 'c1',
  codigo: 'CUOTA_COMERCIAL',
  formulaAel: '',
  prioridad: 0,
  tipoRecurrencia: 'recurrente',
  fechaInicioAnio: 2000,
  fechaInicioMes: 1,
  fechaFinAnio: null,
  fechaFinMes: null,
  periodicidad: 'mensual',
  alcance: 'calculado',
  alcanceCondiciones: CONDICION_COMERCIAL,
} as const

describe('alcance calculado — ejecutarDirecto', () => {
  it('solo los inmuebles que cumplen la condición reciben línea', () => {
    const concepto: SnapshotConcepto = {
      ...BASE_CONCEPTO,
      modoCalculo: 'directo',
      modoValor: 'fijo',
      valorFijo: '50000',
    }
    const [resultado] = ejecutarPlan(snapshotCon([concepto]), [concepto])

    expect(resultado?.lineas.map((l) => l.inmuebleId).sort()).toEqual(['c1', 'c2'])
    expect(resultado?.lineas.every((l) => l.monto.amount.toString() === '50000')).toBe(true)
  })
})

describe('alcance calculado — ejecutarDistribucion', () => {
  it('el reparto recalcula coeficientes SOLO sobre el subconjunto que cumple (decisión del usuario, 2026-08-20)', () => {
    const concepto: SnapshotConcepto = {
      ...BASE_CONCEPTO,
      modoCalculo: 'distribucion',
      modoValor: 'fijo',
      valorFijo: '100000',
    }
    const [resultado] = ejecutarPlan(snapshotCon([concepto]), [concepto])

    // Si el reparto usara los 4 inmuebles (coeficientes 0.3/0.3/0.2/0.2 sin
    // renormalizar), c1/c2 recibirían 20000 cada uno. Con el subconjunto
    // (solo c1/c2, coeficientes relativos 0.2/0.2 = 50/50 entre ellos),
    // reciben 50000 cada uno — la prueba real de "solo a los que cumplen".
    const porInmueble = new Map(resultado?.lineas.map((l) => [l.inmuebleId, l.monto.amount.toString()]))
    expect(porInmueble.get('c1')).toBe('50000')
    expect(porInmueble.get('c2')).toBe('50000')
    expect(porInmueble.has('r1')).toBe(false)
    expect(porInmueble.has('r2')).toBe(false)
  })

  it('cero inmuebles cumplen: cuotaPeriodo se calcula igual, cero líneas, sin error', () => {
    const concepto: SnapshotConcepto = {
      ...BASE_CONCEPTO,
      modoCalculo: 'distribucion',
      modoValor: 'fijo',
      valorFijo: '100000',
      alcanceCondiciones: { campo: 'uso_predio', operador: 'eq', valor: 'industrial' },
    }
    const [resultado] = ejecutarPlan(snapshotCon([concepto]), [concepto])

    expect(resultado?.cuotaPeriodo).toEqual(money(100000, 'COP'))
    expect(resultado?.lineas).toEqual([])
  })
})

describe('alcance todos (default) — sin cambios respecto al comportamiento anterior a esta fase', () => {
  it('reparte entre los 4 inmuebles por su coeficiente real, sin filtrar', () => {
    const concepto: SnapshotConcepto = {
      ...BASE_CONCEPTO,
      modoCalculo: 'distribucion',
      modoValor: 'fijo',
      valorFijo: '100000',
      alcance: 'todos',
      alcanceCondiciones: null,
    }
    const [resultado] = ejecutarPlan(snapshotCon([concepto]), [concepto])

    const porInmueble = new Map(resultado?.lineas.map((l) => [l.inmuebleId, l.monto.amount.toString()]))
    expect(porInmueble.get('r1')).toBe('30000')
    expect(porInmueble.get('r2')).toBe('30000')
    expect(porInmueble.get('c1')).toBe('20000')
    expect(porInmueble.get('c2')).toBe('20000')
  })
})
