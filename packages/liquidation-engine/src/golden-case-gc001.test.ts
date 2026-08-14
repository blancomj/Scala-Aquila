/**
 * Reproduce GC-001 de punta a punta (paso0/INFORME_PASO_0.md §3.1-3.3) a
 * través del motor completo: grafo → plan → ejecución (PLAN §6.5, doble
 * reparto anual→periodo→inmueble) → resultado reconciliado → resultHash.
 *
 * DataSnapshot construido a mano (mismo patrón que
 * ael-runtime/golden-case-gc001.test.ts) — no depende de Supabase.
 */
import { money } from '@aquila/financial-kernel'
import { describe, expect, it } from 'vitest'
import { liquidar } from './liquidar.js'
import type { DataSnapshot } from './snapshot.js'

const CUOTA_BASICA_AEL = [
  'REGLA CUOTA_BASICA',
  'DEFINIR presupuesto_anual = PARAMETER.PRESUPUESTO_ANUAL',
  'DEFINIR otros_ingresos_anual = PARAMETER.OTROS_INGRESOS_ANUAL',
  'RETORNAR presupuesto_anual - otros_ingresos_anual',
].join('\n')

function snapshotGC001(mes: number): DataSnapshot {
  const periodosDelAnio = Array.from({ length: 12 }, (_, i) => ({
    id: `per-${String(i + 1).padStart(2, '0')}`,
    anio: 2026,
    mes: i + 1,
  }))

  return {
    tenantId: 'tenant-gc001',
    moneda: 'COP',
    periodo: periodosDelAnio[mes - 1]!,
    periodosDelAnio,
    inmuebles: [
      { id: 'inm-101', codigo: 'INM-101', coeficiente: '0.1500000000' },
      { id: 'inm-102', codigo: 'INM-102', coeficiente: '0.1500000000' },
      { id: 'inm-201', codigo: 'INM-201', coeficiente: '0.1650000000' },
      { id: 'inm-202', codigo: 'INM-202', coeficiente: '0.1650000000' },
      { id: 'inm-301', codigo: 'INM-301', coeficiente: '0.1850000000' },
      { id: 'inm-302', codigo: 'INM-302', coeficiente: '0.1850000000' },
    ],
    conceptos: [
      {
        id: 'concepto-cuota-admin',
        codigo: 'CUOTA_ADMIN',
        modoCalculo: 'distribucion',
        formulaAel: CUOTA_BASICA_AEL,
        prioridad: 100,
      },
    ],
    presupuestoVigente: { id: 'presupuesto-2026', anio: 2026, montoTotal: '120000000' },
    politica: { redondeoModo: 'HALF_UP', redondeoEscala: 0 },
    parametros: {
      PRESUPUESTO_ANUAL: { tipo: 'MONEY', valor: money(120_000_000, 'COP') },
      OTROS_INGRESOS_ANUAL: { tipo: 'MONEY', valor: money(20_000_000, 'COP') },
    },
    unidades: {},
  }
}

describe('GC-001 — liquidación de enero (paso0/INFORME_PASO_0.md §3.2-3.3)', () => {
  it('reparte 100.000.000 en 12 periodos: enero recibe 8.333.334 COP', () => {
    const { resultado } = liquidar(snapshotGC001(1))
    // R7: 4 × 8.333.334 + 8 × 8.333.333 = 100.000.000 — enero es uno de los 4 primeros.
    expect(resultado.tenantTotal.amount.toString()).toBe('8333334')
  })

  it('reparte la cuota de enero entre los 6 inmuebles exactamente como el informe', () => {
    const snapshot = snapshotGC001(1)
    const { resultado } = liquidar(snapshot)
    const porCodigo = new Map(
      resultado.lineas.map((l) => [
        snapshot.inmuebles.find((i) => i.id === l.inmuebleId)?.codigo,
        l.monto.amount.toString(),
      ]),
    )
    expect(porCodigo.get('INM-101')).toBe('1250000')
    expect(porCodigo.get('INM-102')).toBe('1250000')
    expect(porCodigo.get('INM-201')).toBe('1375000')
    expect(porCodigo.get('INM-202')).toBe('1375000')
    expect(porCodigo.get('INM-301')).toBe('1541667')
    expect(porCodigo.get('INM-302')).toBe('1541667')
  })

  it('R4: tenantTotal = Σ totalInmueble, exacto sin epsilon', () => {
    const { resultado } = liquidar(snapshotGC001(1))
    const sumaInmuebles = resultado.totalesPorInmueble.reduce(
      (acc, t) => acc + Number(t.total.amount.toString()),
      0,
    )
    expect(sumaInmuebles).toBe(Number(resultado.tenantTotal.amount.toString()))
  })

  it('mayo recibe 8.333.333 (sin el peso extra del residual)', () => {
    const { resultado } = liquidar(snapshotGC001(5))
    expect(resultado.tenantTotal.amount.toString()).toBe('8333333')
  })

  it('resultHash es determinista: mismo snapshot ⇒ mismo hash (PLAN §5.4)', () => {
    const a = liquidar(snapshotGC001(1))
    const b = liquidar(snapshotGC001(1))
    expect(a.resultHash).toBe(b.resultHash)
    expect(a.resultHash).toHaveLength(64) // sha256 hex
  })

  it('resultHash cambia si el periodo liquidado cambia', () => {
    const enero = liquidar(snapshotGC001(1))
    const mayo = liquidar(snapshotGC001(5))
    expect(enero.resultHash).not.toBe(mayo.resultHash)
  })
})
