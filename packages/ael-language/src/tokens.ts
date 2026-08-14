import type { Span } from '@aquila/ael-core'

/**
 * Vocabulario léxico de AEL v0.
 * Propietario documental: Docs/02 §3 PALABRAS RESERVADAS V1.
 *
 * MIENTRAS se lexa como palabra reservada pero el parser la rechaza
 * explícitamente (AD-21: AEL v0 es un evaluador de expresiones, sin
 * bucles) — así el diagnóstico es "no soportado en v0", no un error de
 * sintaxis genérico confuso.
 */
export const PALABRAS_RESERVADAS = {
  REGLA: 'REGLA',
  DEFINIR: 'DEFINIR',
  RETORNAR: 'RETORNAR',
  SI: 'SI',
  ENTONCES: 'ENTONCES',
  SINO: 'SINO',
  FIN: 'FIN',
  MIENTRAS: 'MIENTRAS',
  VERDADERO: 'VERDADERO',
  FALSO: 'FALSO',
  NULO: 'NULO',
} as const

export type PalabraReservada = keyof typeof PALABRAS_RESERVADAS

export function esPalabraReservada(texto: string): texto is PalabraReservada {
  return Object.hasOwn(PALABRAS_RESERVADAS, texto)
}

export const TIPOS_TOKEN = [
  // literales e identificadores
  'NUMERO',
  'IDENTIFICADOR',
  // palabras reservadas
  'REGLA',
  'DEFINIR',
  'RETORNAR',
  'SI',
  'ENTONCES',
  'SINO',
  'FIN',
  'MIENTRAS',
  'VERDADERO',
  'FALSO',
  'NULO',
  // operadores
  'IGUAL', // =
  'IGUAL_IGUAL', // ==
  'DISTINTO', // !=
  'MAYOR', // >
  'MAYOR_IGUAL', // >=
  'MENOR', // <
  'MENOR_IGUAL', // <=
  'MAS', // +
  'MENOS', // -
  'POR', // *
  'DIVIDIDO', // /
  // puntuación
  'PARENTESIS_IZQ',
  'PARENTESIS_DER',
  'PUNTO',
  'COMA',
  'FIN_ARCHIVO',
] as const

export type TipoToken = (typeof TIPOS_TOKEN)[number]

export interface Token {
  readonly tipo: TipoToken
  readonly lexema: string
  readonly span: Span
}
