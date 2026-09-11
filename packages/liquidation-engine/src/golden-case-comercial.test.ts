/**
 * GC-COM-001 — golden case de PH MIXTA (ADC-01).
 * Ver PROMPT_01_ADAPTACION_COMERCIAL_CORE.md §15, §36 (casos 3, 4, 5) y §37.
 *
 * Es la prueba de que la adaptación comercial NO necesitó un motor propio: la
 * misma copropiedad contiene apartamentos, locales, una bodega y una oficina, y
 * los tres modos de segmentación (todos / por agrupación / por tipo) salen del
 * `alcance` que el Core ya tenía, con importes exactos verificables a mano.
 *
 *   Torre A            [torre-a]
 *     ├── Apto 101     coef 0.25   tipo=apartamento
 *     └── Apto 102     coef 0.25   tipo=apartamento
 *   Sector Comercial   [sector-com]
 *     ├── Bloque 1 → Nivel 1
 *     │     ├── Local 01   coef 0.15   tipo=local
 *     │     └── Local 02   coef 0.10   tipo=local
 *     └── Bodega 01        coef 0.05   tipo=bodega
 *   Torre Empresarial  [torre-emp]
 *     └── Oficina 501  coef 0.20   tipo=oficina
 *                                  Σ coeficientes = 1.00
 *
 * Los tres inmuebles del sector comercial cuelgan de nodos DISTINTOS y a
 * profundidades distintas (los locales del Nivel 1, la bodega del sector
 * mismo) — es justo el caso que una comparación por igualdad de
 * `agrupacion_id` no resolvería, y la razón de que `agrupacion` evalúe
 * pertenencia al subárbol.
 */
import { describe, expect, it } from 'vitest'
import { ejecutarPlan } from './executor.js'
import { ensamblarResultado } from './result.js'
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
  {
    id: 'apto-101',
    codigo: 'A-101',
    coeficiente: '0.2500000000',
    fraccionActiva: '1',
    atributos: { ...ATRIBUTOS_VACIOS, tipoInmueble: 'apartamento', usoPredio: 'residencial', agrupacionRuta: ['torre-a'] },
  },
  {
    id: 'apto-102',
    codigo: 'A-102',
    coeficiente: '0.2500000000',
    fraccionActiva: '1',
    atributos: { ...ATRIBUTOS_VACIOS, tipoInmueble: 'apartamento', usoPredio: 'residencial', agrupacionRuta: ['torre-a'] },
  },
  {
    id: 'local-01',
    codigo: 'L-01',
    coeficiente: '0.1500000000',
    fraccionActiva: '1',
    atributos: {
      ...ATRIBUTOS_VACIOS,
      tipoInmueble: 'local',
      usoPredio: 'comercial',
      agrupacionRuta: ['sector-com', 'bloque-1', 'nivel-1'],
    },
  },
  {
    id: 'local-02',
    codigo: 'L-02',
    coeficiente: '0.1000000000',
    fraccionActiva: '1',
    atributos: {
      ...ATRIBUTOS_VACIOS,
      tipoInmueble: 'local',
      usoPredio: 'comercial',
      agrupacionRuta: ['sector-com', 'bloque-1', 'nivel-1'],
    },
  },
  {
    // Sin uso_predio clasificado a propósito — alimenta la prueba del aviso.
    id: 'bodega-01',
    codigo: 'B-01',
    coeficiente: '0.0500000000',
    fraccionActiva: '1',
    atributos: { ...ATRIBUTOS_VACIOS, tipoInmueble: 'bodega', agrupacionRuta: ['sector-com'] },
  },
  {
    id: 'ofi-501',
    codigo: 'O-501',
    coeficiente: '0.2000000000',
    fraccionActiva: '1',
    atributos: { ...ATRIBUTOS_VACIOS, tipoInmueble: 'oficina', usoPredio: 'comercial', agrupacionRuta: ['torre-emp'] },
  },
]

const PERIODO = { id: 'per-2027-03', anio: 2027, mes: 3 }
/** Los 12 periodos reales del año: el Paso 1 (PLAN §6.5) reparte el valor ANUAL
 * del concepto entre ellos, así que "12.000.000 al año" es literalmente
 * 1.000.000 en el periodo que se liquida. */
const PERIODOS_2027 = Array.from({ length: 12 }, (_, i) => ({
  id: `per-2027-${String(i + 1).padStart(2, '0')}`,
  anio: 2027,
  mes: i + 1,
}))

const BASE = {
  formulaAel: '',
  modoCalculo: 'distribucion',
  modoValor: 'fijo',
  prioridad: 0,
  tipoRecurrencia: 'recurrente',
  fechaInicioAnio: 2000,
  fechaInicioMes: 1,
  fechaFinAnio: null,
  fechaFinMes: null,
  periodicidad: 'mensual',
} as const

/** Administración general: 12.000.000 anuales → 1.000.000 al mes, a todos. */
const ADMIN_GENERAL: SnapshotConcepto = {
  ...BASE,
  id: 'con-admin',
  codigo: 'ADMIN_GENERAL',
  valorFijo: '12000000',
  alcance: 'todos',
  alcanceCondiciones: null,
}

/** Vigilancia comercial: 3.600.000 anuales → 300.000 al mes, solo al sector
 * comercial — incluida la bodega, que cuelga del sector directamente. */
const VIGILANCIA_COMERCIAL: SnapshotConcepto = {
  ...BASE,
  id: 'con-vigcom',
  codigo: 'VIGILANCIA_COMERCIAL',
  valorFijo: '3600000',
  alcance: 'calculado',
  alcanceCondiciones: { campo: 'agrupacion', operador: 'eq', valor: 'sector-com' },
}

/** Aseo residencial: 2.400.000 anuales → 200.000 al mes, solo apartamentos. */
const ASEO_RESIDENCIAL: SnapshotConcepto = {
  ...BASE,
  id: 'con-aseo',
  codigo: 'ASEO_RESIDENCIAL',
  valorFijo: '2400000',
  alcance: 'calculado',
  alcanceCondiciones: { campo: 'tipo_inmueble', operador: 'eq', valor: 'apartamento' },
}

function snapshotCon(conceptos: readonly SnapshotConcepto[]): DataSnapshot {
  return {
    tenantId: 'gc-com-001',
    moneda: 'COP',
    periodo: PERIODO,
    periodosDelAnio: PERIODOS_2027,
    inmuebles: INMUEBLES,
    conceptos,
    presupuestoVigente: null,
    politica: { redondeoModo: 'HALF_UP', redondeoEscala: 0 },
    parametros: {},
    unidades: {},
  }
}

function montosPorInmueble(conceptos: readonly SnapshotConcepto[], codigo: string): Map<string, string> {
  const resultados = ejecutarPlan(snapshotCon(conceptos), conceptos)
  const resultado = resultados.find((r) => r.conceptoCodigo === codigo)
  return new Map(resultado?.lineas.map((l) => [l.inmuebleId, l.monto.amount.toString()]) ?? [])
}

describe('GC-COM-001 — PH mixta en un solo tenant (prompt §36 caso 3)', () => {
  it('caso 4 — administración general (alcance=todos) reparte 1.000.000 entre las 6 unidades por coeficiente', () => {
    const montos = montosPorInmueble([ADMIN_GENERAL], 'ADMIN_GENERAL')
    expect(montos.get('apto-101')).toBe('250000')
    expect(montos.get('apto-102')).toBe('250000')
    expect(montos.get('local-01')).toBe('150000')
    expect(montos.get('local-02')).toBe('100000')
    expect(montos.get('bodega-01')).toBe('50000')
    expect(montos.get('ofi-501')).toBe('200000')
    expect(montos.size).toBe(6)
  })

  it('caso 5 — vigilancia comercial no toca ninguna unidad residencial, ni la oficina de otra torre', () => {
    const montos = montosPorInmueble([VIGILANCIA_COMERCIAL], 'VIGILANCIA_COMERCIAL')
    // Σ coeficientes del sector = 0.15 + 0.10 + 0.05 = 0.30; los 300.000 del mes
    // se renormalizan sobre ese subconjunto (0.15/0.30 = ½, 0.10/0.30 = ⅓, 0.05/0.30 = ⅙).
    expect(montos.get('local-01')).toBe('150000')
    expect(montos.get('local-02')).toBe('100000')
    expect(montos.get('bodega-01')).toBe('50000')
    expect(montos.has('apto-101')).toBe(false)
    expect(montos.has('apto-102')).toBe(false)
    // La oficina es de uso comercial, pero cuelga de otra torre: el alcance es
    // por estructura física, no por uso — la distinción que hace falta para
    // cobrar la vigilancia de un centro comercial y no la de un edificio.
    expect(montos.has('ofi-501')).toBe(false)
  })

  it('aseo residencial (por tipo de unidad) solo alcanza los apartamentos', () => {
    const montos = montosPorInmueble([ASEO_RESIDENCIAL], 'ASEO_RESIDENCIAL')
    expect(montos.get('apto-101')).toBe('100000')
    expect(montos.get('apto-102')).toBe('100000')
    expect(montos.size).toBe(2)
  })

  it('los tres conceptos juntos: total por unidad y total del tenant exactos', () => {
    const plan = [ADMIN_GENERAL, VIGILANCIA_COMERCIAL, ASEO_RESIDENCIAL]
    const snapshot = snapshotCon(plan)
    const resultado = ensamblarResultado(snapshot, ejecutarPlan(snapshot, plan))

    const totales = new Map(resultado.totalesPorInmueble.map((t) => [t.inmuebleId, t.total.amount.toString()]))
    expect(totales.get('apto-101')).toBe('350000') // 250.000 admin + 100.000 aseo
    expect(totales.get('apto-102')).toBe('350000')
    expect(totales.get('local-01')).toBe('300000') // 150.000 admin + 150.000 vigilancia
    expect(totales.get('local-02')).toBe('200000') // 100.000 + 100.000
    expect(totales.get('bodega-01')).toBe('100000') //  50.000 +  50.000
    expect(totales.get('ofi-501')).toBe('200000') // solo admin
    // 1.000.000 + 300.000 + 200.000
    expect(resultado.tenantTotal.amount.toString()).toBe('1500000')
  })
})

describe('GC-COM-001 — aviso por dato sin clasificar (ADC-01)', () => {
  const POR_USO_COMERCIAL: SnapshotConcepto = {
    ...BASE,
    id: 'con-uso',
    codigo: 'SERVICIO_USO_COMERCIAL',
    valorFijo: '1200000',
    alcance: 'calculado',
    alcanceCondiciones: { campo: 'uso_predio', operador: 'eq', valor: 'comercial' },
  }

  it('la bodega sin uso_predio queda fuera y el motor lo reporta, en vez de excluirla en silencio', () => {
    const plan = [POR_USO_COMERCIAL]
    const snapshot = snapshotCon(plan)
    const resultado = ensamblarResultado(snapshot, ejecutarPlan(snapshot, plan))

    expect(resultado.avisosAlcance).toEqual([
      { conceptoCodigo: 'SERVICIO_USO_COMERCIAL', inmuebleId: 'bodega-01', campos: ['uso_predio'] },
    ])
  })

  it('los residenciales quedan fuera por valor distinto, no por dato ausente: no generan aviso', () => {
    const plan = [POR_USO_COMERCIAL]
    const snapshot = snapshotCon(plan)
    const resultado = ensamblarResultado(snapshot, ejecutarPlan(snapshot, plan))

    expect(resultado.avisosAlcance.map((a) => a.inmuebleId)).not.toContain('apto-101')
  })

  it('un alcance sin campos ausentes no produce ningún aviso', () => {
    const plan = [VIGILANCIA_COMERCIAL]
    const snapshot = snapshotCon(plan)
    const resultado = ensamblarResultado(snapshot, ejecutarPlan(snapshot, plan))

    expect(resultado.avisosAlcance).toEqual([])
  })
})
