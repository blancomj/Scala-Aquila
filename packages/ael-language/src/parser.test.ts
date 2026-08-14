import { describe, expect, it } from 'vitest'
import { parsear } from './parser.js'
import type { ExpresionBinaria } from './ast.js'

describe('parsear — estructura de una REGLA', () => {
  it('parsea REGLA vacía', () => {
    const { regla, diagnosticos } = parsear('REGLA VACIA')
    expect(diagnosticos).toHaveLength(0)
    expect(regla?.nombre).toBe('VACIA')
    expect(regla?.cuerpo).toHaveLength(0)
  })

  it('parsea DEFINIR seguido de RETORNAR', () => {
    const { regla, diagnosticos } = parsear('REGLA X\nDEFINIR a = 1\nRETORNAR a')
    expect(diagnosticos).toHaveLength(0)
    expect(regla?.cuerpo).toHaveLength(2)
    expect(regla?.cuerpo[0]?.tipo).toBe('Declaracion')
    expect(regla?.cuerpo[1]?.tipo).toBe('Retorno')
  })
})

describe('parsear — literales', () => {
  it('literal DineroLiteral: NUMERO + código de moneda ISO', () => {
    const { regla } = parsear('REGLA X\nRETORNAR 100 COP')
    const ret = regla?.cuerpo[0]
    if (ret?.tipo !== 'Retorno') throw new Error('esperaba Retorno')
    expect(ret.expresion).toMatchObject({ tipo: 'DineroLiteral', monto: '100', moneda: 'COP' })
  })

  it('un identificador de 3 letras minúsculas NO se confunde con moneda', () => {
    const { regla } = parsear('REGLA X\nDEFINIR abc = 1\nRETORNAR 100 abc')
    // "abc" no matchea el patrón ISO (mayúsculas) -> NumeroLiteral 100, luego error de instrucción
    // (100 seguido de un identificador suelto no es una instrucción válida)
    expect(regla).toBeNull()
  })

  it('VERDADERO / FALSO / NULO', () => {
    const { regla } = parsear('REGLA X\nRETORNAR VERDADERO')
    const ret = regla?.cuerpo[0]
    if (ret?.tipo !== 'Retorno') throw new Error('esperaba Retorno')
    expect(ret.expresion).toMatchObject({ tipo: 'BooleanoLiteral', valor: true })
  })
})

describe('parsear — referencias y llamadas', () => {
  it('referencia_contract: IDENT.IDENT', () => {
    const { regla, diagnosticos } = parsear('REGLA X\nRETORNAR PARAMETER.TARIFA_M2')
    expect(diagnosticos).toHaveLength(0)
    const ret = regla?.cuerpo[0]
    if (ret?.tipo !== 'Retorno') throw new Error('esperaba Retorno')
    expect(ret.expresion).toMatchObject({
      tipo: 'ReferenciaContract',
      contrato: 'PARAMETER',
      campo: 'TARIFA_M2',
    })
  })

  it('llamada_funcion con varios argumentos', () => {
    const { regla, diagnosticos } = parsear('REGLA X\nRETORNAR MIN(a, b)')
    expect(diagnosticos).toHaveLength(0)
    const ret = regla?.cuerpo[0]
    if (ret?.tipo !== 'Retorno') throw new Error('esperaba Retorno')
    if (ret.expresion.tipo !== 'LlamadaFuncion') throw new Error('esperaba LlamadaFuncion')
    expect(ret.expresion.nombre).toBe('MIN')
    expect(ret.expresion.argumentos).toHaveLength(2)
  })

  it('llamada_funcion sin argumentos', () => {
    const { regla, diagnosticos } = parsear('REGLA X\nDEFINIR y = 1\nRETORNAR FOO()')
    expect(diagnosticos).toHaveLength(0)
    const ret = regla?.cuerpo[1]
    if (ret?.tipo !== 'Retorno' || ret.expresion.tipo !== 'LlamadaFuncion') {
      throw new Error('esperaba LlamadaFuncion')
    }
    expect(ret.expresion.argumentos).toHaveLength(0)
  })
})

describe('parsear — precedencia de operadores (02 §25, §57)', () => {
  it('* liga más fuerte que +', () => {
    const { regla } = parsear('REGLA X\nRETORNAR 2 + 3 * 4')
    const ret = regla?.cuerpo[0]
    if (ret?.tipo !== 'Retorno') throw new Error()
    const expr = ret.expresion as ExpresionBinaria
    expect(expr.operador).toBe('+')
    expect((expr.derecha as ExpresionBinaria).operador).toBe('*')
  })

  it('los paréntesis alteran la precedencia', () => {
    const { regla } = parsear('REGLA X\nRETORNAR (2 + 3) * 4')
    const ret = regla?.cuerpo[0]
    if (ret?.tipo !== 'Retorno') throw new Error()
    const expr = ret.expresion as ExpresionBinaria
    expect(expr.operador).toBe('*')
  })

  it('operadores aritméticos son asociativos a la izquierda', () => {
    const { regla } = parsear('REGLA X\nRETORNAR 10 - 3 - 2')
    const ret = regla?.cuerpo[0]
    if (ret?.tipo !== 'Retorno') throw new Error()
    const expr = ret.expresion as ExpresionBinaria
    // (10 - 3) - 2, no 10 - (3 - 2)
    expect((expr.izquierda as ExpresionBinaria).operador).toBe('-')
    expect((expr.izquierda as ExpresionBinaria).izquierda).toMatchObject({ valor: '10' })
  })

  it('relacional liga menos que aditiva: a - b > c se lee (a-b) > c', () => {
    const { regla } = parsear('REGLA X\nDEFINIR a=1\nDEFINIR b=1\nDEFINIR c=1\nRETORNAR a - b > c')
    const ret = regla?.cuerpo.at(-1)
    if (ret?.tipo !== 'Retorno') throw new Error()
    const expr = ret.expresion as ExpresionBinaria
    expect(expr.operador).toBe('>')
    expect((expr.izquierda as ExpresionBinaria).operador).toBe('-')
  })

  it('unario menos', () => {
    const { regla, diagnosticos } = parsear('REGLA X\nRETORNAR -5')
    expect(diagnosticos).toHaveLength(0)
    const ret = regla?.cuerpo[0]
    if (ret?.tipo !== 'Retorno') throw new Error()
    expect(ret.expresion).toMatchObject({ tipo: 'ExpresionUnaria', operador: '-' })
  })
})

describe('parsear — condicional SI/ENTONCES/SINO/FIN', () => {
  it('con SINO', () => {
    const fuente = 'REGLA X\nSI VERDADERO ENTONCES\nRETORNAR 1\nSINO\nRETORNAR 2\nFIN'
    const { regla, diagnosticos } = parsear(fuente)
    expect(diagnosticos).toHaveLength(0)
    const cond = regla?.cuerpo[0]
    if (cond?.tipo !== 'Condicional') throw new Error()
    expect(cond.entonces).toHaveLength(1)
    expect(cond.sino).toHaveLength(1)
  })

  it('sin SINO (02 §34)', () => {
    const fuente = 'REGLA X\nSI VERDADERO ENTONCES\nRETORNAR 1\nFIN\nRETORNAR 2'
    const { regla, diagnosticos } = parsear(fuente)
    expect(diagnosticos).toHaveLength(0)
    const cond = regla?.cuerpo[0]
    if (cond?.tipo !== 'Condicional') throw new Error()
    expect(cond.sino).toBeNull()
  })
})

describe('parsear — MIENTRAS rechazado explícitamente (AD-21)', () => {
  it('produce un diagnóstico específico, no un error de sintaxis genérico', () => {
    const { regla, diagnosticos } = parsear('REGLA X\nMIENTRAS VERDADERO\nFIN')
    expect(regla).toBeNull()
    expect(diagnosticos[0]?.codigo).toBe('AEL-PARSER-UNSUPPORTED_MIENTRAS')
  })
})

describe('parsear — errores de sintaxis nunca crashean (01 §54)', () => {
  it('DEFINIR sin "=" produce diagnóstico y regla null', () => {
    const { regla, diagnosticos } = parsear('REGLA X\nDEFINIR a 1')
    expect(regla).toBeNull()
    expect(diagnosticos.length).toBeGreaterThan(0)
    expect(diagnosticos[0]?.codigo).toBe('AEL-PARSER-UNEXPECTED_TOKEN')
  })

  it('paréntesis sin cerrar', () => {
    const { regla, diagnosticos } = parsear('REGLA X\nRETORNAR (1 + 2')
    expect(regla).toBeNull()
    expect(diagnosticos.length).toBeGreaterThan(0)
  })

  it('SI sin FIN', () => {
    const { regla, diagnosticos } = parsear('REGLA X\nSI VERDADERO ENTONCES\nRETORNAR 1')
    expect(regla).toBeNull()
    expect(diagnosticos.length).toBeGreaterThan(0)
  })

  it('fuente vacía', () => {
    const { regla, diagnosticos } = parsear('')
    expect(regla).toBeNull()
    expect(diagnosticos.length).toBeGreaterThan(0)
  })
})
