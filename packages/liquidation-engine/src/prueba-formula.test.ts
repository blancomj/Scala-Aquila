import type { CatalogoContratos } from '@aquila/ael-language'
import { crearDecimal, money, type ModoRedondeo } from '@aquila/financial-kernel'
import type { TypedValue } from '@aquila/ael-runtime'
import { ContractoNoResueltoError } from '@aquila/ael-runtime'
import { describe, expect, it } from 'vitest'
import { probarFormula } from './prueba-formula.js'

function crearContexto(
  catalogo: CatalogoContratos,
  valores: Readonly<Record<string, TypedValue>>,
  modoRedondeoDinero: ModoRedondeo = 'HALF_UP',
) {
  return {
    catalogo,
    modoRedondeoDinero,
    resolverContract(contrato: string, campo: string) {
      const v = valores[`${contrato}.${campo}`]
      if (v === undefined) throw new ContractoNoResueltoError(contrato, campo)
      return v
    },
  }
}

describe('probarFormula', () => {
  it('fórmula válida con PARAMETER — devuelve MONEY', () => {
    const contexto = crearContexto(
      { PARAMETER: { TARIFA: 'MONEY' } },
      { 'PARAMETER.TARIFA': { tipo: 'MONEY', valor: money(500, 'COP') } },
    )
    const r = probarFormula('REGLA X\nRETORNAR PARAMETER.TARIFA', contexto)
    expect(r.valido).toBe(true)
    expect(r.diagnosticos).toEqual([])
    if (r.resultado?.tipo !== 'MONEY') throw new Error()
    expect(r.resultado.valor.amount.toString()).toBe('500')

    expect(r.traza).toHaveLength(1)
    expect(r.traza[0]).toMatchObject({ nombre: null, expresionTexto: 'PARAMETER.TARIFA' })
  })

  it('fórmula válida con UNIT — devuelve NUMBER', () => {
    const contexto = crearContexto(
      { UNIT: { AREA_PRIVADA: 'NUMBER' } },
      { 'UNIT.AREA_PRIVADA': { tipo: 'NUMBER', valor: crearDecimal('55.3') } },
    )
    const r = probarFormula('REGLA X\nRETORNAR UNIT.AREA_PRIVADA', contexto)
    expect(r.valido).toBe(true)
    expect(r.resultado?.tipo).toBe('NUMBER')
  })

  it('error de sintaxis — valido:false, sin lanzar', () => {
    const contexto = crearContexto({}, {})
    const r = probarFormula('REGLA X\nRETORNAR (', contexto)
    expect(r.valido).toBe(false)
    expect(r.resultado).toBeNull()
    expect(r.diagnosticos.length).toBeGreaterThan(0)
  })

  it('error de análisis (contrato no declarado en el catálogo) — valido:false', () => {
    const contexto = crearContexto({}, {})
    const r = probarFormula('REGLA X\nRETORNAR PARAMETER.NO_EXISTE', contexto)
    expect(r.valido).toBe(false)
    expect(r.resultado).toBeNull()
    expect(r.diagnosticos.length).toBeGreaterThan(0)
  })

  it('error de evaluación (el contexto no resuelve un contrato que sí está en el catálogo) — valido:false, sin lanzar', () => {
    const contexto = crearContexto({ PARAMETER: { TARIFA: 'MONEY' } }, {})
    const r = probarFormula('REGLA X\nRETORNAR PARAMETER.TARIFA', contexto)
    expect(r.valido).toBe(false)
    expect(r.resultado).toBeNull()
    expect(r.diagnosticos.length).toBeGreaterThan(0)
  })
})
