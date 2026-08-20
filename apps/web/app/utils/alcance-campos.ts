/**
 * Metadata de UI para el vocabulario cerrado de `alcance.ts` (Fase 5) —
 * qué campos existen, cómo se editan (catálogo lista_tipos / valores fijos /
 * número / mes) y qué operadores tienen sentido para cada uno. La fuente de
 * verdad de qué campos existen y cuáles son categóricos sigue siendo
 * @aquila/liquidation-engine/alcance (CAMPOS_CATEGORICOS ahí) — esta lista
 * espeja esa misma clasificación, no la reemplaza.
 */
import type { CampoCondicion, OperadorCondicion } from '@aquila/liquidation-engine/alcance'

export type TipoCampoAlcance = 'catalogo' | 'fijo' | 'numero' | 'mes'

export interface CampoAlcanceMeta {
  readonly campo: CampoCondicion
  readonly etiqueta: string
  readonly tipo: TipoCampoAlcance
  /** Solo para tipo='catalogo' — familia de lista_tipos a consultar. */
  readonly familiaListaTipos?: string
  /** Solo para tipo='fijo' — el valor real que evalúa alcance.ts (código, no id). */
  readonly opcionesFijas?: ReadonlyArray<{ readonly valor: string; readonly etiqueta: string }>
}

const OPCIONES_TIPO_PERSONA = [
  { valor: 'natural', etiqueta: 'Persona natural' },
  { valor: 'juridica', etiqueta: 'Persona jurídica' },
] as const

export const CAMPOS_ALCANCE: readonly CampoAlcanceMeta[] = [
  {
    campo: 'estado_legal',
    etiqueta: 'Estado legal del predio',
    tipo: 'catalogo',
    familiaListaTipos: 'ESTADO_LEGAL_PREDIO',
  },
  {
    campo: 'habitabilidad',
    etiqueta: 'Habitabilidad',
    tipo: 'catalogo',
    familiaListaTipos: 'HABITABILIDAD_PREDIO',
  },
  {
    campo: 'uso_predio',
    etiqueta: 'Uso del predio',
    tipo: 'catalogo',
    familiaListaTipos: 'USO_PREDIO',
  },
  { campo: 'area_privada', etiqueta: 'Área privada (m²)', tipo: 'numero' },
  { campo: 'coeficiente', etiqueta: 'Coeficiente de copropiedad', tipo: 'numero' },
  { campo: 'saldo_actual', etiqueta: 'Saldo actual (cuenta corriente)', tipo: 'numero' },
  { campo: 'tipo_propietario', etiqueta: 'Tipo de propietario', tipo: 'fijo', opcionesFijas: OPCIONES_TIPO_PERSONA },
  { campo: 'tipo_inquilino', etiqueta: 'Tipo de inquilino', tipo: 'fijo', opcionesFijas: OPCIONES_TIPO_PERSONA },
  { campo: 'mes_actual', etiqueta: 'Mes actual del periodo liquidado', tipo: 'mes' },
  { campo: 'anio_actual', etiqueta: 'Año actual del periodo liquidado', tipo: 'numero' },
]

const CAMPOS_CATEGORICOS: ReadonlySet<CampoCondicion> = new Set([
  'estado_legal',
  'habitabilidad',
  'tipo_propietario',
  'tipo_inquilino',
  'uso_predio',
])

export function operadoresPara(campo: CampoCondicion): readonly OperadorCondicion[] {
  return CAMPOS_CATEGORICOS.has(campo) ? ['eq', 'neq'] : ['eq', 'neq', 'gt', 'gte', 'lt', 'lte']
}

export const ETIQUETA_OPERADOR: Record<OperadorCondicion, string> = {
  eq: '=',
  neq: '≠',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
}

export function metaDeCampo(campo: CampoCondicion): CampoAlcanceMeta {
  const meta = CAMPOS_ALCANCE.find((c) => c.campo === campo)
  if (!meta) throw new Error(`Campo de alcance desconocido: ${campo}`)
  return meta
}
