/**
 * Fase 5 (alcance.ts) — cobertura directa de inmuebleCumpleCondiciones():
 * hojas, grupos AND/OR, anidados, campos categóricos vs. numéricos, campo
 * ausente, coeficiente (aparte de AtributosInmueble), mes/año actual
 * (contexto del periodo, no del inmueble).
 */
import { describe, expect, it } from 'vitest'
import {
  evaluarAlcance,
  inmuebleCumpleCondiciones,
  type AtributosInmueble,
  type ContextoAlcance,
} from './alcance.js'

const CONTEXTO: ContextoAlcance = { mesActual: 3, anioActual: 2027 }

function atributos(over: Partial<AtributosInmueble> = {}): AtributosInmueble {
  return {
    estadoLegal: null,
    habitabilidad: null,
    areaPrivada: null,
    tipoPropietario: null,
    tipoInquilino: null,
    usoPredio: null,
    saldoActual: null,
    tipoInmueble: null,
    agrupacionRuta: null,
    ...over,
  }
}

describe('inmuebleCumpleCondiciones — hojas', () => {
  it('categórico eq: cumple cuando el código coincide', () => {
    const condicion = { campo: 'estado_legal', operador: 'eq', valor: 'litigio' } as const
    expect(inmuebleCumpleCondiciones(condicion, atributos({ estadoLegal: 'litigio' }), CONTEXTO, '0.1')).toBe(true)
    expect(inmuebleCumpleCondiciones(condicion, atributos({ estadoLegal: 'normal' }), CONTEXTO, '0.1')).toBe(false)
  })

  it('categórico neq: cumple cuando el código NO coincide', () => {
    const condicion = { campo: 'uso_predio', operador: 'neq', valor: 'comercial' } as const
    expect(inmuebleCumpleCondiciones(condicion, atributos({ usoPredio: 'residencial' }), CONTEXTO, '0.1')).toBe(true)
    expect(inmuebleCumpleCondiciones(condicion, atributos({ usoPredio: 'comercial' }), CONTEXTO, '0.1')).toBe(false)
  })

  it('categórico con gt/gte/lt/lte: nunca cumple (no tienen orden)', () => {
    const condicion = { campo: 'tipo_inquilino', operador: 'gt', valor: 'natural' } as const
    expect(inmuebleCumpleCondiciones(condicion, atributos({ tipoInquilino: 'juridica' }), CONTEXTO, '0.1')).toBe(
      false,
    )
  })

  it('numérico: area_privada con los 4 operadores de orden', () => {
    const atr = atributos({ areaPrivada: '80' })
    expect(inmuebleCumpleCondiciones({ campo: 'area_privada', operador: 'gt', valor: 50 }, atr, CONTEXTO, '0.1')).toBe(
      true,
    )
    expect(inmuebleCumpleCondiciones({ campo: 'area_privada', operador: 'gte', valor: 80 }, atr, CONTEXTO, '0.1')).toBe(
      true,
    )
    expect(inmuebleCumpleCondiciones({ campo: 'area_privada', operador: 'lt', valor: 80 }, atr, CONTEXTO, '0.1')).toBe(
      false,
    )
    expect(inmuebleCumpleCondiciones({ campo: 'area_privada', operador: 'lte', valor: 80 }, atr, CONTEXTO, '0.1')).toBe(
      true,
    )
  })

  it('coeficiente viene del parámetro aparte, no de AtributosInmueble', () => {
    const condicion = { campo: 'coeficiente', operador: 'gte', valor: 0.15 } as const
    expect(inmuebleCumpleCondiciones(condicion, atributos(), CONTEXTO, '0.1500000000')).toBe(true)
    expect(inmuebleCumpleCondiciones(condicion, atributos(), CONTEXTO, '0.1000000000')).toBe(false)
  })

  it('mes_actual/anio_actual leen el contexto del periodo, no atributos del inmueble', () => {
    expect(
      inmuebleCumpleCondiciones({ campo: 'mes_actual', operador: 'eq', valor: 3 }, atributos(), CONTEXTO, '0.1'),
    ).toBe(true)
    expect(
      inmuebleCumpleCondiciones({ campo: 'anio_actual', operador: 'eq', valor: 2027 }, atributos(), CONTEXTO, '0.1'),
    ).toBe(true)
    expect(
      inmuebleCumpleCondiciones({ campo: 'anio_actual', operador: 'eq', valor: 2026 }, atributos(), CONTEXTO, '0.1'),
    ).toBe(false)
  })

  it('campo ausente (null) nunca cumple, sin importar el operador — 17 §37', () => {
    expect(
      inmuebleCumpleCondiciones({ campo: 'saldo_actual', operador: 'gt', valor: 0 }, atributos(), CONTEXTO, '0.1'),
    ).toBe(false)
    expect(
      inmuebleCumpleCondiciones({ campo: 'tipo_propietario', operador: 'eq', valor: 'natural' }, atributos(), CONTEXTO, '0.1'),
    ).toBe(false)
  })
})

describe('inmuebleCumpleCondiciones — grupos', () => {
  it('AND: cumple solo si TODAS las hojas cumplen', () => {
    const condicion = {
      op: 'and',
      condiciones: [
        { campo: 'uso_predio', operador: 'eq', valor: 'residencial' },
        { campo: 'area_privada', operador: 'gt', valor: 50 },
      ],
    } as const
    expect(
      inmuebleCumpleCondiciones(condicion, atributos({ usoPredio: 'residencial', areaPrivada: '80' }), CONTEXTO, '0.1'),
    ).toBe(true)
    expect(
      inmuebleCumpleCondiciones(condicion, atributos({ usoPredio: 'comercial', areaPrivada: '80' }), CONTEXTO, '0.1'),
    ).toBe(false)
  })

  it('OR: cumple si AL MENOS UNA hoja cumple', () => {
    const condicion = {
      op: 'or',
      condiciones: [
        { campo: 'tipo_inquilino', operador: 'eq', valor: 'juridica' },
        { campo: 'tipo_propietario', operador: 'eq', valor: 'juridica' },
      ],
    } as const
    expect(inmuebleCumpleCondiciones(condicion, atributos({ tipoInquilino: 'juridica' }), CONTEXTO, '0.1')).toBe(true)
    expect(
      inmuebleCumpleCondiciones(condicion, atributos({ tipoInquilino: 'natural', tipoPropietario: 'natural' }), CONTEXTO, '0.1'),
    ).toBe(false)
  })

  it('grupos anidados: (A OR B) AND C', () => {
    const condicion = {
      op: 'and',
      condiciones: [
        {
          op: 'or',
          condiciones: [
            { campo: 'uso_predio', operador: 'eq', valor: 'comercial' },
            { campo: 'uso_predio', operador: 'eq', valor: 'industrial' },
          ],
        },
        { campo: 'estado_legal', operador: 'neq', valor: 'litigio' },
      ],
    } as const
    expect(
      inmuebleCumpleCondiciones(condicion, atributos({ usoPredio: 'comercial', estadoLegal: 'normal' }), CONTEXTO, '0.1'),
    ).toBe(true)
    expect(
      inmuebleCumpleCondiciones(condicion, atributos({ usoPredio: 'comercial', estadoLegal: 'litigio' }), CONTEXTO, '0.1'),
    ).toBe(false)
    expect(
      inmuebleCumpleCondiciones(condicion, atributos({ usoPredio: 'residencial', estadoLegal: 'normal' }), CONTEXTO, '0.1'),
    ).toBe(false)
  })
})

/** ADC-01 — los dos campos que hacían inexpresables los casos comerciales:
 * "solo los locales" (tipo, no uso) y "solo el sector comercial" (un ANCESTRO
 * del inmueble, no su agrupación directa). */
describe('ADC-01 — tipo_inmueble', () => {
  it('distingue el tipo del uso: un local con uso residencial sigue siendo local', () => {
    const atr = atributos({ tipoInmueble: 'local', usoPredio: 'residencial' })
    expect(
      inmuebleCumpleCondiciones({ campo: 'tipo_inmueble', operador: 'eq', valor: 'local' }, atr, CONTEXTO, '0.1'),
    ).toBe(true)
    expect(
      inmuebleCumpleCondiciones({ campo: 'uso_predio', operador: 'eq', valor: 'comercial' }, atr, CONTEXTO, '0.1'),
    ).toBe(false)
  })

  it('es categórico: gt/gte/lt/lte nunca cumplen', () => {
    const atr = atributos({ tipoInmueble: 'bodega' })
    expect(
      inmuebleCumpleCondiciones({ campo: 'tipo_inmueble', operador: 'gt', valor: 'apartamento' }, atr, CONTEXTO, '0.1'),
    ).toBe(false)
  })

  it('neq excluye un tipo: "todos menos los parqueaderos"', () => {
    const condicion = { campo: 'tipo_inmueble', operador: 'neq', valor: 'parqueadero' } as const
    expect(inmuebleCumpleCondiciones(condicion, atributos({ tipoInmueble: 'local' }), CONTEXTO, '0.1')).toBe(true)
    expect(inmuebleCumpleCondiciones(condicion, atributos({ tipoInmueble: 'parqueadero' }), CONTEXTO, '0.1')).toBe(false)
  })
})

describe('ADC-01 — agrupacion (pertenencia al subárbol)', () => {
  // Sector Comercial → Bloque 1 → Nivel 2 → Local. El local cuelga del NIVEL:
  // su agrupacion_id nunca es el sector, y aun así debe pertenecer a él.
  const RUTA_LOCAL = ['sector-com', 'bloque-1', 'nivel-2'] as const
  const RUTA_APTO = ['torre-a', 'piso-5'] as const

  it('cumple contra un ancestro lejano, no solo contra la agrupación directa', () => {
    const atr = atributos({ agrupacionRuta: RUTA_LOCAL })
    const condicion = { campo: 'agrupacion', operador: 'eq', valor: 'sector-com' } as const
    expect(inmuebleCumpleCondiciones(condicion, atr, CONTEXTO, '0.1')).toBe(true)
  })

  it('cumple también contra la agrupación directa (la hoja de la ruta)', () => {
    const atr = atributos({ agrupacionRuta: RUTA_LOCAL })
    expect(
      inmuebleCumpleCondiciones({ campo: 'agrupacion', operador: 'eq', valor: 'nivel-2' }, atr, CONTEXTO, '0.1'),
    ).toBe(true)
  })

  it('no cumple contra una agrupación de otra rama del árbol', () => {
    const atr = atributos({ agrupacionRuta: RUTA_APTO })
    expect(
      inmuebleCumpleCondiciones({ campo: 'agrupacion', operador: 'eq', valor: 'sector-com' }, atr, CONTEXTO, '0.1'),
    ).toBe(false)
  })

  it('neq excluye el subárbol completo: "todo menos la Torre A"', () => {
    const condicion = { campo: 'agrupacion', operador: 'neq', valor: 'torre-a' } as const
    expect(inmuebleCumpleCondiciones(condicion, atributos({ agrupacionRuta: RUTA_LOCAL }), CONTEXTO, '0.1')).toBe(true)
    expect(inmuebleCumpleCondiciones(condicion, atributos({ agrupacionRuta: RUTA_APTO }), CONTEXTO, '0.1')).toBe(false)
  })

  it('un inmueble sin agrupar nunca cumple, ni siquiera con neq', () => {
    expect(
      inmuebleCumpleCondiciones({ campo: 'agrupacion', operador: 'neq', valor: 'torre-a' }, atributos(), CONTEXTO, '0.1'),
    ).toBe(false)
  })
})

describe('ADC-01 — evaluarAlcance reporta el dato ausente', () => {
  it('excluido por dato ausente: lo reporta', () => {
    const condicion = { campo: 'uso_predio', operador: 'eq', valor: 'comercial' } as const
    const r = evaluarAlcance(condicion, atributos(), CONTEXTO, '0.1')
    expect(r.cumple).toBe(false)
    expect(r.camposSinDato).toEqual(['uso_predio'])
  })

  it('excluido porque el valor NO coincide: no es un dato ausente, no se reporta', () => {
    const condicion = { campo: 'uso_predio', operador: 'eq', valor: 'comercial' } as const
    const r = evaluarAlcance(condicion, atributos({ usoPredio: 'residencial' }), CONTEXTO, '0.1')
    expect(r.cumple).toBe(false)
    expect(r.camposSinDato).toEqual([])
  })

  it('un AND reporta cada campo ausente que consultó', () => {
    const condicion = {
      op: 'and',
      condiciones: [
        { campo: 'uso_predio', operador: 'eq', valor: 'comercial' },
        { campo: 'tipo_inmueble', operador: 'eq', valor: 'local' },
      ],
    } as const
    const r = evaluarAlcance(condicion, atributos(), CONTEXTO, '0.1')
    expect(r.camposSinDato).toEqual(['uso_predio', 'tipo_inmueble'])
  })
})
