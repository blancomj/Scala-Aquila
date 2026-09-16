/**
 * CSV (RPT-03, §31 del prompt).
 *
 * Tres decisiones que casi siempre se equivocan al exportar CSV desde una
 * app en español, y que aquí quedan resueltas de una vez:
 *
 * 1. **BOM UTF-8.** Sin él, Excel en Windows abre el archivo en la
 *    codificación del sistema y «Administración» sale como «AdministraciÃ³n».
 *    Es la queja número uno de cualquier exportación a CSV en castellano.
 * 2. **Separador `;`.** En un Excel configurado en español, la coma es el
 *    separador decimal, así que un CSV separado por comas cae entero en una
 *    sola columna. Se puede cambiar, pero el valor por defecto es el que
 *    funciona para quien va a abrirlo.
 * 3. **Números sin formato de miles.** Lo que se exporta es el dato, no su
 *    presentación: «450000», no «$ 450.000», o la columna no suma.
 */
import { aBooleano, aTexto, formatearFecha } from './formato.js'
import type { ColumnaReporte, FilaReporte } from './tipos.js'

/** BOM UTF-8 por código: como carácter literal es invisible y se pierde. */
const BOM = String.fromCharCode(0xfeff)

export interface OpcionesCsv {
  readonly separador?: string
  readonly bom?: boolean
}

/**
 * Escapa un campo según RFC 4180: se entrecomilla si contiene el separador,
 * comillas o un salto de línea, y las comillas internas se duplican.
 */
export function escaparCampo(valor: string, separador: string): string {
  const necesitaComillas =
    valor.includes(separador) ||
    valor.includes('"') ||
    valor.includes('\n') ||
    valor.includes('\r')
  if (!necesitaComillas) return valor
  return `"${valor.replaceAll('"', '""')}"`
}

function celda(valor: unknown, tipo: ColumnaReporte['tipo']): string {
  if (valor === null || valor === undefined) return ''
  switch (tipo) {
    case 'dinero':
    case 'numero':
    case 'porcentaje':
      return aTexto(valor)
    case 'booleano':
      return aBooleano(valor) ? 'Sí' : 'No'
    case 'fecha':
      return formatearFecha(valor)
    default:
      return aTexto(valor)
  }
}

export function aCsv(
  columnas: readonly ColumnaReporte[],
  filas: readonly FilaReporte[],
  opciones: OpcionesCsv = {},
): string {
  const separador = opciones.separador ?? ';'
  const lineas = [
    columnas.map((c) => escaparCampo(c.etiqueta, separador)).join(separador),
    ...filas.map((fila) =>
      columnas
        .map((c) => escaparCampo(celda(fila[c.clave], c.tipo), separador))
        .join(separador),
    ),
  ]

  // CRLF: lo que esperan Excel y el propio RFC 4180.
  const contenido = lineas.join('\r\n')
  // El BOM va como escape, no como carácter literal: invisible en el editor
  // y fácil de perder en un copiado.
  return (opciones.bom ?? true) ? BOM + contenido : contenido
}
