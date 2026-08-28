import { describe, expect, it } from 'vitest'
import { buscarReferenciaEnTexto, evaluarLinea, type LineaAConciliar } from './conciliacion-matching.js'

const LINEA_BASE: LineaAConciliar = {
  monto: 250_000,
  fechaMovimiento: '2027-03-15',
  descripcionBanco: 'TRANSFERENCIA',
  referenciaBanco: null,
}

describe('cascada de matching de conciliación', () => {
  it('un monto negativo nunca es candidato a pago', () => {
    const decision = evaluarLinea({ ...LINEA_BASE, monto: -15_500 }, [], [], [])
    expect(decision.tipo).toBe('no_es_pago')
  })

  it('referencia exacta auto-concilia con score 1', () => {
    const decision = evaluarLinea(
      LINEA_BASE,
      [{ inmuebleId: 'inm-1', coincideExacto: true }],
      [],
      [{ inmuebleId: 'otro', codigo: 'X', similitudNombre: 0.99, montoAproximado: true, diasDeDiferencia: 0 }],
    )
    // Referencia exacta gana incluso si hay un heurístico casi perfecto —
    // el orden de la cascada no es negociable (§6).
    expect(decision).toEqual({ tipo: 'auto', metodo: 'referencia', inmuebleId: 'inm-1', score: 1 })
  })

  it('monto exacto dentro de la ventana de fecha auto-concilia', () => {
    const decision = evaluarLinea(
      LINEA_BASE,
      [],
      [{ inmuebleId: 'inm-2', codigo: 'APT-202', montoCoincide: true, diasDeDiferencia: 2 }],
      [],
    )
    expect(decision).toEqual({ tipo: 'auto', metodo: 'monto_fecha', inmuebleId: 'inm-2', score: 1 })
  })

  it('monto exacto FUERA de la ventana de fecha no auto-concilia', () => {
    const decision = evaluarLinea(
      LINEA_BASE,
      [],
      [{ inmuebleId: 'inm-2', codigo: 'APT-202', montoCoincide: true, diasDeDiferencia: 30 }],
      [],
    )
    expect(decision.tipo).not.toBe('auto')
  })

  it('REGLA DE SEGURIDAD §6.1 — un heurístico con score alto NUNCA auto-aplica', () => {
    const decision = evaluarLinea(
      LINEA_BASE,
      [], // sin referencia
      [], // sin monto+fecha exacto
      [
        {
          inmuebleId: 'inm-3',
          codigo: 'APT-303',
          similitudNombre: 0.98,
          montoAproximado: true,
          diasDeDiferencia: 0,
        },
      ],
    )
    expect(decision.tipo).toBe('propuestas')
    if (decision.tipo === 'propuestas') {
      expect(decision.candidatos[0]?.score).toBeGreaterThan(0.8)
      expect(decision.candidatos[0]?.metodo).toBe('heuristico')
    }
  })

  it('el heurístico ordena las propuestas por score descendente', () => {
    const decision = evaluarLinea(
      LINEA_BASE,
      [],
      [],
      [
        { inmuebleId: 'bajo', codigo: 'A', similitudNombre: 0.45, montoAproximado: false, diasDeDiferencia: 10 },
        { inmuebleId: 'alto', codigo: 'B', similitudNombre: 0.95, montoAproximado: true, diasDeDiferencia: 0 },
      ],
    )
    expect(decision.tipo).toBe('propuestas')
    if (decision.tipo === 'propuestas') {
      expect(decision.candidatos[0]?.inmuebleId).toBe('alto')
    }
  })

  it('un candidato heurístico por debajo del umbral no se propone', () => {
    const decision = evaluarLinea(
      LINEA_BASE,
      [],
      [],
      [{ inmuebleId: 'x', codigo: 'X', similitudNombre: 0.1, montoAproximado: false, diasDeDiferencia: 5 }],
    )
    expect(decision.tipo).toBe('sin_candidato')
  })

  it('dos candidatos de monto+fecha empatados van a propuestas, no a auto', () => {
    const decision = evaluarLinea(
      LINEA_BASE,
      [],
      [
        { inmuebleId: 'a', codigo: 'A', montoCoincide: true, diasDeDiferencia: 1 },
        { inmuebleId: 'b', codigo: 'B', montoCoincide: true, diasDeDiferencia: 1 },
      ],
      [],
    )
    expect(decision.tipo).toBe('propuestas')
    if (decision.tipo === 'propuestas') expect(decision.candidatos).toHaveLength(2)
  })

  it('cada explicación trae al menos un factor con su aporte', () => {
    const decision = evaluarLinea(
      LINEA_BASE,
      [],
      [],
      [{ inmuebleId: 'x', codigo: 'X', similitudNombre: 0.8, montoAproximado: true, diasDeDiferencia: 0 }],
    )
    expect(decision.tipo).toBe('propuestas')
    if (decision.tipo === 'propuestas') {
      const explicacion = decision.candidatos[0]?.explicacion ?? []
      expect(explicacion.length).toBeGreaterThan(0)
      expect(explicacion.every((f) => typeof f.aporte === 'number')).toBe(true)
    }
  })

  it('sin ningún candidato, la línea queda sin_candidato', () => {
    expect(evaluarLinea(LINEA_BASE, [], [], []).tipo).toBe('sin_candidato')
  })
})

describe('buscarReferenciaEnTexto', () => {
  it('encuentra una referencia válida dentro de texto libre', () => {
    const resultado = buscarReferenciaEnTexto('TRANSFERENCIA lareles-apt101-202703-9f3a21b4 concepto')
    expect(resultado?.tenantSlug).toBe('lareles')
    expect(resultado?.codigoInmueble).toBe('apt101')
  })

  it('devuelve null si no hay ninguna referencia parseable', () => {
    expect(buscarReferenciaEnTexto('TRANSFERENCIA SIN REFERENCIA')).toBeNull()
  })
})
