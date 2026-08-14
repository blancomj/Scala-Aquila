/**
 * Modelo de diagnósticos AEL.
 * Propietario documental: Docs/01 §27 (DIAGNÓSTICOS).
 *
 * Un diagnóstico es la única forma autorizada de reportar un problema de
 * análisis. `0AEL §23` prohíbe destruir información diagnóstica.
 */

/** Docs/01 §27 — severidades. */
export const SEVERIDADES = ['ERROR', 'WARNING', 'INFO'] as const
export type Severidad = (typeof SEVERIDADES)[number]

/** Posición de un carácter en el Source. 1-indexada, como espera el editor. */
export interface Posicion {
  readonly linea: number
  readonly columna: number
}

/** Rango [inicio, fin) sobre el Source. */
export interface Span {
  readonly inicio: Posicion
  readonly fin: Posicion
}

/**
 * Docs/01 §27 — un diagnóstico contiene conceptualmente:
 * code · severity · message · line · column · span · source · details · suggestions
 */
export interface Diagnostico {
  readonly codigo: string
  readonly severidad: Severidad
  readonly mensaje: string
  readonly span: Span
  readonly origen: string
  readonly detalles?: Readonly<Record<string, unknown>>
  readonly sugerencias?: readonly string[]
}

/**
 * Los códigos siguen `AEL-<CAPA>-<NOMBRE>` (Docs/01 §26, §31).
 * Se valida el formato para que ningún código llegue sin estructura.
 */
const PATRON_CODIGO = /^AEL-[A-Z]+-[A-Z0-9_]+$/

export function esCodigoValido(codigo: string): boolean {
  return PATRON_CODIGO.test(codigo)
}

export class CodigoDiagnosticoInvalidoError extends Error {
  constructor(codigo: string) {
    super(`Código de diagnóstico inválido: "${codigo}". Formato esperado: AEL-<CAPA>-<NOMBRE>.`)
    this.name = 'CodigoDiagnosticoInvalidoError'
  }
}

export function crearDiagnostico(entrada: Diagnostico): Diagnostico {
  if (!esCodigoValido(entrada.codigo)) {
    throw new CodigoDiagnosticoInvalidoError(entrada.codigo)
  }
  return Object.freeze({ ...entrada })
}

export function esError(d: Diagnostico): boolean {
  return d.severidad === 'ERROR'
}

/**
 * Orden canónico y determinista: línea, columna, código.
 * `0AEL §21` exige diagnósticos deterministas — el orden forma parte del contrato.
 */
export function ordenarDiagnosticos(ds: readonly Diagnostico[]): readonly Diagnostico[] {
  return [...ds].sort((a, b) => {
    if (a.span.inicio.linea !== b.span.inicio.linea) {
      return a.span.inicio.linea - b.span.inicio.linea
    }
    if (a.span.inicio.columna !== b.span.inicio.columna) {
      return a.span.inicio.columna - b.span.inicio.columna
    }
    return a.codigo.localeCompare(b.codigo, 'en')
  })
}
