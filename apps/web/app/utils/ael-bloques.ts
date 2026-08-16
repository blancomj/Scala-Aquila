/**
 * AEL-004 Fase 7 — modelo de "bloques" para el constructor visual, y su
 * conversión bidireccional contra el AST real de @aquila/ael-language.
 *
 * Cada tipo de bloque es el nodo AST correspondiente (mismo discriminante
 * `tipo`, mismos campos) más un `id` para :key/drag/selección en el
 * canvas, con los hijos apuntando a *Bloque en vez de a Expresion/
 * Instruccion crudos. No hay `span`: el canvas no necesita posición
 * textual — astABloques() la descarta, bloquesAAst() genera un span
 * centinela (ver ESPAN_SINTETICO) porque analizar()/evaluar() no
 * dependen semánticamente del span, solo lo usan para ubicar
 * diagnósticos.
 *
 * Invariante heredada de ast.ts: NumeroLiteral.valor/DineroLiteral.monto
 * son el lexema crudo, nunca parseFloat. Cualquier UI que edite estos
 * campos debe capturar/emitir string con validación por regex, nunca
 * Number(x).toString() — eso reescribiría silenciosamente "100.50" como
 * "100.5" o rompería precisión decimal.
 */
import type {
  Condicional,
  Declaracion,
  Expresion,
  Instruccion,
  OperadorBinario,
  OperadorUnario,
  Regla,
  Retorno,
} from '@aquila/ael-language'
import type { Span } from '@aquila/ael-core'

const ESPAN_SINTETICO: Span = {
  inicio: { linea: 1, columna: 1 },
  fin: { linea: 1, columna: 1 },
}

function id(): string {
  return crypto.randomUUID()
}

export type BloqueExpresion =
  | BloqueNumeroLiteral
  | BloqueDineroLiteral
  | BloqueBooleanoLiteral
  | BloqueNuloLiteral
  | BloqueIdentificador
  | BloqueReferenciaContract
  | BloqueLlamadaFuncion
  | BloqueExpresionUnaria
  | BloqueExpresionBinaria

export interface BloqueNumeroLiteral {
  readonly id: string
  readonly tipo: 'NumeroLiteral'
  readonly valor: string
}

export interface BloqueDineroLiteral {
  readonly id: string
  readonly tipo: 'DineroLiteral'
  readonly monto: string
  readonly moneda: string
}

export interface BloqueBooleanoLiteral {
  readonly id: string
  readonly tipo: 'BooleanoLiteral'
  readonly valor: boolean
}

export interface BloqueNuloLiteral {
  readonly id: string
  readonly tipo: 'NuloLiteral'
}

export interface BloqueIdentificador {
  readonly id: string
  readonly tipo: 'Identificador'
  readonly nombre: string
}

export interface BloqueReferenciaContract {
  readonly id: string
  readonly tipo: 'ReferenciaContract'
  readonly contrato: string
  readonly campo: string
}

export interface BloqueLlamadaFuncion {
  readonly id: string
  readonly tipo: 'LlamadaFuncion'
  readonly nombre: string
  readonly argumentos: readonly BloqueExpresion[]
}

export interface BloqueExpresionUnaria {
  readonly id: string
  readonly tipo: 'ExpresionUnaria'
  readonly operador: OperadorUnario
  readonly operando: BloqueExpresion
}

export interface BloqueExpresionBinaria {
  readonly id: string
  readonly tipo: 'ExpresionBinaria'
  readonly operador: OperadorBinario
  readonly izquierda: BloqueExpresion
  readonly derecha: BloqueExpresion
}

export type BloqueInstruccion = BloqueDeclaracion | BloqueRetorno | BloqueCondicional

export interface BloqueDeclaracion {
  readonly id: string
  readonly tipo: 'Declaracion'
  readonly nombre: string
  readonly expresion: BloqueExpresion
}

export interface BloqueRetorno {
  readonly id: string
  readonly tipo: 'Retorno'
  readonly expresion: BloqueExpresion
}

export interface BloqueCondicional {
  readonly id: string
  readonly tipo: 'Condicional'
  readonly condicion: BloqueExpresion
  readonly entonces: readonly BloqueInstruccion[]
  readonly sino: readonly BloqueInstruccion[] | null
}

export interface BloqueRegla {
  readonly id: string
  readonly tipo: 'Regla'
  readonly nombre: string
  readonly cuerpo: readonly BloqueInstruccion[]
}

// ─────────────────────────── AST → bloques ───────────────────────────

function expresionABloque(expr: Expresion): BloqueExpresion {
  switch (expr.tipo) {
    case 'NumeroLiteral':
      return { id: id(), tipo: 'NumeroLiteral', valor: expr.valor }
    case 'DineroLiteral':
      return { id: id(), tipo: 'DineroLiteral', monto: expr.monto, moneda: expr.moneda }
    case 'BooleanoLiteral':
      return { id: id(), tipo: 'BooleanoLiteral', valor: expr.valor }
    case 'NuloLiteral':
      return { id: id(), tipo: 'NuloLiteral' }
    case 'Identificador':
      return { id: id(), tipo: 'Identificador', nombre: expr.nombre }
    case 'ReferenciaContract':
      return { id: id(), tipo: 'ReferenciaContract', contrato: expr.contrato, campo: expr.campo }
    case 'LlamadaFuncion':
      return {
        id: id(),
        tipo: 'LlamadaFuncion',
        nombre: expr.nombre,
        argumentos: expr.argumentos.map(expresionABloque),
      }
    case 'ExpresionUnaria':
      return {
        id: id(),
        tipo: 'ExpresionUnaria',
        operador: expr.operador,
        operando: expresionABloque(expr.operando),
      }
    case 'ExpresionBinaria':
      return {
        id: id(),
        tipo: 'ExpresionBinaria',
        operador: expr.operador,
        izquierda: expresionABloque(expr.izquierda),
        derecha: expresionABloque(expr.derecha),
      }
  }
}

function instruccionABloque(inst: Instruccion): BloqueInstruccion {
  switch (inst.tipo) {
    case 'Declaracion':
      return {
        id: id(),
        tipo: 'Declaracion',
        nombre: inst.nombre,
        expresion: expresionABloque(inst.expresion),
      }
    case 'Retorno':
      return { id: id(), tipo: 'Retorno', expresion: expresionABloque(inst.expresion) }
    case 'Condicional':
      return {
        id: id(),
        tipo: 'Condicional',
        condicion: expresionABloque(inst.condicion),
        entonces: inst.entonces.map(instruccionABloque),
        sino: inst.sino === null ? null : inst.sino.map(instruccionABloque),
      }
  }
}

export function astABloques(regla: Regla): BloqueRegla {
  return {
    id: id(),
    tipo: 'Regla',
    nombre: regla.nombre,
    cuerpo: regla.cuerpo.map(instruccionABloque),
  }
}

// ─────────────────────────── bloques → AST ───────────────────────────

function bloqueAExpresion(bloque: BloqueExpresion): Expresion {
  switch (bloque.tipo) {
    case 'NumeroLiteral':
      return { tipo: 'NumeroLiteral', valor: bloque.valor, span: ESPAN_SINTETICO }
    case 'DineroLiteral':
      return {
        tipo: 'DineroLiteral',
        monto: bloque.monto,
        moneda: bloque.moneda,
        span: ESPAN_SINTETICO,
      }
    case 'BooleanoLiteral':
      return { tipo: 'BooleanoLiteral', valor: bloque.valor, span: ESPAN_SINTETICO }
    case 'NuloLiteral':
      return { tipo: 'NuloLiteral', span: ESPAN_SINTETICO }
    case 'Identificador':
      return { tipo: 'Identificador', nombre: bloque.nombre, span: ESPAN_SINTETICO }
    case 'ReferenciaContract':
      return {
        tipo: 'ReferenciaContract',
        contrato: bloque.contrato,
        campo: bloque.campo,
        span: ESPAN_SINTETICO,
      }
    case 'LlamadaFuncion':
      return {
        tipo: 'LlamadaFuncion',
        nombre: bloque.nombre,
        argumentos: bloque.argumentos.map(bloqueAExpresion),
        span: ESPAN_SINTETICO,
      }
    case 'ExpresionUnaria':
      return {
        tipo: 'ExpresionUnaria',
        operador: bloque.operador,
        operando: bloqueAExpresion(bloque.operando),
        span: ESPAN_SINTETICO,
      }
    case 'ExpresionBinaria':
      return {
        tipo: 'ExpresionBinaria',
        operador: bloque.operador,
        izquierda: bloqueAExpresion(bloque.izquierda),
        derecha: bloqueAExpresion(bloque.derecha),
        span: ESPAN_SINTETICO,
      }
  }
}

function bloqueAInstruccion(bloque: BloqueInstruccion): Instruccion {
  switch (bloque.tipo) {
    case 'Declaracion':
      return {
        tipo: 'Declaracion',
        nombre: bloque.nombre,
        expresion: bloqueAExpresion(bloque.expresion),
        span: ESPAN_SINTETICO,
      } satisfies Declaracion
    case 'Retorno':
      return {
        tipo: 'Retorno',
        expresion: bloqueAExpresion(bloque.expresion),
        span: ESPAN_SINTETICO,
      } satisfies Retorno
    case 'Condicional':
      return {
        tipo: 'Condicional',
        condicion: bloqueAExpresion(bloque.condicion),
        entonces: bloque.entonces.map(bloqueAInstruccion),
        sino: bloque.sino === null ? null : bloque.sino.map(bloqueAInstruccion),
        span: ESPAN_SINTETICO,
      } satisfies Condicional
  }
}

export function bloquesAAst(bloque: BloqueRegla): Regla {
  return {
    tipo: 'Regla',
    nombre: bloque.nombre,
    cuerpo: bloque.cuerpo.map(bloqueAInstruccion),
    span: ESPAN_SINTETICO,
  }
}

// ─────────────────── fábricas de bloques por defecto (E6) ───────────────
// Usadas por los botones "+ instrucción"/"+ argumento"/"envolver" del
// constructor visual: siempre producen un fragmento de AST válido (nunca
// un hueco), para que el árbol nunca quede en un estado que no imprima/
// parsee. NumeroLiteral('0') es el placeholder universal — cualquier otro
// tipo de literal exigiría inventar un valor por defecto no obvio (¿qué
// REGLA le pondrías a una ReferenciaContract en blanco?).

export function bloqueNumeroCero(): BloqueNumeroLiteral {
  return { id: id(), tipo: 'NumeroLiteral', valor: '0' }
}

export function bloqueDeclaracionVacia(): BloqueDeclaracion {
  return { id: id(), tipo: 'Declaracion', nombre: 'nueva', expresion: bloqueNumeroCero() }
}

export function bloqueRetornoVacio(): BloqueRetorno {
  return { id: id(), tipo: 'Retorno', expresion: bloqueNumeroCero() }
}

export function bloqueCondicionalVacio(): BloqueCondicional {
  return {
    id: id(),
    tipo: 'Condicional',
    condicion: { id: id(), tipo: 'BooleanoLiteral', valor: true },
    entonces: [],
    sino: null,
  }
}

/** Envuelve `bloque` como lado izquierdo de una nueva ExpresionBinaria. */
export function envolverEnBinaria(bloque: BloqueExpresion): BloqueExpresionBinaria {
  return {
    id: id(),
    tipo: 'ExpresionBinaria',
    operador: '+',
    izquierda: bloque,
    derecha: bloqueNumeroCero(),
  }
}
