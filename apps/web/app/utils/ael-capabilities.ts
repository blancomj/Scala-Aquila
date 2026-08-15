/**
 * AEL-004 Fase 4 — vista de capabilities (Doc 10 §59-61/§141): solo
 * descriptiva, sin motor de autorización — ver PLAN_AEL004_RULE_WORKSPACE.md
 * Fase 4. El runtime (packages/ael-runtime/src/context.ts) solo tiene 3
 * Contracts, todos de solo lectura y ya aislados por tenant vía RLS; esto
 * únicamente muestra cuáles usa una fórmula y por qué, reutilizando
 * tokenizar() (mismo criterio que el hover de AelEditor.vue) — no toca
 * ael-language/ael-runtime.
 */
import { tokenizar } from '@aquila/ael-language'
import { FUNCIONES_CATALOGO } from './ael-catalogo'

const CONTRATOS = ['PARAMETER', 'UNIT', 'CONCEPTO'] as const
type NombreContrato = (typeof CONTRATOS)[number]

export const CAPABILITY_POR_CONTRATO: Readonly<Record<NombreContrato, string>> = {
  PARAMETER: 'READ_PARAMETER',
  UNIT: 'READ_UNIT',
  CONCEPTO: 'READ_CONCEPTO',
}

export interface CapabilidadContrato {
  readonly contrato: NombreContrato
  readonly capability: string
  readonly campos: readonly string[]
}

export interface CapabilidadesFormula {
  readonly contratos: readonly CapabilidadContrato[]
  readonly funciones: readonly string[]
}

function esNombreContrato(lexema: string): lexema is NombreContrato {
  return (CONTRATOS as readonly string[]).includes(lexema)
}

/** Deriva qué Contracts/Functions usa una fórmula a partir de su texto —
 * puramente informativo, no valida ni ejecuta nada. */
export function extraerCapabilidades(formulaAelText: string): CapabilidadesFormula {
  const { tokens } = tokenizar(formulaAelText)
  const camposPorContrato = new Map<NombreContrato, Set<string>>()
  const funciones = new Set<string>()

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!

    if (
      token.tipo === 'IDENTIFICADOR' &&
      esNombreContrato(token.lexema) &&
      tokens[i + 1]?.tipo === 'PUNTO' &&
      tokens[i + 2]?.tipo === 'IDENTIFICADOR'
    ) {
      const campo = tokens[i + 2]!.lexema
      const campos = camposPorContrato.get(token.lexema) ?? new Set<string>()
      campos.add(campo)
      camposPorContrato.set(token.lexema, campos)
    }

    if (
      token.tipo === 'IDENTIFICADOR' &&
      token.lexema in FUNCIONES_CATALOGO &&
      tokens[i + 1]?.tipo === 'PARENTESIS_IZQ'
    ) {
      funciones.add(token.lexema)
    }
  }

  const contratos = CONTRATOS.filter((contrato) => camposPorContrato.has(contrato)).map(
    (contrato) => ({
      contrato,
      capability: CAPABILITY_POR_CONTRATO[contrato],
      campos: [...(camposPorContrato.get(contrato) ?? [])].sort(),
    }),
  )

  return { contratos, funciones: [...funciones].sort() }
}
