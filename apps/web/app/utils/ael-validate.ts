/**
 * Validación estática de fórmulas AEL en el cliente — feedback inmediato al
 * crear/editar un concepto, sin esperar a que falle en liquidar-periodo.
 *
 * Catálogo aproximado, no un snapshot real: PARAMETER solo incluye los dos
 * campos que construirSnapshotDesdeSupabase efectivamente resuelve hoy
 * (PRESUPUESTO_ANUAL, OTROS_INGRESOS_ANUAL — packages/liquidation-engine/
 * src/snapshot-supabase.ts); UNIT queda vacío porque snapshot.unidades
 * nunca se puebla todavía (ningún campo de inmueble entra al snapshot);
 * CONCEPTO se arma con los códigos ya existentes en el tenant (GAP-22: todo
 * concepto es MONEY en v0, mismo criterio que context.ts). Esta validación
 * es una ayuda de UX, no la autoridad — esa sigue siendo liquidar-periodo,
 * que sí valida contra el snapshot real (GAP-22 formal cuando exista).
 */
import { analizar, parsear, type CatalogoContratos } from '@aquila/ael-language'
import type { Diagnostico } from '@aquila/ael-core'

export function validarFormulaAel(
  formula: string,
  codigosConceptosExistentes: string[],
): readonly Diagnostico[] {
  const { regla, diagnosticos: diagnosticosParser } = parsear(formula)
  if (!regla) return diagnosticosParser

  const catalogo: CatalogoContratos = {
    PARAMETER: { PRESUPUESTO_ANUAL: 'MONEY', OTROS_INGRESOS_ANUAL: 'MONEY' },
    UNIT: {},
    CONCEPTO: Object.fromEntries(codigosConceptosExistentes.map((codigo) => [codigo, 'MONEY'])),
  }

  const { diagnosticos: diagnosticosAnalyzer } = analizar(regla, catalogo)
  return [...diagnosticosParser, ...diagnosticosAnalyzer]
}
