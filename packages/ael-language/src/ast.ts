/**
 * AST de AEL v0.
 * Propietario documental: Docs/02 §56-64 GRAMÁTICA.
 *
 * Subconjunto de la gramática que las tres reglas piloto ejercitan
 * (paso0/INFORME_PASO_0.md §1): sin listas, sin Y/O/NO lógicos, sin
 * MIENTRAS (AD-21). Se amplía cuando un caso real lo exija — no antes
 * (PLAN §3.4 alcance cerrado).
 *
 * Cada nodo lleva su `span` para que los diagnósticos del Analyzer y del
 * evaluador señalen la ubicación exacta en el Source (Docs/01 §27).
 */
import type { Span } from '@aquila/ael-core'

// ─────────────────────────── Expresiones ───────────────────────────────

export type Expresion =
  | NumeroLiteral
  | DineroLiteral
  | BooleanoLiteral
  | NuloLiteral
  | Identificador
  | ReferenciaContract
  | LlamadaFuncion
  | ExpresionUnaria
  | ExpresionBinaria

export interface NumeroLiteral {
  readonly tipo: 'NumeroLiteral'
  /** Lexema crudo, sin parsear a número — nunca parseFloat (19 §19). */
  readonly valor: string
  readonly span: Span
}

export interface DineroLiteral {
  readonly tipo: 'DineroLiteral'
  readonly monto: string
  readonly moneda: string
  readonly span: Span
}

export interface BooleanoLiteral {
  readonly tipo: 'BooleanoLiteral'
  readonly valor: boolean
  readonly span: Span
}

export interface NuloLiteral {
  readonly tipo: 'NuloLiteral'
  readonly span: Span
}

export interface Identificador {
  readonly tipo: 'Identificador'
  readonly nombre: string
  readonly span: Span
}

/** `PARAMETER.X`, `UNIT.X`, `CONCEPTO.X` — Docs/02 §40-42, 01 §22-23. */
export interface ReferenciaContract {
  readonly tipo: 'ReferenciaContract'
  readonly contrato: string
  readonly campo: string
  readonly span: Span
}

export interface LlamadaFuncion {
  readonly tipo: 'LlamadaFuncion'
  readonly nombre: string
  readonly argumentos: readonly Expresion[]
  readonly span: Span
}

export type OperadorUnario = '-'

export interface ExpresionUnaria {
  readonly tipo: 'ExpresionUnaria'
  readonly operador: OperadorUnario
  readonly operando: Expresion
  readonly span: Span
}

export type OperadorBinario = '+' | '-' | '*' | '/' | '==' | '!=' | '>' | '>=' | '<' | '<='

export interface ExpresionBinaria {
  readonly tipo: 'ExpresionBinaria'
  readonly operador: OperadorBinario
  readonly izquierda: Expresion
  readonly derecha: Expresion
  readonly span: Span
}

// ─────────────────────────── Instrucciones ──────────────────────────────

export type Instruccion = Declaracion | Retorno | Condicional

/** `DEFINIR nombre = expresion` — Docs/02 §19. */
export interface Declaracion {
  readonly tipo: 'Declaracion'
  readonly nombre: string
  readonly expresion: Expresion
  readonly span: Span
}

/** `RETORNAR expresion` — Docs/02 §37. */
export interface Retorno {
  readonly tipo: 'Retorno'
  readonly expresion: Expresion
  readonly span: Span
}

/** `SI cond ENTONCES ... [SINO ...] FIN` — Docs/02 §33-34. */
export interface Condicional {
  readonly tipo: 'Condicional'
  readonly condicion: Expresion
  readonly entonces: readonly Instruccion[]
  readonly sino: readonly Instruccion[] | null
  readonly span: Span
}

/** `REGLA nombre` + cuerpo — Docs/02 §56. */
export interface Regla {
  readonly tipo: 'Regla'
  readonly nombre: string
  readonly cuerpo: readonly Instruccion[]
  readonly span: Span
}
