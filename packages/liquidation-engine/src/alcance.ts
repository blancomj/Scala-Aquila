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
  | 'tipo_inmueble'
  | 'agrupacion'

/** Campos categóricos (códigos de lista_tipos o enum) — solo eq/neq tienen sentido.
 * Los demás son numéricos — admiten también gt/gte/lt/lte.
 * `agrupacion` también es categórico pero NO entra aquí: no se compara por
 * igualdad de valor sino por pertenencia al subárbol (ver evaluarHoja). */
const CAMPOS_CATEGORICOS: ReadonlySet<CampoCondicion> = new Set([
  'estado_legal',
  'habitabilidad',
  'tipo_propietario',
  'tipo_inquilino',
  'uso_predio',
  'tipo_inmueble',
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
  /** Código de TIPO_INMUEBLE (local, oficina, bodega...) — ADC-01. Es la
   * dimensión "qué ES la unidad", distinta de usoPredio ("a qué se dedica"):
   * tipo=local + uso=restaurante son dos hechos independientes. */
  readonly tipoInmueble: string | null
  /** ADC-01 — ids de agrupación desde la raíz hasta la del inmueble, inclusive.
   * Una condición `agrupacion eq X` cumple si X está en esta ruta, no solo si
   * es la agrupación directa: "sector comercial" es un ANCESTRO del local
   * (Sector → Bloque → Nivel → Local), nunca su padre inmediato. null = el
   * inmueble no está agrupado. */
  readonly agrupacionRuta: readonly string[] | null
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
    case 'tipo_inmueble':
      return atributos.tipoInmueble
    case 'agrupacion':
      return null // resuelto aparte — ver evaluarHoja (pertenencia al subárbol, no igualdad)
  }
}

/** Una hoja evaluada. `sinDato` distingue las dos razones por las que una hoja
 * puede no cumplirse: el inmueble tiene el dato y no coincide (esperado), o el
 * inmueble NO tiene el dato (sospechoso — ADC-01: un local sin uso_predio
 * clasificado queda fuera de "vigilancia comercial" en silencio y su parte se
 * redistribuye entre los demás). El motor recolecta las segundas para avisar. */
interface HojaEvaluada {
  readonly cumple: boolean
  readonly sinDato: boolean
}

/** ADC-01 — `agrupacion` no compara igualdad de valor sino pertenencia al
 * subárbol: cumple si el id está en cualquier punto de la ruta de ancestros. */
function evaluarAgrupacion(hoja: CondicionHoja, ruta: readonly string[] | null): HojaEvaluada {
  if (ruta === null) return { cumple: false, sinDato: true }
  const pertenece = ruta.includes(String(hoja.valor))
  if (hoja.operador === 'eq') return { cumple: pertenece, sinDato: false }
  if (hoja.operador === 'neq') return { cumple: !pertenece, sinDato: false }
  return { cumple: false, sinDato: false } // gt/gte/lt/lte no tienen orden sobre un árbol
}

function evaluarHoja(
  hoja: CondicionHoja,
  atributos: AtributosInmueble,
  contexto: ContextoAlcance,
  coeficiente: string,
): HojaEvaluada {
  if (hoja.campo === 'agrupacion') return evaluarAgrupacion(hoja, atributos.agrupacionRuta)

  const actual = hoja.campo === 'coeficiente' ? Number(coeficiente) : valorDeCampo(hoja.campo, atributos, contexto)
  if (actual === null) return { cumple: false, sinDato: true }

  if (CAMPOS_CATEGORICOS.has(hoja.campo)) {
    if (hoja.operador === 'eq') return { cumple: actual === hoja.valor, sinDato: false }
    if (hoja.operador === 'neq') return { cumple: actual !== hoja.valor, sinDato: false }
    return { cumple: false, sinDato: false } // gt/gte/lt/lte no aplican a un campo categórico
  }

  const actualNum = Number(actual)
  const valorNum = Number(hoja.valor)
  switch (hoja.operador) {
    case 'eq':
      return { cumple: actualNum === valorNum, sinDato: false }
    case 'neq':
      return { cumple: actualNum !== valorNum, sinDato: false }
    case 'gt':
      return { cumple: actualNum > valorNum, sinDato: false }
    case 'gte':
      return { cumple: actualNum >= valorNum, sinDato: false }
    case 'lt':
      return { cumple: actualNum < valorNum, sinDato: false }
    case 'lte':
      return { cumple: actualNum <= valorNum, sinDato: false }
  }
}

/** Evaluación completa del árbol para un inmueble: si cumple, y qué campos se
 * consultaron sin que el inmueble tuviera el dato. `camposSinDato` solo es
 * significativo cuando `cumple` es false — si cumplió, ningún dato ausente
 * cambió el desenlace (ADC-01: el aviso se emite sobre los EXCLUIDOS). */
export interface EvaluacionAlcance {
  readonly cumple: boolean
  readonly camposSinDato: readonly CampoCondicion[]
}

export function evaluarAlcance(
  condicion: CondicionAlcance,
  atributos: AtributosInmueble,
  contexto: ContextoAlcance,
  coeficiente: string,
): EvaluacionAlcance {
  if (!esGrupo(condicion)) {
    const { cumple, sinDato } = evaluarHoja(condicion, atributos, contexto, coeficiente)
    return { cumple, camposSinDato: sinDato ? [condicion.campo] : [] }
  }
  const ramas = condicion.condiciones.map((c) => evaluarAlcance(c, atributos, contexto, coeficiente))
  const cumple =
    condicion.op === 'and' ? ramas.every((r) => r.cumple) : ramas.some((r) => r.cumple)
  return { cumple, camposSinDato: ramas.flatMap((r) => r.camposSinDato) }
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
  return evaluarAlcance(condicion, atributos, contexto, coeficiente).cumple
}
