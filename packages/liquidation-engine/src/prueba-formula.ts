/**
 * AEL-004 Fase 1 — "probar fórmula": la misma cadena de evaluación que
 * `executor.ts::evaluarConcepto` (Docs/06 §428: parsear → analizar →
 * evaluar), pero pública y sin lanzar — un intento de prueba ad-hoc del
 * usuario no es una liquidación real, así que un error de fórmula es un
 * resultado (`valido:false` + diagnósticos), no una excepción.
 */
import { analizar, parsear } from '@aquila/ael-language'
import { evaluar, type ExecutionContext, type TypedValue } from '@aquila/ael-runtime'
import type { Diagnostico } from '@aquila/ael-core'

export interface ResultadoPrueba {
  readonly valido: boolean
  readonly resultado: TypedValue | null
  readonly diagnosticos: readonly Diagnostico[]
}

export function probarFormula(
  formulaAelText: string,
  contexto: ExecutionContext,
  origen = '<prueba>',
): ResultadoPrueba {
  const { regla, diagnosticos: diagnosticosParser } = parsear(formulaAelText, origen)
  if (regla === null) {
    return { valido: false, resultado: null, diagnosticos: diagnosticosParser }
  }

  const { diagnosticos: diagnosticosAnalyzer } = analizar(regla, contexto.catalogo, origen)
  if (diagnosticosAnalyzer.length > 0) {
    return { valido: false, resultado: null, diagnosticos: diagnosticosAnalyzer }
  }

  const { resultado, diagnosticos } = evaluar(regla, contexto, origen)
  if (resultado === null || diagnosticos.length > 0) {
    return { valido: false, resultado: null, diagnosticos }
  }

  return { valido: true, resultado, diagnosticos: [] }
}
