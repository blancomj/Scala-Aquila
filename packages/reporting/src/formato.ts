/**
 * Formato de presentación, en un solo sitio (RPT-03).
 *
 * Antes de este paquete, cada pantalla formateaba a su manera: la auditoría
 * externa de 2026-08-26 ya había encontrado `formatoMoneda` copiado 18 veces,
 * una de ellas con otro formato. Un motor de reportes que repitiera ese
 * patrón produciría el mismo número escrito distinto según el archivo.
 *
 * Reglas que no son negociables aquí:
 *
 * · El formato sale del TIPO DECLARADO en el catálogo, nunca de inspeccionar
 *   el valor. Un código de inmueble que parece número («0102») es texto y no
 *   puede perder su cero a la izquierda.
 * · El dinero no se redondea al formatear; se muestra con la escala que el
 *   dominio ya decidió. Este paquete presenta, no calcula (PLAN §9.2).
 */
import type { TipoDato } from './tipos.js'

const LOCALE = 'es-CO'

/** Cómo se ve un dato vacío. Uno solo, para que las tablas no bailen. */
export const VACIO = '—'

/**
 * `String(valor)` sobre un `unknown` produce «[object Object]» en cuanto
 * llega algo que no es primitivo —un jsonb anidado, por ejemplo—. Aquí eso
 * se serializa, que al menos dice qué había.
 */
export function aTexto(valor: unknown): string {
  if (valor === null || valor === undefined) return ''
  if (typeof valor === 'string') return valor
  if (typeof valor === 'number' || typeof valor === 'boolean' || typeof valor === 'bigint') {
    return valor.toString()
  }
  // Una función o un symbol no se serializan (`JSON.stringify` devolvería
  // `undefined`); no tienen sitio en una celda, así que salen vacíos.
  if (typeof valor === 'function' || typeof valor === 'symbol') return ''
  return JSON.stringify(valor)
}

/**
 * Verdadero según el dominio, no según JavaScript: Postgres devuelve `'t'`
 * por PostgREST en algunos contextos, y `Boolean('f')` sería `true`.
 */
export function aBooleano(valor: unknown): boolean {
  return valor === true || valor === 'true' || valor === 't' || valor === 1
}

export function formatearValor(valor: unknown, tipo: TipoDato): string {
  if (valor === null || valor === undefined || valor === '') return VACIO

  switch (tipo) {
    case 'dinero':
      return new Intl.NumberFormat(LOCALE, {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0,
      }).format(Number(valor))

    case 'numero':
      return new Intl.NumberFormat(LOCALE).format(Number(valor))

    case 'porcentaje':
      return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 }).format(Number(valor))} %`

    case 'booleano':
      return aBooleano(valor) ? 'Sí' : 'No'

    case 'fecha':
      return formatearFecha(valor)

    default:
      return aTexto(valor)
  }
}

/**
 * Las fechas llegan de Postgres como 'YYYY-MM-DD'. Convertirlas con `new
 * Date(...)` las interpreta en UTC y, al mostrarlas en hora local de Bogotá
 * (UTC-5), retroceden un día: el 1.º de septiembre se imprime como 31 de
 * agosto. Se parten a mano, que además es más barato.
 */
export function formatearFecha(valor: unknown): string {
  const texto = aTexto(valor)
  const soloFecha = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto)
  if (soloFecha) return [soloFecha[3], soloFecha[2], soloFecha[1]].join('/')

  const fecha = new Date(texto)
  return Number.isNaN(fecha.getTime()) ? texto : fecha.toLocaleDateString(LOCALE)
}

/**
 * Valor para una celda de hoja de cálculo: los números viajan como números,
 * no como texto ya formateado. Exportar «$ 450.000» a Excel produce una
 * columna que no suma — el error más común al exportar desde una tabla ya
 * pintada, y justo lo que §30 del prompt señalaba.
 */
export function valorParaHoja(valor: unknown, tipo: TipoDato): string | number | boolean | null {
  if (valor === null || valor === undefined || valor === '') return null

  switch (tipo) {
    case 'dinero':
    case 'numero':
    case 'porcentaje': {
      const numero = Number(valor)
      return Number.isNaN(numero) ? aTexto(valor) : numero
    }
    case 'booleano':
      return aBooleano(valor)
    case 'fecha':
      return formatearFecha(valor)
    default:
      return aTexto(valor)
  }
}

/** Formato de celda de Excel por tipo, para que el número se vea bien. */
export function formatoCeldaExcel(tipo: TipoDato): string | undefined {
  switch (tipo) {
    case 'dinero':
      return '"$" #,##0'
    case 'numero':
      return '#,##0'
    case 'porcentaje':
      return '#,##0.00 "%"'
    default:
      return undefined
  }
}

/**
 * Sello de «generado el…» en la zona de la copropiedad.
 *
 * Sin zona, `toLocaleString` usa la del entorno, y el mismo reporte queda
 * sellado con una hora distinta según quién lo produzca: el navegador pone
 * la del usuario y el despachador de RPT-05 la de UTC, porque el servidor
 * corre ahí. Un documento que dice «generado a las 4:25 a. m.» cuando se
 * pidió para las 11:25 p. m. parece otro documento.
 */
export function selloDeGeneracion(fecha: Date, zonaHoraria?: string): string {
  return fecha.toLocaleString(LOCALE, zonaHoraria ? { timeZone: zonaHoraria } : undefined)
}

/** Ancho de columna razonable: ni recortada ni desierta. */
export function anchoColumna(etiqueta: string, tipo: TipoDato): number {
  const minimo = tipo === 'dinero' ? 16 : tipo === 'fecha' ? 12 : 10
  return Math.min(Math.max(etiqueta.length + 2, minimo), 40)
}
