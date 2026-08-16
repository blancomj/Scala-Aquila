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
  bloqueLlamadaFuncionDesde,
  bloqueNumeroCero,
  bloqueReferenciaContractDesde,
  bloqueRetornoVacio,
  diferenciarParDeListas,
  encontrarRutaDeInstruccion,
  envolverEnBinaria,
  moverInstruccionEntreListas,
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

  it('bloqueReferenciaContractDesde() usa el contrato/campo dados, no un valor en blanco', () => {
    const bloque = bloqueReferenciaContractDesde('PARAMETER', 'PRESUPUESTO_ANUAL')
    expect(bloque.contrato).toBe('PARAMETER')
    expect(bloque.campo).toBe('PRESUPUESTO_ANUAL')
    esperarReglaValida([{ id: 'r', tipo: 'Retorno', expresion: bloque }])
  })

  it('bloqueLlamadaFuncionDesde() usa el nombre dado y no agrega argumentos', () => {
    const bloque = bloqueLlamadaFuncionDesde('ABS')
    expect(bloque.nombre).toBe('ABS')
    expect(bloque.argumentos).toEqual([])
  })

  it('bloqueReferenciaContractDesde()/bloqueLlamadaFuncionDesde() generan ids únicos por llamada', () => {
    const a = bloqueReferenciaContractDesde('PARAMETER', 'X')
    const b = bloqueReferenciaContractDesde('PARAMETER', 'X')
    expect(a.id).not.toBe(b.id)
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

function bloquesDeTexto(texto: string): BloqueRegla {
  const { regla } = parsear(texto)
  if (regla === null) throw new Error(`fixture inválida: "${texto}" no parseó`)
  return astABloques(regla)
}

describe('encontrarRutaDeInstruccion', () => {
  it('encuentra una instrucción en el cuerpo raíz', () => {
    const regla = bloquesDeTexto('REGLA X\nDEFINIR a = 1\nRETORNAR a')
    const retorno = regla.cuerpo[1]
    if (!retorno) throw new Error('fixture inválida')
    const encontrada = encontrarRutaDeInstruccion(regla.cuerpo, retorno.id)
    expect(encontrada).toEqual({ ruta: [], indice: 1 })
  })

  it('encuentra una instrucción anidada dentro de ENTONCES y de SINO', () => {
    const regla = bloquesDeTexto(
      ['REGLA X', 'SI VERDADERO ENTONCES', 'DEFINIR a = 1', 'SINO', 'DEFINIR b = 2', 'FIN'].join(
        '\n',
      ),
    )
    const condicional = regla.cuerpo[0]
    if (condicional?.tipo !== 'Condicional' || condicional.sino === null) {
      throw new Error('fixture inválida')
    }
    const enEntonces = condicional.entonces[0]
    const enSino = condicional.sino[0]
    if (!enEntonces || !enSino) throw new Error('fixture inválida')

    expect(encontrarRutaDeInstruccion(regla.cuerpo, enEntonces.id)).toEqual({
      ruta: [{ indice: 0, rama: 'entonces' }],
      indice: 0,
    })
    expect(encontrarRutaDeInstruccion(regla.cuerpo, enSino.id)).toEqual({
      ruta: [{ indice: 0, rama: 'sino' }],
      indice: 0,
    })
  })

  it('devuelve null si el id no existe en el árbol', () => {
    const regla = bloquesDeTexto('REGLA X\nRETORNAR 1')
    expect(encontrarRutaDeInstruccion(regla.cuerpo, 'id-inexistente')).toBeNull()
  })
})

describe('moverInstruccionEntreListas', () => {
  it('reordena dentro de la misma lista (misma ruta)', () => {
    const regla = bloquesDeTexto('REGLA X\nDEFINIR a = 1\nDEFINIR b = 2\nRETORNAR a')
    const segundo = regla.cuerpo[1]
    if (!segundo) throw new Error('fixture inválida')

    const movida = moverInstruccionEntreListas(regla, [], 1, [], 0)
    expect(movida.cuerpo.map((i) => i.id)).toEqual([
      segundo.id,
      regla.cuerpo[0]?.id,
      regla.cuerpo[2]?.id,
    ])
    expect(movida.cuerpo).toHaveLength(3)
  })

  it('mueve una instrucción del cuerpo raíz hacia dentro de un ENTONCES', () => {
    const regla = bloquesDeTexto(
      ['REGLA X', 'DEFINIR a = 1', 'SI VERDADERO ENTONCES', 'RETORNAR a', 'FIN'].join('\n'),
    )
    const declaracion = regla.cuerpo[0]
    const condicional = regla.cuerpo[1]
    if (!declaracion || condicional?.tipo !== 'Condicional') throw new Error('fixture inválida')

    const movida = moverInstruccionEntreListas(regla, [], 0, [{ indice: 0, rama: 'entonces' }], 0)

    // el cuerpo raíz pierde la declaración — el Condicional queda en índice 0.
    expect(movida.cuerpo).toHaveLength(1)
    expect(movida.cuerpo[0]?.id).toBe(condicional.id)
    const condicionalMovido = movida.cuerpo[0]
    if (condicionalMovido?.tipo !== 'Condicional') throw new Error('esperaba Condicional')
    expect(condicionalMovido.entonces.map((i) => i.id)).toEqual([
      declaracion.id,
      condicionalMovido.entonces[1]?.id,
    ])
    expect(condicionalMovido.entonces).toHaveLength(2)
  })

  it('mueve una instrucción de ENTONCES a SINO del mismo Condicional', () => {
    const regla = bloquesDeTexto(
      ['REGLA X', 'SI VERDADERO ENTONCES', 'DEFINIR a = 1', 'SINO', 'DEFINIR b = 2', 'FIN'].join(
        '\n',
      ),
    )
    const condicional = regla.cuerpo[0]
    if (condicional?.tipo !== 'Condicional' || condicional.sino === null) {
      throw new Error('fixture inválida')
    }
    const enEntonces = condicional.entonces[0]
    if (!enEntonces) throw new Error('fixture inválida')

    const movida = moverInstruccionEntreListas(
      regla,
      [{ indice: 0, rama: 'entonces' }],
      0,
      [{ indice: 0, rama: 'sino' }],
      0,
    )
    const condicionalMovido = movida.cuerpo[0]
    if (condicionalMovido?.tipo !== 'Condicional' || condicionalMovido.sino === null) {
      throw new Error('esperaba Condicional con sino')
    }
    expect(condicionalMovido.entonces).toHaveLength(0)
    expect(condicionalMovido.sino.map((i) => i.id)).toEqual([enEntonces.id, condicional.sino[0]?.id])
  })

  it('el resultado siempre imprime y vuelve a parsear', () => {
    const regla = bloquesDeTexto(
      ['REGLA X', 'DEFINIR a = 1', 'SI VERDADERO ENTONCES', 'RETORNAR a', 'FIN'].join('\n'),
    )
    const movida = moverInstruccionEntreListas(regla, [], 0, [{ indice: 0, rama: 'entonces' }], 0)
    const texto = imprimir(bloquesAAst(movida))
    const { diagnosticos } = parsear(texto)
    expect(diagnosticos, `no parseó:\n${texto}`).toHaveLength(0)
  })
})

describe('diferenciarParDeListas', () => {
  it('marca igual cuando ambas listas son estructuralmente idénticas (id distinto no cuenta)', () => {
    const a = bloquesDeTexto('REGLA X\nRETORNAR 1').cuerpo
    const b = bloquesDeTexto('REGLA X\nRETORNAR 1').cuerpo // ids frescos, mismo contenido
    const { original, nueva } = diferenciarParDeListas(a, b)
    expect(original.map((d) => d.estado)).toEqual(['igual'])
    expect(nueva.map((d) => d.estado)).toEqual(['igual'])
  })

  it('marca cambiado cuando el contenido en la misma posición difiere', () => {
    const a = bloquesDeTexto('REGLA X\nRETORNAR 1').cuerpo
    const b = bloquesDeTexto('REGLA X\nRETORNAR 2').cuerpo
    const { original, nueva } = diferenciarParDeListas(a, b)
    expect(original.map((d) => d.estado)).toEqual(['cambiado'])
    expect(nueva.map((d) => d.estado)).toEqual(['cambiado'])
  })

  it('marca nuevo/eliminado cuando una lista es más larga que la otra', () => {
    const a = bloquesDeTexto('REGLA X\nRETORNAR 1').cuerpo
    const b = bloquesDeTexto('REGLA X\nDEFINIR a = 1\nRETORNAR a').cuerpo
    const { original, nueva } = diferenciarParDeListas(a, b)
    expect(original.map((d) => d.estado)).toEqual(['cambiado'])
    expect(nueva.map((d) => d.estado)).toEqual(['cambiado', 'nuevo'])
  })

  it('recursa en las ramas de un Condicional anidado', () => {
    const a = bloquesDeTexto(
      ['REGLA X', 'SI VERDADERO ENTONCES', 'RETORNAR 1', 'FIN'].join('\n'),
    ).cuerpo
    const b = bloquesDeTexto(
      ['REGLA X', 'SI VERDADERO ENTONCES', 'RETORNAR 2', 'FIN'].join('\n'),
    ).cuerpo
    const { nueva } = diferenciarParDeListas(a, b)
    const [condicional] = nueva
    if (!condicional?.entonces) throw new Error('esperaba entonces anotado')
    // la condición no cambió, pero el RETORNAR interno sí.
    expect(condicional.estado).toBe('cambiado')
    expect(condicional.entonces.map((d) => d.estado)).toEqual(['cambiado'])
  })
})
