/**
 * Metadata de UI para el vocabulario cerrado de `alcance.ts` (Fase 5) —
 * qué campos existen, cómo se editan (catálogo lista_tipos / valores fijos /
 * número / mes) y qué operadores tienen sentido para cada uno. La fuente de
 * verdad de qué campos existen y cuáles son categóricos sigue siendo
 * @aquila/liquidation-engine/alcance (CAMPOS_CATEGORICOS ahí) — esta lista
 * espeja esa misma clasificación, no la reemplaza.
 */
import type { CampoCondicion, OperadorCondicion } from '@aquila/liquidation-engine/alcance'

export type TipoCampoAlcance = 'catalogo' | 'fijo' | 'numero' | 'mes' | 'agrupacion'

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
  {
    // ADC-01 — qué ES la unidad (apartamento/local/oficina/bodega...),
    // distinto de uso_predio ("a qué se dedica": local + restaurante).
    campo: 'tipo_inmueble',
    etiqueta: 'Tipo de inmueble',
    tipo: 'catalogo',
    familiaListaTipos: 'TIPO_INMUEBLE',
  },
  {
    // ADC-01 — su valor es el id de una fila de `agrupaciones`, no de
    // `lista_tipos`: no encaja en 'catalogo'. La comparación en tiempo de
    // liquidación es contra el SUBÁRBOL (evaluarAgrupacion en alcance.ts),
    // no contra la agrupación directa del inmueble.
    campo: 'agrupacion',
    etiqueta: 'Agrupación (y todo lo que cuelga de ella)',
    tipo: 'agrupacion',
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
  'tipo_inmueble',
])

// ADC-01 — `agrupacion` tampoco tiene orden (gt/gte/lt/lte no significan nada
// sobre un árbol), pero se lista aparte de CAMPOS_CATEGORICOS porque su
// semántica de eq/neq es "pertenece/no pertenece al subárbol", no igualdad
// de valor — alcance.ts la trata distinto (evaluarAgrupacion), aunque aquí
// el conjunto de operadores válidos resulte ser el mismo.
export function operadoresPara(campo: CampoCondicion): readonly OperadorCondicion[] {
  return CAMPOS_CATEGORICOS.has(campo) || campo === 'agrupacion'
    ? ['eq', 'neq']
    : ['eq', 'neq', 'gt', 'gte', 'lt', 'lte']
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
