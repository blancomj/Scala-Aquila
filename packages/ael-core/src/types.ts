/**
 * Sistema de tipos estático de AEL v0.
 * Propietario documental: Docs/01 §11 TYPE SYSTEM.
 *
 * V0 implementa el subconjunto que las tres reglas piloto de
 * paso0/INFORME_PASO_0.md ejercitan: NUMBER, BOOLEAN, MONEY, NULO.
 * QUANTITY, DATE, DATETIME, STRING, LIST quedan diferidos — ningún caso
 * real los necesita todavía (AD-21, regla de alcance cerrado PLAN §3.4).
 *
 * Sin dependencia de @aquila/financial-kernel: son etiquetas de tipo para
 * el Analyzer, no valores en tiempo de ejecución (esos viven en
 * ael-runtime, el único punto de la Capa B que toca Money/Decimal reales).
 */
export const TIPOS = ['NUMBER', 'BOOLEAN', 'MONEY', 'NULO'] as const
export type Tipo = (typeof TIPOS)[number]

export function esTipoValido(valor: string): valor is Tipo {
  return (TIPOS as readonly string[]).includes(valor)
}
