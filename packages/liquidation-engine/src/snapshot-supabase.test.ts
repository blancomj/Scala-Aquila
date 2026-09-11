/**
 * H2 (auditoría externa 2026-08-26, Docs/evaluacion/02) — calcularFraccionActiva():
 * unitario puro, sin Supabase (mismo criterio que temporal.test.ts). Cubre alta a
 * mitad de mes, baja a mitad de mes, mes completo (comportamiento anterior a esta
 * fase, intacto) y los bordes (día 1, último día del mes, febrero).
 */
import { describe, expect, it } from 'vitest'
import { calcularFraccionActiva, construirRutasAgrupacion } from './snapshot-supabase.js'

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

/** ADC-01 — la ruta de ancestros es lo que permite que "sector comercial"
 * alcance a un local que cuelga de un nivel dos escalones más abajo. */
describe('construirRutasAgrupacion', () => {
  it('una raíz es su propia ruta', () => {
    const rutas = construirRutasAgrupacion([{ id: 'torre-a', parent_id: null }])
    expect(rutas.get('torre-a')).toEqual(['torre-a'])
  })

  it('ordena la ruta de raíz a hoja, con todos los ancestros intermedios', () => {
    const rutas = construirRutasAgrupacion([
      { id: 'nivel-1', parent_id: 'bloque-1' },
      { id: 'sector-com', parent_id: null },
      { id: 'bloque-1', parent_id: 'sector-com' },
    ])
    expect(rutas.get('nivel-1')).toEqual(['sector-com', 'bloque-1', 'nivel-1'])
    expect(rutas.get('bloque-1')).toEqual(['sector-com', 'bloque-1'])
  })

  it('ramas hermanas no comparten ancestros entre sí', () => {
    const rutas = construirRutasAgrupacion([
      { id: 'raiz', parent_id: null },
      { id: 'a', parent_id: 'raiz' },
      { id: 'b', parent_id: 'raiz' },
    ])
    expect(rutas.get('a')).toEqual(['raiz', 'a'])
    expect(rutas.get('b')).toEqual(['raiz', 'b'])
  })

  it('un padre ausente corta la ruta en vez de lanzar (el tenant debe poder liquidar igual)', () => {
    const rutas = construirRutasAgrupacion([{ id: 'huerfano', parent_id: 'no-existe' }])
    expect(rutas.get('huerfano')).toEqual(['huerfano'])
  })

  it('un ciclo no cuelga la construcción', () => {
    const rutas = construirRutasAgrupacion([
      { id: 'x', parent_id: 'y' },
      { id: 'y', parent_id: 'x' },
    ])
    expect(rutas.get('x')).toHaveLength(2)
  })
})
