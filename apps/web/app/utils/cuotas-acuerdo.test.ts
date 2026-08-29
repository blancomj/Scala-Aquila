import { describe, expect, it } from 'vitest'
import { generarCuotasAcuerdo } from './cuotas-acuerdo'

describe('generarCuotasAcuerdo', () => {
  it('reparte el saldo (monto_total - cuota_inicial) en partes iguales, residuo en la última', () => {
    const cuotas = generarCuotasAcuerdo({
      montoTotal: 1_000_000,
      cuotaInicial: 100_000,
      numeroCuotas: 3,
      fechaInicio: '2026-01-01',
      fechaFin: '2026-04-01',
    })
    expect(cuotas).toHaveLength(3)
    // 900.000 / 3 = 300.000 exacto, sin residuo.
    expect(cuotas.map((c) => c.monto)).toEqual([300_000, 300_000, 300_000])
    const suma = cuotas.reduce((acc, c) => acc + c.monto, 0)
    expect(suma).toBe(900_000)
  })

  it('el residuo de centavos queda íntegro en la última cuota, no se pierde ni se inventa', () => {
    const cuotas = generarCuotasAcuerdo({
      montoTotal: 100,
      cuotaInicial: 0,
      numeroCuotas: 3,
      fechaInicio: '2026-01-01',
      fechaFin: '2026-04-01',
    })
    // 100 / 3 = 33.33... → 33.33 + 33.33 + 33.34
    expect(cuotas[0]!.monto).toBe(33.33)
    expect(cuotas[1]!.monto).toBe(33.33)
    expect(cuotas[2]!.monto).toBe(33.34)
    const suma = cuotas.reduce((acc, c) => acc + c.monto, 0)
    expect(Math.round(suma * 100) / 100).toBe(100)
  })

  it('la última cuota siempre vence exactamente en fecha_fin', () => {
    const cuotas = generarCuotasAcuerdo({
      montoTotal: 600_000,
      cuotaInicial: 0,
      numeroCuotas: 6,
      fechaInicio: '2026-01-10',
      fechaFin: '2026-07-10',
    })
    expect(cuotas.at(-1)!.fechaVencimiento).toBe('2026-07-10')
    expect(cuotas[0]!.numeroCuota).toBe(1)
    expect(cuotas.at(-1)!.numeroCuota).toBe(6)
  })

  it('las fechas de vencimiento son estrictamente crecientes', () => {
    const cuotas = generarCuotasAcuerdo({
      montoTotal: 500_000,
      cuotaInicial: 0,
      numeroCuotas: 5,
      fechaInicio: '2026-01-01',
      fechaFin: '2026-06-01',
    })
    for (let i = 1; i < cuotas.length; i++) {
      expect(cuotas[i]!.fechaVencimiento > cuotas[i - 1]!.fechaVencimiento).toBe(true)
    }
  })

  it('rechaza una cuota inicial mayor o igual al monto total', () => {
    expect(() =>
      generarCuotasAcuerdo({
        montoTotal: 500_000,
        cuotaInicial: 500_000,
        numeroCuotas: 3,
        fechaInicio: '2026-01-01',
        fechaFin: '2026-04-01',
      }),
    ).toThrow(/cuota inicial/)
  })

  it('rechaza un período más corto que el número de cuotas', () => {
    expect(() =>
      generarCuotasAcuerdo({
        montoTotal: 500_000,
        cuotaInicial: 0,
        numeroCuotas: 10,
        fechaInicio: '2026-01-01',
        fechaFin: '2026-01-05',
      }),
    ).toThrow(/más corto/)
  })
})
