/**
 * Alcance: condiciones de aplicación de un concepto — Fase 5 del plan
 * "Conceptos avanzados" (2026-08-20). AEL no tiene operadores lógicos
 * Y/O/NO (AD-21, límite deliberado v0) — las condiciones no pueden ser
 * una fórmula AEL, viven en su propio árbol evaluado aquí, en TypeScript
 * puro (sin Supabase — mismo criterio de D-14 que el resto del motor
 * salvo snapshot-supabase.ts).
 *
 * Vocabulario cerrado de campos (confirmado con el usuario, 2026-08-20):
 * "Fin Periodo contable" quedó fuera — no hay un concepto de cierre
 * contable definido en el esquema. "Uso del Predio" sí entra
 * (inmuebles.uso_predio_id, 20260830180000).
 */

export type OperadorCondicion = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'

export type CampoCondicion =
  | 'estado_legal'
  | 'habitabilidad'
  | 'area_privada'
  | 'coeficiente'
  | 'tipo_propietario'
  | 'tipo_inquilino'
  | 'uso_predio'
  | 'saldo_actual'
  | 'mes_actual'
  | 'anio_actual'

/** Campos categóricos (códigos de lista_tipos o enum) — solo eq/neq tienen sentido.
 * Los demás son numéricos — admiten también gt/gte/lt/lte. */
const CAMPOS_CATEGORICOS: ReadonlySet<CampoCondicion> = new Set([
  'estado_legal',
  'habitabilidad',
  'tipo_propietario',
  'tipo_inquilino',
  'uso_predio',
])

export interface CondicionHoja {
  readonly campo: CampoCondicion
  readonly operador: OperadorCondicion
  readonly valor: string | number
}

export interface CondicionGrupo {
  readonly op: 'and' | 'or'
  readonly condiciones: readonly CondicionAlcance[]
}

export type CondicionAlcance = CondicionHoja | CondicionGrupo

function esGrupo(condicion: CondicionAlcance): condicion is CondicionGrupo {
  return 'op' in condicion
}

/** Atributos por inmueble que el árbol de condiciones puede consultar —
 * uno por SnapshotInmueble (snapshot.ts). Un campo ausente (persona sin
 * rol vigente, área sin diligenciar...) es null — mismo criterio que
 * snapshot.unidades (17 §37 SNAPSHOT INCOMPLETE): no se inventa un valor,
 * la condición simplemente no se cumple (ver evaluarHoja). */
export interface AtributosInmueble {
  readonly estadoLegal: string | null
  readonly habitabilidad: string | null
  readonly areaPrivada: string | null
  readonly tipoPropietario: 'natural' | 'juridica' | null
  readonly tipoInquilino: 'natural' | 'juridica' | null
  readonly usoPredio: string | null
  readonly saldoActual: string | null
}

/** Mes/Año Actual: atributos del PERIODO que se liquida, no del inmueble —
 * el mismo valor para todos los inmuebles de una corrida (snapshot.periodo). */
export interface ContextoAlcance {
  readonly mesActual: number
  readonly anioActual: number
}

function valorDeCampo(
  campo: CampoCondicion,
  atributos: AtributosInmueble,
  contexto: ContextoAlcance,
): string | number | null {
  switch (campo) {
    case 'estado_legal':
      return atributos.estadoLegal
    case 'habitabilidad':
      return atributos.habitabilidad
    case 'area_privada':
      return atributos.areaPrivada === null ? null : Number(atributos.areaPrivada)
    case 'coeficiente':
      return null // resuelto aparte — ver inmuebleCumpleCondiciones (necesita SnapshotInmueble.coeficiente)
    case 'tipo_propietario':
      return atributos.tipoPropietario
    case 'tipo_inquilino':
      return atributos.tipoInquilino
    case 'uso_predio':
      return atributos.usoPredio
    case 'saldo_actual':
      return atributos.saldoActual === null ? null : Number(atributos.saldoActual)
    case 'mes_actual':
      return contexto.mesActual
    case 'anio_actual':
      return contexto.anioActual
  }
}

function evaluarHoja(
  hoja: CondicionHoja,
  atributos: AtributosInmueble,
  contexto: ContextoAlcance,
  coeficiente: string,
): boolean {
  const actual = hoja.campo === 'coeficiente' ? Number(coeficiente) : valorDeCampo(hoja.campo, atributos, contexto)
  if (actual === null) return false

  if (CAMPOS_CATEGORICOS.has(hoja.campo)) {
    if (hoja.operador === 'eq') return actual === hoja.valor
    if (hoja.operador === 'neq') return actual !== hoja.valor
    return false // gt/gte/lt/lte no aplican a un campo categórico — nunca cumple
  }

  const actualNum = Number(actual)
  const valorNum = Number(hoja.valor)
  switch (hoja.operador) {
    case 'eq':
      return actualNum === valorNum
    case 'neq':
      return actualNum !== valorNum
    case 'gt':
      return actualNum > valorNum
    case 'gte':
      return actualNum >= valorNum
    case 'lt':
      return actualNum < valorNum
    case 'lte':
      return actualNum <= valorNum
  }
}

/** true si el inmueble cumple el árbol de condiciones. coeficiente se pasa
 * aparte (no en AtributosInmueble) porque ya vive en SnapshotInmueble —
 * evita duplicar el mismo dato en dos lugares del snapshot. */
export function inmuebleCumpleCondiciones(
  condicion: CondicionAlcance,
  atributos: AtributosInmueble,
  contexto: ContextoAlcance,
  coeficiente: string,
): boolean {
  if (esGrupo(condicion)) {
    return condicion.op === 'and'
      ? condicion.condiciones.every((c) => inmuebleCumpleCondiciones(c, atributos, contexto, coeficiente))
      : condicion.condiciones.some((c) => inmuebleCumpleCondiciones(c, atributos, contexto, coeficiente))
  }
  return evaluarHoja(condicion, atributos, contexto, coeficiente)
}
