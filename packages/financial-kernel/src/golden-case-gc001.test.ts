/**
 * Golden Case GC-001 — paso0/INFORME_PASO_0.md §3.
 *
 * Reproduce los dos pasos de redondeo encadenado calculados a mano:
 *   Paso 1: presupuesto anual → 12 cuotas mensuales (equalShare, PLAN §6.5, R7)
 *   Paso 2: cuota de enero → 6 inmuebles por coeficiente (coefficient, R1)
 *
 * Esta es la evidencia real exigida por el Definition of Done (PLAN §9.1):
 * no "debería funcionar" — reproduce los importes firmados en el informe.
 *
 * ⚠ GC-001 sigue PENDIENTE DE FIRMA del responsable funcional
 * (paso0/INFORME_PASO_0.md §3.5). Este test valida que el motor reproduce
 * el cálculo a mano; no sustituye esa firma.
 */
import { describe, expect, it } from 'vitest'
import { allocate } from './allocation.js'
import { money } from './money.js'

const POLICY = { modo: 'HALF_UP', escala: 0 } as const

describe('GC-001 · Paso 1 — presupuesto anual → 12 cuotas mensuales (R7)', () => {
  const periodos = [
    'P01',
    'P02',
    'P03',
    'P04',
    'P05',
    'P06',
    'P07',
    'P08',
    'P09',
    'P10',
    'P11',
    'P12',
  ].map((id) => ({ id }))

  const resultado = allocate({
    basisType: 'equalShare',
    sourceAmount: money(100_000_000, 'COP'),
    targets: periodos,
    policy: POLICY,
  })

  it('enero a abril reciben la cuota con el peso extra del residual', () => {
    for (const id of ['P01', 'P02', 'P03', 'P04']) {
      const entrada = resultado.entries.find((e) => e.targetId === id)!
      expect(entrada.allocatedAmount.amount.toString()).toBe('8333334')
    }
  })

  it('mayo a diciembre reciben la cuota base', () => {
    for (const id of ['P05', 'P06', 'P07', 'P08', 'P09', 'P10', 'P11', 'P12']) {
      const entrada = resultado.entries.find((e) => e.targetId === id)!
      expect(entrada.allocatedAmount.amount.toString()).toBe('8333333')
    }
  })

  it('R7: la suma de las 12 cuotas mensuales es exactamente el presupuesto anual', () => {
    const suma = resultado.entries.reduce((acc, e) => acc + e.allocatedAmount.amount.toNumber(), 0)
    expect(suma).toBe(100_000_000)
  })
})

describe('GC-001 · Paso 2 — cuota de enero → 6 inmuebles por coeficiente (R1, R6)', () => {
  const inmuebles = [
    { id: 'INM-101', basis: '0.15' },
    { id: 'INM-102', basis: '0.15' },
    { id: 'INM-201', basis: '0.165' },
    { id: 'INM-202', basis: '0.165' },
    { id: 'INM-301', basis: '0.185' },
    { id: 'INM-302', basis: '0.185' },
  ]

  const resultado = allocate({
    basisType: 'coefficient',
    sourceAmount: money(8_333_334, 'COP'),
    targets: inmuebles,
    policy: POLICY,
  })

  const porId = Object.fromEntries(
    resultado.entries.map((e) => [e.targetId, e.allocatedAmount.amount.toNumber()]),
  )

  it('reproduce exactamente los importes firmados en el informe', () => {
    expect(porId).toEqual({
      'INM-101': 1_250_000,
      'INM-102': 1_250_000,
      'INM-201': 1_375_000,
      'INM-202': 1_375_000,
      'INM-301': 1_541_667,
      'INM-302': 1_541_667,
    })
  })

  it('el residual de 2 pesos va a INM-301 e INM-302 (mayor remanente, 19 §29-30)', () => {
    // exacto: 1.541.666,79 en ambos → floor 1.541.666 → +1 por residual
    expect(porId['INM-301']).toBe(1_541_667)
    expect(porId['INM-302']).toBe(1_541_667)
  })

  it('R1: la suma de las asignaciones es exactamente la fuente', () => {
    const suma = resultado.entries.reduce((acc, e) => acc + e.allocatedAmount.amount.toNumber(), 0)
    expect(suma).toBe(8_333_334)
  })

  it('R6 (estructural): ninguna zona común aparece como target — el request nunca la incluyó', () => {
    expect(resultado.entries.map((e) => e.targetId)).not.toContain('ZC-001')
  })
})
