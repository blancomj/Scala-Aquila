import { describe, expect, it } from 'vitest'
import { explicarAlertaLiquidez, type AlertaLiquidezEmitida } from './explicacion.js'

function alerta(over: Partial<AlertaLiquidezEmitida> & { tipoCodigo: string }): AlertaLiquidezEmitida {
  return {
    nombreRegla: 'Regla de prueba',
    fechaEmision: '2026-09-13',
    detalle: {},
    ...over,
  }
}

describe('explicarAlertaLiquidez', () => {
  it('cada afirmación resuelve su evidencia a finanzas_alerta_emitida con la fecha de emisión', () => {
    const afirmaciones = explicarAlertaLiquidez(
      alerta({ tipoCodigo: 'saldo_30d_negativo', detalle: { saldo_acumulado_30d: -50_000 } }),
    )
    expect(afirmaciones).toHaveLength(1)
    expect(afirmaciones[0]?.evidencia).toEqual({
      entidad: 'finanzas_alerta_emitida',
      id: null,
      fuente: 'finanzas_alertas_evaluar',
      fechaCorte: '2026-09-13',
    })
  })

  it('saldo_30d_bajo_umbral: "calculo", con saldo y umbral en el texto', () => {
    const [a] = explicarAlertaLiquidez(
      alerta({
        tipoCodigo: 'saldo_30d_bajo_umbral',
        nombreRegla: 'Saldo mínimo',
        detalle: { saldo_acumulado_30d: 1_000_000, umbral: 2_000_000 },
      }),
    )
    expect(a?.tipo).toBe('calculo')
    expect(a?.texto).toContain('1000000')
    expect(a?.texto).toContain('2000000')
    expect(a?.texto).toContain('Saldo mínimo')
  })

  it('saldo_30d_negativo: "calculo"', () => {
    const [a] = explicarAlertaLiquidez(
      alerta({ tipoCodigo: 'saldo_30d_negativo', detalle: { saldo_acumulado_30d: -10_000 } }),
    )
    expect(a?.tipo).toBe('calculo')
    expect(a?.texto).toContain('-10000')
  })

  it('flujo_neto_negativo_n_semanas: "inferencia" — se deriva de contar semanas, no es un solo dato', () => {
    const [a] = explicarAlertaLiquidez(
      alerta({
        tipoCodigo: 'flujo_neto_negativo_n_semanas',
        detalle: { semanas_negativas: 5, umbral_semanas: 4 },
      }),
    )
    expect(a?.tipo).toBe('inferencia')
    expect(a?.texto).toContain('5 semanas')
  })

  it('cxp_vencida_sin_lote: "calculo"', () => {
    const [a] = explicarAlertaLiquidez(
      alerta({
        tipoCodigo: 'cxp_vencida_sin_lote',
        detalle: { cxp_vencida_sin_lote: 300_000, umbral: 100_000 },
      }),
    )
    expect(a?.tipo).toBe('calculo')
  })

  it('cartera_vencida_deteriorando: "inferencia" — compara dos meses, como el titular de cartera', () => {
    const [a] = explicarAlertaLiquidez(
      alerta({
        tipoCodigo: 'cartera_vencida_deteriorando',
        detalle: { deuda_vencida_actual: 500_000, deuda_vencida_anterior: 300_000 },
      }),
    )
    expect(a?.tipo).toBe('inferencia')
    expect(a?.texto).toContain('300000')
    expect(a?.texto).toContain('500000')
  })

  it('detalle incompleto: "informacion_insuficiente", nunca lanza ni inventa el valor faltante', () => {
    const afirmaciones = explicarAlertaLiquidez(
      alerta({ tipoCodigo: 'saldo_30d_bajo_umbral', detalle: { saldo_acumulado_30d: 1_000_000 } }),
    )
    expect(afirmaciones).toHaveLength(1)
    expect(afirmaciones[0]?.tipo).toBe('informacion_insuficiente')
  })

  it('tipo de regla desconocido: "informacion_insuficiente", no lanza excepción', () => {
    const afirmaciones = explicarAlertaLiquidez(alerta({ tipoCodigo: 'algo_que_no_existe' }))
    expect(afirmaciones).toHaveLength(1)
    expect(afirmaciones[0]?.tipo).toBe('informacion_insuficiente')
  })

  it('no expone JSON crudo del detalle en ninguna afirmación', () => {
    const afirmaciones = explicarAlertaLiquidez(
      alerta({
        tipoCodigo: 'cartera_vencida_deteriorando',
        detalle: { deuda_vencida_actual: 500_000, deuda_vencida_anterior: 300_000 },
      }),
    )
    for (const a of afirmaciones) {
      expect(a.texto).not.toMatch(/[{}[\]]/)
    }
  })
})
