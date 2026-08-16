/**
 * ael-bloques.ts — roundtrip texto→bloques→texto→AST, mismo criterio que
 * packages/ael-language/src/printer.test.ts (AEL-004 Fase 7).
 */
import { describe, expect, it } from 'vitest'
import { imprimir, parsear, type Regla } from '@aquila/ael-language'
import {
  astABloques,
  bloquesAAst,
  bloqueCondicionalVacio,
  bloqueDeclaracionVacia,
  bloqueNumeroCero,
  bloqueRetornoVacio,
  envolverEnBinaria,
  type BloqueRegla,
} from './ael-bloques'

function sinSpanNiId(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(sinSpanNiId)
  if (valor !== null && typeof valor === 'object') {
    const resultado: Record<string, unknown> = {}
    for (const [clave, v] of Object.entries(valor)) {
      if (clave === 'span' || clave === 'id') continue
      resultado[clave] = sinSpanNiId(v)
    }
    return resultado
  }
  return valor
}

function compararReglasEstructuralmente(a: Regla | null, b: Regla | null): void {
  expect(sinSpanNiId(a)).toEqual(sinSpanNiId(b))
}

function esperarRoundtripCompleto(texto: string): void {
  const { regla: regla1, diagnosticos: d1 } = parsear(texto)
  expect(d1).toHaveLength(0)
  if (regla1 === null) throw new Error('fixture inválida: no parseó')

  const bloques = astABloques(regla1)
  const regla2 = bloquesAAst(bloques)
  compararReglasEstructuralmente(regla1, regla2)

  const texto2 = imprimir(regla2)
  const { regla: regla3, diagnosticos: d3 } = parsear(texto2)
  expect(d3, `texto2 no parseó:\n${texto2}`).toHaveLength(0)
  compararReglasEstructuralmente(regla1, regla3)
}

describe('astABloques / bloquesAAst — roundtrip estructural', () => {
  it('REGLA vacía', () => {
    esperarRoundtripCompleto('REGLA VACIA')
  })

  it('DEFINIR + RETORNAR', () => {
    esperarRoundtripCompleto('REGLA X\nDEFINIR a = 1\nRETORNAR a')
  })

  it('todos los tipos de literal', () => {
    esperarRoundtripCompleto('REGLA X\nRETORNAR 42')
    esperarRoundtripCompleto('REGLA X\nRETORNAR 100.50 COP')
    esperarRoundtripCompleto('REGLA X\nRETORNAR VERDADERO')
    esperarRoundtripCompleto('REGLA X\nRETORNAR FALSO')
    esperarRoundtripCompleto('REGLA X\nRETORNAR NULO')
  })

  it('ReferenciaContract', () => {
    esperarRoundtripCompleto('REGLA X\nRETORNAR PARAMETER.PRESUPUESTO_ANUAL')
  })

  it('LlamadaFuncion con varios argumentos', () => {
    esperarRoundtripCompleto('REGLA X\nRETORNAR REDONDEAR_DINERO(MIN(a, b), 0)')
  })

  it('operadores unarios y binarios, con precedencia mixta', () => {
    esperarRoundtripCompleto('REGLA X\nRETORNAR -a + b * c - (d - e)')
  })

  it('SI/ENTONCES/SINO/FIN anidado', () => {
    esperarRoundtripCompleto(
      [
        'REGLA X',
        'SI a > 0 ENTONCES',
        'SI b > 0 ENTONCES',
        'RETORNAR 1',
        'SINO',
        'RETORNAR 2',
        'FIN',
        'SINO',
        'RETORNAR 3',
        'FIN',
      ].join('\n'),
    )
  })

  it('regla piloto realista', () => {
    esperarRoundtripCompleto(
      [
        'REGLA CUOTA_ADMIN',
        'DEFINIR base = PARAMETER.PRESUPUESTO_ANUAL * UNIT.COEFICIENTE',
        'SI PARAMETER.OTROS_INGRESOS_ANUAL > 0 ENTONCES',
        'DEFINIR ajuste = PARAMETER.OTROS_INGRESOS_ANUAL',
        'SINO',
        'DEFINIR ajuste = 0',
        'FIN',
        'RETORNAR REDONDEAR_DINERO(base + ajuste, 0)',
      ].join('\n'),
    )
  })
})

describe('astABloques — asigna un id único por nodo', () => {
  it('cada bloque tiene un id de string no vacío, distinto entre hermanos', () => {
    const { regla } = parsear('REGLA X\nDEFINIR a = 1 + 2\nRETORNAR a')
    if (regla === null) throw new Error('fixture inválida')
    const bloques = astABloques(regla)

    expect(bloques.id).toBeTruthy()
    expect(bloques.cuerpo).toHaveLength(2)
    const [declaracion, retorno] = bloques.cuerpo
    if (declaracion?.tipo !== 'Declaracion' || retorno?.tipo !== 'Retorno') {
      throw new Error('estructura inesperada')
    }
    if (declaracion.expresion.tipo !== 'ExpresionBinaria') throw new Error('esperaba binaria')

    const ids = [
      bloques.id,
      declaracion.id,
      declaracion.expresion.id,
      declaracion.expresion.izquierda.id,
      declaracion.expresion.derecha.id,
      retorno.id,
    ]
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('bloquesAAst — genera span sintético consistente', () => {
  it('todo nodo reconstruido tiene un span, aunque no tenga origen textual', () => {
    const { regla } = parsear('REGLA X\nRETORNAR 1 + 2')
    if (regla === null) throw new Error('fixture inválida')
    const reconstruida = bloquesAAst(astABloques(regla))
    expect(reconstruida.span).toBeDefined()
    const ret = reconstruida.cuerpo[0]
    if (ret?.tipo !== 'Retorno') throw new Error('esperaba Retorno')
    expect(ret.span).toBeDefined()
    expect(ret.expresion.span).toBeDefined()
  })
})

describe('fábricas de bloques por defecto (E6) — siempre producen AST imprimible/parseable', () => {
  function esperarReglaValida(cuerpo: BloqueRegla['cuerpo']): void {
    const regla: BloqueRegla = { id: 'r', tipo: 'Regla', nombre: 'X', cuerpo }
    const texto = imprimir(bloquesAAst(regla))
    const { diagnosticos } = parsear(texto)
    expect(diagnosticos, `no parseó:\n${texto}`).toHaveLength(0)
  }

  it('bloqueDeclaracionVacia() imprime y vuelve a parsear', () => {
    esperarReglaValida([bloqueDeclaracionVacia()])
  })

  it('bloqueRetornoVacio() imprime y vuelve a parsear', () => {
    esperarReglaValida([bloqueRetornoVacio()])
  })

  it('bloqueCondicionalVacio() imprime y vuelve a parsear, sin rama SINO', () => {
    const condicional = bloqueCondicionalVacio()
    expect(condicional.sino).toBeNull()
    esperarReglaValida([condicional, bloqueRetornoVacio()])
  })

  it('envolverEnBinaria() conserva el bloque original como lado izquierdo', () => {
    const original = bloqueNumeroCero()
    const envuelto = envolverEnBinaria(original)
    expect(envuelto.izquierda).toBe(original)
    expect(envuelto.operador).toBe('+')
    esperarReglaValida([{ id: 'r', tipo: 'Retorno', expresion: envuelto }])
  })
})

describe('BloqueExpresion/BloqueInstruccion — reestructurar sin mutar (E6)', () => {
  it('agregar un argumento a LlamadaFuncion produce un nuevo array, no muta el original', () => {
    const { regla } = parsear('REGLA X\nRETORNAR F(1)')
    if (regla === null) throw new Error('fixture inválida')
    const bloques = astABloques(regla)
    const retorno = bloques.cuerpo[0]
    if (retorno?.tipo !== 'Retorno' || retorno.expresion.tipo !== 'LlamadaFuncion') {
      throw new Error('estructura inesperada')
    }
    const original = retorno.expresion.argumentos
    const conArgumentoNuevo = [...original, bloqueNumeroCero()]
    expect(original).toHaveLength(1)
    expect(conArgumentoNuevo).toHaveLength(2)
  })

  it('reordenar una lista de instrucciones no pierde ni duplica elementos', () => {
    const { regla } = parsear('REGLA X\nDEFINIR a = 1\nDEFINIR b = 2\nRETORNAR a')
    if (regla === null) throw new Error('fixture inválida')
    const [primero, segundo, tercero] = astABloques(regla).cuerpo
    if (!primero || !segundo || !tercero) throw new Error('esperaba 3 instrucciones')
    const reordenadas = [segundo, primero, tercero]
    expect(reordenadas.map((i) => i.id)).toEqual([segundo.id, primero.id, tercero.id])
    expect(new Set(reordenadas.map((i) => i.id)).size).toBe(3)
  })
})
