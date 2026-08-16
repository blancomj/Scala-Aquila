/**
 * Pretty-printer de AEL v0 — la inversa exacta de parser.ts.
 * Propietario documental: Docs/02 §56-64 GRAMÁTICA EBNF (misma gramática
 * que el parser, en sentido contrario).
 *
 * Construido para AEL-004 Fase 7 (constructor visual): imprimir(regla)
 * debe producir texto que, vuelto a parsear, produzca un AST
 * estructuralmente idéntico al original (ver printer.test.ts, roundtrip).
 * El lexer es insensible a espacios/saltos de línea, así que el formato
 * de salida es puramente cosmético — la única regla dura es reinsertar
 * paréntesis donde la precedencia/asociatividad los requiera, porque el
 * parser no conserva "expresión entre paréntesis" como nodo del AST.
 */
import type {
  Condicional,
  Declaracion,
  Expresion,
  Instruccion,
  OperadorBinario,
  Regla,
  Retorno,
} from './ast.js'

const INDENT = '    '

/** Misma tabla que parser.ts (Docs/02 §57): mayor número = liga más fuerte. */
const PRECEDENCIA: Record<OperadorBinario, number> = {
  '==': 0,
  '!=': 0,
  '>': 1,
  '>=': 1,
  '<': 1,
  '<=': 1,
  '+': 2,
  '-': 2,
  '*': 3,
  '/': 3,
}

function precedenciaDe(expr: Expresion): number {
  return expr.tipo === 'ExpresionBinaria' ? PRECEDENCIA[expr.operador] : Infinity
}

/**
 * Imprime el operando de un ExpresionBinaria, envolviéndolo en paréntesis
 * solo si hace falta para que, al volver a parsear, la estructura del
 * árbol se preserve. Dos casos:
 * - precedencia del hijo < precedencia del padre: siempre hace falta.
 * - lado derecho con la MISMA precedencia que el padre: parsearBinariaIzqAsoc
 *   es asociativo-izquierda, así que "a - (b - c)" y "a - b - c" son
 *   árboles distintos aunque la precedencia sea igual — hace falta
 *   paréntesis para preservar el agrupamiento a la derecha.
 */
function imprimirOperando(
  hijo: Expresion,
  precedenciaPadre: number,
  esLadoDerecho: boolean,
): string {
  const precedenciaHijo = precedenciaDe(hijo)
  const necesitaParentesis =
    precedenciaHijo < precedenciaPadre || (esLadoDerecho && precedenciaHijo === precedenciaPadre)
  const texto = imprimirExpresion(hijo)
  return necesitaParentesis ? `(${texto})` : texto
}

export function imprimirExpresion(expr: Expresion): string {
  switch (expr.tipo) {
    case 'NumeroLiteral':
      return expr.valor
    case 'DineroLiteral':
      return `${expr.monto} ${expr.moneda}`
    case 'BooleanoLiteral':
      return expr.valor ? 'VERDADERO' : 'FALSO'
    case 'NuloLiteral':
      return 'NULO'
    case 'Identificador':
      return expr.nombre
    case 'ReferenciaContract':
      return `${expr.contrato}.${expr.campo}`
    case 'LlamadaFuncion':
      return `${expr.nombre}(${expr.argumentos.map((a) => imprimirExpresion(a)).join(', ')})`
    case 'ExpresionUnaria':
      return `-${imprimirOperando(expr.operando, Infinity, false)}`
    case 'ExpresionBinaria': {
      const precedencia = PRECEDENCIA[expr.operador]
      const izquierda = imprimirOperando(expr.izquierda, precedencia, false)
      const derecha = imprimirOperando(expr.derecha, precedencia, true)
      return `${izquierda} ${expr.operador} ${derecha}`
    }
  }
}

function imprimirDeclaracion(inst: Declaracion): string {
  return `DEFINIR ${inst.nombre} = ${imprimirExpresion(inst.expresion)}`
}

function imprimirRetorno(inst: Retorno): string {
  return `RETORNAR ${imprimirExpresion(inst.expresion)}`
}

function imprimirCondicional(inst: Condicional, nivel: number): string {
  const indentPropio = INDENT.repeat(nivel)
  const lineas: string[] = [`${indentPropio}SI ${imprimirExpresion(inst.condicion)} ENTONCES`]
  if (inst.entonces.length > 0) lineas.push(imprimirInstrucciones(inst.entonces, nivel + 1))
  if (inst.sino !== null) {
    lineas.push(`${indentPropio}SINO`)
    if (inst.sino.length > 0) lineas.push(imprimirInstrucciones(inst.sino, nivel + 1))
  }
  lineas.push(`${indentPropio}FIN`)
  return lineas.join('\n')
}

function imprimirInstruccion(inst: Instruccion, nivel: number): string {
  const indent = INDENT.repeat(nivel)
  switch (inst.tipo) {
    case 'Declaracion':
      return `${indent}${imprimirDeclaracion(inst)}`
    case 'Retorno':
      return `${indent}${imprimirRetorno(inst)}`
    case 'Condicional':
      return imprimirCondicional(inst, nivel)
  }
}

function imprimirInstrucciones(instrucciones: readonly Instruccion[], nivel: number): string {
  return instrucciones.map((inst) => imprimirInstruccion(inst, nivel)).join('\n')
}

export function imprimir(regla: Regla): string {
  const lineas = [`REGLA ${regla.nombre}`]
  if (regla.cuerpo.length > 0) {
    lineas.push(imprimirInstrucciones(regla.cuerpo, 0))
  }
  return lineas.join('\n')
}
