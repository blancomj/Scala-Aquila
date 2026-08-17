import { describe, expect, it } from 'vitest'
import { money } from '@aquila/financial-kernel'
import { calcularDashboardCartera, type FilaDashboardCartera } from './cartera-dashboard.js'

function fila(over: Partial<FilaDashboardCartera> & { inmuebleId: string }): FilaDashboardCartera {
  return {
    deudaTotal: money(0, 'COP'),
    deudaVencida: money(0, 'COP'),
    interesCausado: money(0, 'COP'),
    saldoCredito: money(0, 'COP'),
    diasMoraMaximo: 0,
    etapaCobranza: 'preventiva',
    ...over,
  }
}

describe('calcularDashboardCartera', () => {
  it('portafolio vacío: todo en cero, los 8 tramos con cantidad 0', () => {
    const resultado = calcularDashboardCartera([], 'COP')
    expect(resultado.tarjetas.carteraTotal).toEqual(money(0, 'COP'))
    expect(resultado.tarjetas.carteraVencida).toEqual(money(0, 'COP'))
    expect(resultado.tarjetas.carteraCorriente).toEqual(money(0, 'COP'))
    expect(resultado.antiguedad).toHaveLength(8)
    for (const tramo of resultado.antiguedad) {
      expect(tramo.cantidadInmuebles).toBe(0)
      expect(tramo.monto).toEqual(money(0, 'COP'))
      expect(tramo.pctDelTotal).toBe(0)
    }
  })

  it('un inmueble al día: cae en AL_DIA con monto 0, su saldo va a CARTERA_CORRIENTE', () => {
    const resultado = calcularDashboardCartera(
      [
        fila({
          inmuebleId: 'i1',
          deudaTotal: money(300_000, 'COP'),
          deudaVencida: money(0, 'COP'),
          diasMoraMaximo: 0,
        }),
      ],
      'COP',
    )
    expect(resultado.tarjetas.carteraTotal).toEqual(money(300_000, 'COP'))
    expect(resultado.tarjetas.carteraVencida).toEqual(money(0, 'COP'))
    expect(resultado.tarjetas.carteraCorriente).toEqual(money(300_000, 'COP'))

    const alDia = resultado.antiguedad.find((t) => t.codigo === 'AL_DIA')
    expect(alDia?.cantidadInmuebles).toBe(1)
    expect(alDia?.monto).toEqual(money(0, 'COP'))
  })

  it('bordes de tramo: 30→MORA_TEMPRANA, 31→MORA_INICIAL, 90→MORA_MEDIA, 91→MORA_AVANZADA, 360→ALTO_RIESGO, 361→CRITICA', () => {
    const casos: { dias: number; esperado: string }[] = [
      { dias: 1, esperado: 'MORA_TEMPRANA' },
      { dias: 30, esperado: 'MORA_TEMPRANA' },
      { dias: 31, esperado: 'MORA_INICIAL' },
      { dias: 60, esperado: 'MORA_INICIAL' },
      { dias: 61, esperado: 'MORA_MEDIA' },
      { dias: 90, esperado: 'MORA_MEDIA' },
      { dias: 91, esperado: 'MORA_AVANZADA' },
      { dias: 120, esperado: 'MORA_AVANZADA' },
      { dias: 121, esperado: 'MORA_CRITICA' },
      { dias: 180, esperado: 'MORA_CRITICA' },
      { dias: 181, esperado: 'ALTO_RIESGO' },
      { dias: 360, esperado: 'ALTO_RIESGO' },
      { dias: 361, esperado: 'CRITICA' },
      { dias: 1000, esperado: 'CRITICA' },
    ]
    for (const { dias, esperado } of casos) {
      const resultado = calcularDashboardCartera(
        [fila({ inmuebleId: 'i1', deudaVencida: money(100_000, 'COP'), deudaTotal: money(100_000, 'COP'), diasMoraMaximo: dias })],
        'COP',
      )
      const tramo = resultado.antiguedad.find((t) => t.cantidadInmuebles === 1)
      expect(tramo?.codigo, `${String(dias)} días debería caer en ${esperado}`).toBe(esperado)
    }
  })

  it('CARTERA_MAYOR_90/180: estrictamente mayor, el borde exacto queda excluido', () => {
    const resultado = calcularDashboardCartera(
      [
        fila({ inmuebleId: 'i90', deudaVencida: money(100, 'COP'), deudaTotal: money(100, 'COP'), diasMoraMaximo: 90 }),
        fila({ inmuebleId: 'i91', deudaVencida: money(200, 'COP'), deudaTotal: money(200, 'COP'), diasMoraMaximo: 91 }),
        fila({ inmuebleId: 'i180', deudaVencida: money(300, 'COP'), deudaTotal: money(300, 'COP'), diasMoraMaximo: 180 }),
        fila({ inmuebleId: 'i181', deudaVencida: money(400, 'COP'), deudaTotal: money(400, 'COP'), diasMoraMaximo: 181 }),
      ],
      'COP',
    )
    // >90: i91 (200) + i180 (300) + i181 (400) = 900 — i90 (exactamente 90) queda fuera.
    expect(resultado.tarjetas.carteraMayor90).toEqual(money(900, 'COP'))
    // >180: i181 (400) — i180 (exactamente 180) queda fuera.
    expect(resultado.tarjetas.carteraMayor180).toEqual(money(400, 'COP'))
  })

  it('CARTERA_PREJURIDICA/CARTERA_JURIDICA se agrupan por etapa_cobranza gobernada, no por clasificación', () => {
    const resultado = calcularDashboardCartera(
      [
        fila({ inmuebleId: 'ip', deudaVencida: money(1_000, 'COP'), deudaTotal: money(1_000, 'COP'), etapaCobranza: 'prejuridica' }),
        fila({ inmuebleId: 'ij1', deudaVencida: money(2_000, 'COP'), deudaTotal: money(2_000, 'COP'), etapaCobranza: 'juridica' }),
        fila({ inmuebleId: 'ij2', deudaVencida: money(3_000, 'COP'), deudaTotal: money(3_000, 'COP'), etapaCobranza: 'judicial' }),
        fila({ inmuebleId: 'ia', deudaVencida: money(4_000, 'COP'), deudaTotal: money(4_000, 'COP'), etapaCobranza: 'administrativa' }),
      ],
      'COP',
    )
    expect(resultado.tarjetas.carteraPrejuridica).toEqual(money(1_000, 'COP'))
    expect(resultado.tarjetas.carteraJuridica).toEqual(money(5_000, 'COP')) // juridica + judicial
  })

  it('saldosAFavor suma saldo_credito de todo el portafolio', () => {
    const resultado = calcularDashboardCartera(
      [
        fila({ inmuebleId: 'i1', saldoCredito: money(50_000, 'COP') }),
        fila({ inmuebleId: 'i2', saldoCredito: money(25_000, 'COP') }),
      ],
      'COP',
    )
    expect(resultado.tarjetas.saldosAFavor).toEqual(money(75_000, 'COP'))
  })

  it('interesesCausados suma TODOS los cargos de interés, vencidos o no (no filtra por diasMoraMaximo)', () => {
    const resultado = calcularDashboardCartera(
      [fila({ inmuebleId: 'i1', interesCausado: money(12_345, 'COP'), diasMoraMaximo: 0, deudaVencida: money(0, 'COP') })],
      'COP',
    )
    expect(resultado.tarjetas.interesesCausados).toEqual(money(12_345, 'COP'))
  })

  it('pctDelTotal de los 8 tramos suma 100% cuando hay cartera vencida', () => {
    const resultado = calcularDashboardCartera(
      [
        fila({ inmuebleId: 'i1', deudaVencida: money(300, 'COP'), deudaTotal: money(300, 'COP'), diasMoraMaximo: 10 }),
        fila({ inmuebleId: 'i2', deudaVencida: money(700, 'COP'), deudaTotal: money(700, 'COP'), diasMoraMaximo: 100 }),
      ],
      'COP',
    )
    const sumaPct = resultado.antiguedad.reduce((acc, t) => acc + t.pctDelTotal, 0)
    expect(sumaPct).toBeCloseTo(100, 6)
  })
})
