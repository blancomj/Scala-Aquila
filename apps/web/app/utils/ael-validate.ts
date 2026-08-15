/**
 * Validación estática de fórmulas AEL en el cliente — feedback inmediato al
 * crear/editar un concepto, sin esperar a que falle en liquidar-periodo.
 *
 * El catálogo (aproximado, no un snapshot real) vive en ael-catalogo.ts —
 * compartido con el autocompletado/hover del editor (AelEditor.vue) para no
 * duplicarlo. Esta validación es una ayuda de UX, no la autoridad — esa
 * sigue siendo liquidar-periodo, que sí valida contra el snapshot real
 * (GAP-22 formal cuando exista).
 */
import { analizar, parsear } from '@aquila/ael-language'
import type { Diagnostico } from '@aquila/ael-core'
import { catalogoContratosEstatico } from './ael-catalogo'

export function validarFormulaAel(
  formula: string,
  codigosConceptosExistentes: string[],
): readonly Diagnostico[] {
  const { regla, diagnosticos: diagnosticosParser } = parsear(formula)
  if (!regla) return diagnosticosParser

  const catalogo = catalogoContratosEstatico(codigosConceptosExistentes)
  const { diagnosticos: diagnosticosAnalyzer } = analizar(regla, catalogo)
  return [...diagnosticosParser, ...diagnosticosAnalyzer]
}
