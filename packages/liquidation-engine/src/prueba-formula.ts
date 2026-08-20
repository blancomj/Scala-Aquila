/**
 * AEL-004 Fase 1 — "probar fórmula": la misma cadena de evaluación que
 * `executor.ts::evaluarConcepto` (Docs/06 §428: parsear → analizar →
 * evaluar), pero pública y sin lanzar — un intento de prueba ad-hoc del
 * usuario no es una liquidación real, así que un error de fórmula es un
 * resultado (`valido:false` + diagnósticos), no una excepción.
 */
import { analizar, parsear } from '@aquila/ael-language'
import { evaluar, type ExecutionContext, type PasoTraza, type TypedValue } from '@aquila/ael-runtime'
import type { Diagnostico } from '@aquila/ael-core'

export interface ResultadoPrueba {
  readonly valido: boolean
  readonly resultado: TypedValue | null
  readonly diagnosticos: readonly Diagnostico[]
  /** Traza paso a paso (DEFINIR/RETORNAR, en orden) — "Detalle del cálculo"
   * en la UI. Vacía si el error ocurrió antes de evaluar (parseo/análisis). */
  readonly traza: readonly PasoTraza[]
}

export function probarFormula(
  formulaAelText: string,
  contexto: ExecutionContext,
  origen = '<prueba>',
): ResultadoPrueba {
  const { regla, diagnosticos: diagnosticosParser } = parsear(formulaAelText, origen)
  if (regla === null) {
    return { valido: false, resultado: null, diagnosticos: diagnosticosParser, traza: [] }
  }

  const { diagnosticos: diagnosticosAnalyzer } = analizar(regla, contexto.catalogo, origen)
  if (diagnosticosAnalyzer.length > 0) {
    return { valido: false, resultado: null, diagnosticos: diagnosticosAnalyzer, traza: [] }
  }

  const { resultado, diagnosticos, traza } = evaluar(regla, contexto, origen)
  if (resultado === null || diagnosticos.length > 0) {
    return { valido: false, resultado: null, diagnosticos, traza }
  }

  return { valido: true, resultado, diagnosticos: [], traza }
}
