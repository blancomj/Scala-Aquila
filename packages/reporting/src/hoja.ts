/**
 * Hoja de cálculo (RPT-03, §30 del prompt).
 *
 * Este módulo NO escribe el .xlsx: construye la hoja como dato —matriz de
 * celdas, anchos y formatos— y deja que cada consumidor la materialice con
 * su librería. La app usa `xlsx`, que ya está en el repo; la Edge Function
 * de RPT-05 usará la suya sin arrastrar esa dependencia hasta aquí.
 *
 * Además el resultado es comprobable en una prueba unitaria sin abrir un
 * archivo binario: se verifica la matriz, que es donde están los errores de
 * verdad (una columna corrida, un total que no cuadra, un número exportado
 * como texto).
 */
import { anchoColumna, formatoCeldaExcel, selloDeGeneracion, valorParaHoja } from './formato.js'
import type { ColumnaReporte, EncabezadoReporte, FilaReporte, TipoDato } from './tipos.js'

export type CeldaHoja = string | number | boolean | null

export interface HojaReporte {
  readonly nombre: string
  /** Matriz lista para `aoa_to_sheet`: encabezado, títulos y datos. */
  readonly celdas: readonly (readonly CeldaHoja[])[]
  readonly anchos: readonly number[]
  /** Formato de Excel por columna, alineado con `anchos`. */
  readonly formatos: readonly (string | undefined)[]
  /** Fila (base 0) donde empiezan los títulos de columna. */
  readonly filaEncabezados: number
  readonly nombreArchivo: string
}

export interface OpcionesHoja {
  /** Metadatos arriba del todo: quién, cuándo y con qué parámetros (§95). */
  readonly incluirEncabezado?: boolean
  readonly nombreHoja?: string
}

/** Nombre de hoja válido en Excel: ≤31 caracteres y sin `: \ / ? * [ ]`. */
export function nombreHojaValido(titulo: string): string {
  const limpio = titulo.replace(/[:\\/?*[\]]/g, ' ').trim()
  return (limpio || 'Reporte').slice(0, 31)
}

/** Nombre de archivo sin acentos ni espacios, con la fecha del día. */
export function nombreArchivo(titulo: string, extension: string, fecha = new Date()): string {
  const base = titulo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const dia = [
    fecha.getFullYear(),
    String(fecha.getMonth() + 1).padStart(2, '0'),
    String(fecha.getDate()).padStart(2, '0'),
  ].join('-')
  return `${base || 'reporte'}-${dia}.${extension}`
}

function lineasDeEncabezado(encabezado: EncabezadoReporte): CeldaHoja[][] {
  const lineas: CeldaHoja[][] = [
    [encabezado.titulo],
    [`Copropiedad: ${encabezado.copropiedad}`],
  ]

  if (encabezado.version !== undefined) {
    lineas.push([`Versión del reporte: ${String(encabezado.version)}`])
  }

  for (const [etiqueta, valor] of Object.entries(encabezado.parametros ?? {})) {
    lineas.push([`${etiqueta}: ${valor}`])
  }

  lineas.push([
    `Generado: ${selloDeGeneracion(encabezado.generadoEn ?? new Date(), encabezado.zonaHoraria)}`,
  ])
  // Una fila en blanco separa los metadatos de la tabla.
  lineas.push([])
  return lineas
}

export function construirHoja(
  columnas: readonly ColumnaReporte[],
  filas: readonly FilaReporte[],
  encabezado: EncabezadoReporte,
  opciones: OpcionesHoja = {},
): HojaReporte {
  const metadatos = (opciones.incluirEncabezado ?? true) ? lineasDeEncabezado(encabezado) : []

  const titulos: CeldaHoja[] = columnas.map((c) => c.etiqueta)
  const datos: CeldaHoja[][] = filas.map((fila) =>
    columnas.map((c) => valorParaHoja(fila[c.clave], c.tipo)),
  )

  return {
    nombre: nombreHojaValido(opciones.nombreHoja ?? encabezado.titulo),
    celdas: [...metadatos, titulos, ...datos],
    anchos: columnas.map((c) => anchoColumna(c.etiqueta, c.tipo)),
    formatos: columnas.map((c) => formatoCeldaExcel(c.tipo)),
    filaEncabezados: metadatos.length,
    nombreArchivo: nombreArchivo(encabezado.titulo, 'xlsx', encabezado.generadoEn),
  }
}

/** Totales por columna numérica, para el pie de la tabla. */
export function totalesDe(
  columnas: readonly ColumnaReporte[],
  filas: readonly FilaReporte[],
): Readonly<Record<string, number>> {
  const sumables: TipoDato[] = ['dinero', 'numero']
  const totales: Record<string, number> = {}

  for (const columna of columnas) {
    if (!sumables.includes(columna.tipo)) continue
    totales[columna.clave] = filas.reduce((suma, fila) => {
      const valor = Number(fila[columna.clave])
      return Number.isNaN(valor) ? suma : suma + valor
    }, 0)
  }
  return totales
}
