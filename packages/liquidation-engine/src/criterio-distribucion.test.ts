/**
 * ADC-01-ADD (§14 PROMPT_01_ADAPTACION_COMERCIAL_CORE) — allocate() ya era
 * genérico (basisType='coefficient' acepta cualquier DecimalValue); el gap
 * real era que ejecutarDistribucion() hardcodeaba siempre coeficiente ×
 * fracciónActiva. Este archivo cubre el nuevo criterioDistribucion='area_privada':
 * el reparto pondera por área en vez de coeficiente, y un inmueble elegible
 * sin área diligenciada se excluye y reporta (mismo mecanismo que
 * agrupacion/tipo_inmueble, no un área-cero silencioso).
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

// Coeficientes deliberadamente IGUALES (0.25 cada uno) para que un reparto
// por coeficiente diera 25.000 parejo — y así distinguir sin ambigüedad un
// reparto que sí pondera por área (60/40/60/40 m² → no reparte parejo).
const INMUEBLES: readonly SnapshotInmueble[] = [
  { id: 'a1', codigo: 'A1', coeficiente: '0.2500000000', fraccionActiva: '1', atributos: { ...ATRIBUTOS_VACIOS, areaPrivada: '60' } },
  { id: 'a2', codigo: 'A2', coeficiente: '0.2500000000', fraccionActiva: '1', atributos: { ...ATRIBUTOS_VACIOS, areaPrivada: '40' } },
  { id: 'a3', codigo: 'A3', coeficiente: '0.2500000000', fraccionActiva: '1', atributos: { ...ATRIBUTOS_VACIOS, areaPrivada: '60' } },
  { id: 'a4', codigo: 'A4', coeficiente: '0.2500000000', fraccionActiva: '1', atributos: { ...ATRIBUTOS_VACIOS, areaPrivada: '40' } },
]

const INMUEBLES_CON_UNO_SIN_AREA: readonly SnapshotInmueble[] = [
  { id: 'b1', codigo: 'B1', coeficiente: '0.5000000000', fraccionActiva: '1', atributos: { ...ATRIBUTOS_VACIOS, areaPrivada: '100' } },
  { id: 'b2', codigo: 'B2', coeficiente: '0.5000000000', fraccionActiva: '1', atributos: { ...ATRIBUTOS_VACIOS, areaPrivada: null } },
]

function snapshotCon(inmuebles: readonly SnapshotInmueble[], conceptos: readonly SnapshotConcepto[]): DataSnapshot {
  const periodo = { id: 'per-03', anio: 2027, mes: 3 }
  return {
    tenantId: 'tenant-criterio-distribucion',
    moneda: 'COP',
    periodo,
    periodosDelAnio: [periodo],
    inmuebles,
    conceptos,
    presupuestoVigente: null,
    politica: { redondeoModo: 'HALF_UP', redondeoEscala: 0 },
    parametros: {},
    unidades: {},
  }
}

const BASE: Omit<SnapshotConcepto, 'id' | 'codigo' | 'valorFijo' | 'criterioDistribucion'> = {
  modoCalculo: 'distribucion',
  modoValor: 'fijo',
  formulaAel: '',
  prioridad: 0,
  tipoRecurrencia: 'recurrente',
  fechaInicioAnio: 2000,
  fechaInicioMes: 1,
  fechaFinAnio: null,
  fechaFinMes: null,
  periodicidad: 'mensual',
  alcance: 'todos',
  alcanceCondiciones: null,
}

describe('criterioDistribucion=coeficiente (default) — comportamiento histórico intacto', () => {
  it('reparte parejo cuando los coeficientes son iguales, sin importar el área', () => {
    const concepto: SnapshotConcepto = { ...BASE, id: 'c1', codigo: 'ASEO', valorFijo: '100000', criterioDistribucion: 'coeficiente' }
    const [resultado] = ejecutarPlan(snapshotCon(INMUEBLES, [concepto]), [concepto])
    const montos = resultado?.lineas.map((l) => l.monto.amount.toString()).sort()
    expect(montos).toEqual(['25000', '25000', '25000', '25000'])
  })
})

describe('criterioDistribucion=area_privada — pondera por área, no por coeficiente', () => {
  it('con coeficientes iguales pero áreas 60/40/60/40, el reparto sigue el área (30%/20%/30%/20% de 100.000)', () => {
    const concepto: SnapshotConcepto = { ...BASE, id: 'c1', codigo: 'ASEO_AREA', valorFijo: '100000', criterioDistribucion: 'area_privada' }
    const [resultado] = ejecutarPlan(snapshotCon(INMUEBLES, [concepto]), [concepto])
    const porInmueble = new Map(resultado?.lineas.map((l) => [l.inmuebleId, l.monto.amount.toString()]))
    expect(porInmueble.get('a1')).toBe('30000')
    expect(porInmueble.get('a2')).toBe('20000')
    expect(porInmueble.get('a3')).toBe('30000')
    expect(porInmueble.get('a4')).toBe('20000')
  })

  it('un inmueble elegible SIN área diligenciada se excluye y se reporta — no se le asigna área cero en silencio', () => {
    const concepto: SnapshotConcepto = { ...BASE, id: 'c1', codigo: 'ASEO_AREA', valorFijo: '90000', criterioDistribucion: 'area_privada' }
    const [resultado] = ejecutarPlan(snapshotCon(INMUEBLES_CON_UNO_SIN_AREA, [concepto]), [concepto])

    // Todo el monto va al único inmueble con área — b2 no aparece en absoluto.
    expect(resultado?.lineas).toHaveLength(1)
    expect(resultado?.lineas[0]?.inmuebleId).toBe('b1')
    expect(resultado?.lineas[0]?.monto).toEqual(money(90000, 'COP'))

    expect(resultado?.excluidosSinDato).toEqual([{ inmuebleId: 'b2', campos: ['area_privada'] }])
  })

  it('todos los inmuebles elegibles sin área: cero líneas, cuotaPeriodo calculada igual, sin error', () => {
    const soloSinArea: readonly SnapshotInmueble[] = [
      { id: 'x1', codigo: 'X1', coeficiente: '1.0000000000', fraccionActiva: '1', atributos: { ...ATRIBUTOS_VACIOS, areaPrivada: null } },
    ]
    const concepto: SnapshotConcepto = { ...BASE, id: 'c1', codigo: 'ASEO_AREA', valorFijo: '50000', criterioDistribucion: 'area_privada' }
    const [resultado] = ejecutarPlan(snapshotCon(soloSinArea, [concepto]), [concepto])

    expect(resultado?.lineas).toEqual([])
    expect(resultado?.cuotaPeriodo).toEqual(money(50000, 'COP'))
    expect(resultado?.excluidosSinDato).toEqual([{ inmuebleId: 'x1', campos: ['area_privada'] }])
  })
})
