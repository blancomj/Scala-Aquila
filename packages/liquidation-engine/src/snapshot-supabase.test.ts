/**
 * H2 (auditoría externa 2026-08-26, Docs/evaluacion/02) — calcularFraccionActiva():
 * unitario puro, sin Supabase (mismo criterio que temporal.test.ts). Cubre alta a
 * mitad de mes, baja a mitad de mes, mes completo (comportamiento anterior a esta
 * fase, intacto) y los bordes (día 1, último día del mes, febrero).
 */
import { describe, expect, it } from 'vitest'
import { calcularFraccionActiva } from './snapshot-supabase.js'

describe('calcularFraccionActiva', () => {
  it('sin ninguna transición este periodo, retorna "1" (comportamiento de siempre)', () => {
    expect(calcularFraccionActiva(2026, 3, null, null)).toBe('1')
  })

  it('activo_desde de un periodo anterior no cuenta como transición de este periodo', () => {
    expect(calcularFraccionActiva(2026, 3, '2026-01-15', null)).toBe('1')
  })

  it('alta a mitad de mes (marzo, 31 días): activo desde el 20 → 12/31', () => {
    // 20,21,...,31 = 12 días.
    expect(calcularFraccionActiva(2026, 3, '2026-03-20', null)).toBe('0.3870967741935483870967741935483871')
  })

  it('alta el primer día del mes equivale a mes completo', () => {
    expect(calcularFraccionActiva(2026, 3, '2026-03-01', null)).toBe('1')
  })

  it('baja a mitad de mes (marzo): inactivo desde el 16 → activo hasta el 15, 15/31', () => {
    expect(calcularFraccionActiva(2026, 3, null, '2026-03-16')).toBe('0.4838709677419354838709677419354839')
  })

  it('baja el primer día del mes: cero días activos', () => {
    expect(calcularFraccionActiva(2026, 3, null, '2026-03-01')).toBe('0')
  })

  it('respeta el largo real del mes (febrero no bisiesto = 28 días)', () => {
    // activo desde el 15 → 14/28 = 0.5 exacto.
    expect(calcularFraccionActiva(2026, 2, '2026-02-15', null)).toBe('0.5')
  })

  it('activo_desde y inactivo_desde ambos dentro del mismo periodo (alta y baja el mismo mes)', () => {
    // activo 10..20 = 11 días de 31.
    expect(calcularFraccionActiva(2026, 3, '2026-03-10', '2026-03-21')).toBe('0.3548387096774193548387096774193548')
  })
})
