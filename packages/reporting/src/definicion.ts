/**
 * La definición de un reporte y la resolución de sus parámetros (RPT-05).
 *
 * POR QUÉ ESTO VIVE AQUÍ Y NO EN EL STORE
 * ───────────────────────────────────────
 * Una definición guarda sus filtros por REFERENCIA —«el campo fecha_pago,
 * entre el parámetro `desde` y el parámetro `hasta`»— y el compilador de la
 * base (`fn_reporte_ejecutar`) solo entiende VALORES. Alguien tiene que
 * traducir, y hasta RPT-05 ese alguien era el store de Pinia.
 *
 * Eso funcionó mientras el único ejecutor fue el navegador. En cuanto
 * apareció el despachador de reportes programados —que corre en Deno y no
 * puede importar un store de Vue— la traducción faltó, y **la primera
 * corrida programada produjo un archivo de cero filas**: los filtros
 * llegaron sin valor y el compilador no devolvió nada. No falló; entregó un
 * informe vacío, que es peor.
 *
 * Así que la traducción baja aquí, donde ya viven los renderers: es la misma
 * regla, la usan los dos ejecutores, y se prueba una vez.
 */

export interface ParametroDefinicion {
  readonly codigo: string
  readonly etiqueta: string
  readonly tipo: 'fecha' | 'texto' | 'numero' | 'booleano'
  readonly requerido: boolean
  /** De dónde sale el valor sugerido la primera vez que se abre el reporte. */
  readonly origen?: 'hoy' | 'inicio_mes' | 'ultimo_corte_cartera'
}

export interface FiltroDefinicion {
  readonly campo: string
  readonly operador: string
  readonly valor?: unknown
  /** Referencia a un parámetro, para operadores de un solo valor. */
  readonly parametro?: string
  /** Referencias para el operador `entre`. */
  readonly parametro_desde?: string
  readonly parametro_hasta?: string
  readonly desde?: unknown
  readonly hasta?: unknown
}

export interface DefinicionReporte {
  readonly fuente: string
  readonly campos: readonly { campo: string; agregacion?: string; alias?: string }[]
  readonly filtros?: readonly FiltroDefinicion[]
  readonly agrupar?: readonly string[]
  readonly orden?: readonly { campo: string; direccion?: 'asc' | 'desc' }[]
  readonly parametros?: readonly ParametroDefinicion[]
}

/**
 * Sustituye las referencias a parámetros por sus valores. Lo que sale de
 * aquí es lo único que el compilador sabe leer.
 *
 * Un filtro sin referencias se devuelve intacto: no todos los filtros son
 * parametrizables, y un reporte puede traer condiciones fijas.
 */
export function resolverFiltros(
  definicion: DefinicionReporte,
  valores: Readonly<Record<string, string>>,
): FiltroDefinicion[] {
  return (definicion.filtros ?? []).map((filtro) => {
    if (filtro.parametro) {
      return { campo: filtro.campo, operador: filtro.operador, valor: valores[filtro.parametro] }
    }
    if (filtro.parametro_desde !== undefined || filtro.parametro_hasta !== undefined) {
      return {
        campo: filtro.campo,
        operador: filtro.operador,
        desde: filtro.parametro_desde ? valores[filtro.parametro_desde] : filtro.desde,
        hasta: filtro.parametro_hasta ? valores[filtro.parametro_hasta] : filtro.hasta,
      }
    }
    return filtro
  })
}

/**
 * La definición lista para ejecutar: la original con sus filtros ya
 * resueltos. Es lo que se manda a `fn_reporte_ejecutar`.
 */
export function definicionEjecutable(
  definicion: DefinicionReporte,
  valores: Readonly<Record<string, string>>,
): DefinicionReporte {
  return { ...definicion, filtros: resolverFiltros(definicion, valores) }
}

/**
 * Parámetros declarados que se quedaron sin valor. Un reporte programado
 * cuyo filtro obligatorio llega vacío no debe enviarse en silencio: lo que
 * saldría es un archivo vacío con pinta de informe.
 */
export function parametrosSinValor(
  definicion: DefinicionReporte,
  valores: Readonly<Record<string, string>>,
): string[] {
  return (definicion.parametros ?? [])
    .filter((p) => p.requerido && !valores[p.codigo])
    .map((p) => p.codigo)
}
