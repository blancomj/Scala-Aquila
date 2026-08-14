import { describe, expect, it } from 'vitest'
import { tokenizar } from './lexer.js'

function tipos(fuente: string): string[] {
  return tokenizar(fuente).tokens.map((t) => t.tipo)
}

describe('tokenizar — palabras reservadas y estructura básica', () => {
  it('reconoce REGLA, DEFINIR, RETORNAR', () => {
    expect(tipos('REGLA DEFINIR RETORNAR')).toEqual([
      'REGLA',
      'DEFINIR',
      'RETORNAR',
      'FIN_ARCHIVO',
    ])
  })

  it('reconoce SI ENTONCES SINO FIN y MIENTRAS', () => {
    expect(tipos('SI ENTONCES SINO FIN MIENTRAS')).toEqual([
      'SI',
      'ENTONCES',
      'SINO',
      'FIN',
      'MIENTRAS',
      'FIN_ARCHIVO',
    ])
  })

  it('reconoce VERDADERO, FALSO, NULO', () => {
    expect(tipos('VERDADERO FALSO NULO')).toEqual(['VERDADERO', 'FALSO', 'NULO', 'FIN_ARCHIVO'])
  })

  it('distingue identificadores de palabras reservadas', () => {
    const r = tokenizar('area REGLAMENTO')
    expect(r.tokens[0]?.tipo).toBe('IDENTIFICADOR')
    // "REGLAMENTO" no es la palabra reservada REGLA — debe ser identificador completo
    expect(r.tokens[1]?.tipo).toBe('IDENTIFICADOR')
    expect(r.tokens[1]?.lexema).toBe('REGLAMENTO')
  })
})

describe('tokenizar — números', () => {
  it('enteros y decimales', () => {
    const r = tokenizar('100 4500 0.15 120.50')
    expect(r.tokens.slice(0, 4).map((t) => t.lexema)).toEqual(['100', '4500', '0.15', '120.50'])
  })

  it('el punto de fin de instrucción no se confunde con decimal', () => {
    // "100." sin dígito después no debe consumir el punto
    const r = tokenizar('100.PUNTO')
    expect(r.tokens[0]?.lexema).toBe('100')
    expect(r.tokens[1]?.tipo).toBe('PUNTO')
  })
})

describe('tokenizar — operadores', () => {
  it('un carácter', () => {
    expect(tipos('+ - * / ( ) . ,')).toEqual([
      'MAS',
      'MENOS',
      'POR',
      'DIVIDIDO',
      'PARENTESIS_IZQ',
      'PARENTESIS_DER',
      'PUNTO',
      'COMA',
      'FIN_ARCHIVO',
    ])
  })

  it('dos caracteres: == != >= <=', () => {
    expect(tipos('== != >= <=')).toEqual([
      'IGUAL_IGUAL',
      'DISTINTO',
      'MAYOR_IGUAL',
      'MENOR_IGUAL',
      'FIN_ARCHIVO',
    ])
  })

  it('= simple vs ==', () => {
    expect(tipos('=')).toEqual(['IGUAL', 'FIN_ARCHIVO'])
  })

  it('> < simples', () => {
    expect(tipos('> <')).toEqual(['MAYOR', 'MENOR', 'FIN_ARCHIVO'])
  })
})

describe('tokenizar — comentarios y espacios', () => {
  it('ignora comentarios de línea', () => {
    const r = tokenizar('DEFINIR x = 1 // esto es un comentario\nRETORNAR x')
    expect(r.tokens.map((t) => t.tipo)).not.toContain('COMENTARIO')
    expect(r.diagnosticos).toHaveLength(0)
  })

  it('ignora espacios, tabs y saltos de línea', () => {
    expect(tipos('  \t\n REGLA \n\n DEFINIR  ')).toEqual(['REGLA', 'DEFINIR', 'FIN_ARCHIVO'])
  })
})

describe('tokenizar — diagnósticos, nunca crashea (01 §54)', () => {
  it('reporta un carácter inesperado y continúa', () => {
    const r = tokenizar('DEFINIR x = 1 @ RETORNAR x')
    expect(r.diagnosticos).toHaveLength(1)
    expect(r.diagnosticos[0]?.codigo).toBe('AEL-LEXER-UNEXPECTED_CHAR')
    // sigue tokenizando después del carácter inválido
    expect(r.tokens.at(-2)?.lexema).toBe('x')
  })

  it('"!" solo sin "=" produce diagnóstico', () => {
    const r = tokenizar('!')
    expect(r.diagnosticos).toHaveLength(1)
    expect(r.diagnosticos[0]?.mensaje).toMatch(/!=/)
  })

  it('siempre termina con FIN_ARCHIVO', () => {
    expect(tokenizar('').tokens.map((t) => t.tipo)).toEqual(['FIN_ARCHIVO'])
  })
})

describe('tokenizar — posiciones (line/column) para diagnósticos', () => {
  it('rastrea línea y columna a través de saltos de línea', () => {
    const r = tokenizar('REGLA\nDEFINIR')
    expect(r.tokens[0]?.span.inicio).toEqual({ linea: 1, columna: 1 })
    expect(r.tokens[1]?.span.inicio).toEqual({ linea: 2, columna: 1 })
  })
})
