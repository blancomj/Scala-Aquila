/**
 * printer.ts — imprimir() es la inversa de parsear(). El criterio de
 * aceptación central (AEL-004 Fase 7) es el roundtrip: parsear(texto) →
 * imprimir(regla) → parsear(texto2) debe producir un AST estructuralmente
 * idéntico al original, ignorando span (imprimir no reconstruye
 * posiciones de origen).
 */
import { describe, expect, it } from 'vitest'
import { parsear } from './parser.js'
import { imprimir } from './printer.js'
import type { Expresion, Instruccion, Regla } from './ast.js'

function sinSpan(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(sinSpan)
  if (valor !== null && typeof valor === 'object') {
    const resultado: Record<string, unknown> = {}
    for (const [clave, v] of Object.entries(valor)) {
      if (clave === 'span') continue
      resultado[clave] = sinSpan(v)
    }
    return resultado
  }
  return valor
}

function compararReglasEstructuralmente(a: Regla | null, b: Regla | null): void {
  expect(sinSpan(a)).toEqual(sinSpan(b))
}

/** parsear(texto1) -> imprimir -> parsear(texto2): deben coincidir estructuralmente. */
function esperarRoundtrip(texto: string): void {
  const { regla: regla1, diagnosticos: d1 } = parsear(texto)
  expect(d1).toHaveLength(0)
  if (regla1 === null) throw new Error('fixture inválida: no parseó')

  const texto2 = imprimir(regla1)
  const { regla: regla2, diagnosticos: d2 } = parsear(texto2)
  expect(d2, `texto2 no parseó:\n${texto2}`).toHaveLength(0)

  compararReglasEstructuralmente(regla1, regla2)
}

describe('imprimir — roundtrip estructural', () => {
  it('REGLA vacía', () => {
    esperarRoundtrip('REGLA VACIA')
  })

  it('DEFINIR + RETORNAR simple', () => {
    esperarRoundtrip('REGLA X\nDEFINIR a = 1\nRETORNAR a')
  })

  it('literales: NumeroLiteral, DineroLiteral, BooleanoLiteral, NuloLiteral', () => {
    esperarRoundtrip('REGLA X\nRETORNAR 42')
    esperarRoundtrip('REGLA X\nRETORNAR 100 COP')
    esperarRoundtrip('REGLA X\nRETORNAR 100.50 COP')
    esperarRoundtrip('REGLA X\nRETORNAR VERDADERO')
    esperarRoundtrip('REGLA X\nRETORNAR FALSO')
    esperarRoundtrip('REGLA X\nRETORNAR NULO')
  })

  it('ReferenciaContract', () => {
    esperarRoundtrip('REGLA X\nRETORNAR PARAMETER.PRESUPUESTO_ANUAL')
    esperarRoundtrip('REGLA X\nRETORNAR CONCEPTO.CUOTA_ADMIN')
  })

  it('LlamadaFuncion con 0, 1 y 2 argumentos', () => {
    esperarRoundtrip('REGLA X\nRETORNAR FOO()')
    esperarRoundtrip('REGLA X\nRETORNAR MIN(a, b)')
    esperarRoundtrip('REGLA X\nRETORNAR REDONDEAR_DINERO(PARAMETER.PRESUPUESTO_ANUAL, 0)')
  })

  it('todos los operadores binarios', () => {
    for (const op of ['+', '-', '*', '/', '==', '!=', '>', '>=', '<', '<=']) {
      esperarRoundtrip(`REGLA X\nRETORNAR 1 ${op} 2`)
    }
  })

  it('operador unario', () => {
    esperarRoundtrip('REGLA X\nRETORNAR -a')
    esperarRoundtrip('REGLA X\nRETORNAR --a')
  })

  it('precedencia: * liga más fuerte que + (sin paréntesis necesarios)', () => {
    esperarRoundtrip('REGLA X\nRETORNAR a + b * c')
  })

  it('precedencia forzada por paréntesis: (a + b) * c', () => {
    const { regla } = parsear('REGLA X\nRETORNAR (a + b) * c')
    if (regla === null) throw new Error('fixture inválida')
    const ret = regla.cuerpo[0]
    if (ret?.tipo !== 'Retorno' || ret.expresion.tipo !== 'ExpresionBinaria') {
      throw new Error('esperaba ExpresionBinaria')
    }
    expect(ret.expresion.operador).toBe('*')
    expect(ret.expresion.izquierda.tipo).toBe('ExpresionBinaria')

    const texto2 = imprimir(regla)
    expect(texto2).toContain('(a + b) * c')
    esperarRoundtrip(texto2)
  })

  it('asociatividad izquierda: a - b - c se reimprime sin cambiar de árbol', () => {
    const { regla } = parsear('REGLA X\nRETORNAR a - b - c')
    if (regla === null) throw new Error('fixture inválida')
    const texto2 = imprimir(regla)
    // Debe imprimirse SIN paréntesis (el árbol izq-asociativo es el default).
    expect(texto2).toContain('a - b - c')
    esperarRoundtrip(texto2)
  })

  it('paréntesis necesarios para forzar asociatividad derecha: a - (b - c)', () => {
    const { regla } = parsear('REGLA X\nRETORNAR a - (b - c)')
    if (regla === null) throw new Error('fixture inválida')
    const texto2 = imprimir(regla)
    expect(texto2).toContain('a - (b - c)')
    esperarRoundtrip(texto2)
  })

  it('paréntesis necesarios en el lado derecho con la misma precedencia: a + (b - c)', () => {
    const { regla } = parsear('REGLA X\nRETORNAR a + (b - c)')
    if (regla === null) throw new Error('fixture inválida')
    const texto2 = imprimir(regla)
    expect(texto2).toContain('a + (b - c)')
    esperarRoundtrip(texto2)
  })

  it('unario aplicado a una expresión binaria necesita paréntesis: -(a + b)', () => {
    const { regla } = parsear('REGLA X\nRETORNAR -(a + b)')
    if (regla === null) throw new Error('fixture inválida')
    const texto2 = imprimir(regla)
    expect(texto2).toContain('-(a + b)')
    esperarRoundtrip(texto2)
  })

  it('SI/ENTONCES/FIN sin SINO', () => {
    esperarRoundtrip('REGLA X\nSI a > 0 ENTONCES\nDEFINIR b = a\nRETORNAR b\nFIN\nRETORNAR 0')
  })

  it('SI/ENTONCES/SINO/FIN', () => {
    esperarRoundtrip('REGLA X\nSI a > 0 ENTONCES\nRETORNAR a\nSINO\nRETORNAR 0\nFIN')
  })

  it('SI anidado 2 niveles', () => {
    esperarRoundtrip(
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

  it('regla piloto realista: presupuesto * coeficiente + SI(fondo > 0) redondeado', () => {
    esperarRoundtrip(
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

describe('imprimir — formato', () => {
  it('indenta el cuerpo de SI/SINO', () => {
    const { regla } = parsear('REGLA X\nSI a > 0 ENTONCES\nRETORNAR 1\nSINO\nRETORNAR 2\nFIN')
    if (regla === null) throw new Error('fixture inválida')
    const texto = imprimir(regla)
    expect(texto).toBe(
      ['REGLA X', 'SI a > 0 ENTONCES', '    RETORNAR 1', 'SINO', '    RETORNAR 2', 'FIN'].join(
        '\n',
      ),
    )
  })

  it('no reformatea el lexema crudo de NumeroLiteral/DineroLiteral', () => {
    const { regla } = parsear('REGLA X\nRETORNAR 100.50 COP')
    if (regla === null) throw new Error('fixture inválida')
    const ret: Instruccion | undefined = regla.cuerpo[0]
    if (ret?.tipo !== 'Retorno') throw new Error('esperaba Retorno')
    const expr: Expresion = ret.expresion
    if (expr.tipo !== 'DineroLiteral') throw new Error('esperaba DineroLiteral')
    expect(expr.monto).toBe('100.50')
    expect(imprimir(regla)).toContain('100.50 COP')
  })
})
