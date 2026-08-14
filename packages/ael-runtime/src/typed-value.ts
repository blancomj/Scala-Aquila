/**
 * Valor tipado en tiempo de ejecución.
 * Propietario documental: Docs/06 §428 FINAL EXECUTION MODEL (AELValue).
 *
 * AD-20 (PLAN §3): esta es la ÚNICA frontera donde Capa B toca valores
 * reales de Capa A (Decimal/Money) — ael-core y ael-language nunca los ven,
 * solo la etiqueta estática `Tipo`. ael-runtime nunca construye un Decimal
 * o un Money "a mano": siempre delega en @aquila/financial-kernel.
 */
import type { Decimal, Money } from '@aquila/financial-kernel'
import { InvarianteEvaluadorError } from './errors.js'

export type TypedValue =
  | { readonly tipo: 'NUMBER'; readonly valor: Decimal }
  | { readonly tipo: 'BOOLEAN'; readonly valor: boolean }
  | { readonly tipo: 'MONEY'; readonly valor: Money }
  | { readonly tipo: 'NULO' }

/**
 * Guardas de estrechamiento en tiempo de ejecución. El AST no lleva tipos —
 * eso vive solo en el resultado del Analyzer — así que el evaluador necesita
 * volver a distinguir el `tipo` de un TypedValue antes de leer `.valor`.
 * Lanzan si no coincide: el llamador solo debe alcanzar esa rama si se saltó
 * `analizar()` o el ExecutionContext incumplió su contrato (0AEL §20).
 */
export function numero(v: TypedValue): Extract<TypedValue, { tipo: 'NUMBER' }> {
  if (v.tipo !== 'NUMBER') {
    throw new InvarianteEvaluadorError(`se esperaba NUMBER, se recibió ${v.tipo}`)
  }
  return v
}

export function dinero(v: TypedValue): Extract<TypedValue, { tipo: 'MONEY' }> {
  if (v.tipo !== 'MONEY') {
    throw new InvarianteEvaluadorError(`se esperaba MONEY, se recibió ${v.tipo}`)
  }
  return v
}

export function booleano(v: TypedValue): Extract<TypedValue, { tipo: 'BOOLEAN' }> {
  if (v.tipo !== 'BOOLEAN') {
    throw new InvarianteEvaluadorError(`se esperaba BOOLEAN, se recibió ${v.tipo}`)
  }
  return v
}
