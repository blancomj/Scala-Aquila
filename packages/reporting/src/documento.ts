/**
 * Documento imprimible (RPT-03, §29 del prompt).
 *
 * Construye la definición del documento que `pdfmake` sabe imprimir, pero
 * **no importa pdfmake**: devuelve datos. Así el armado del informe se prueba
 * sin navegador ni fuentes embebidas, y quien imprime (hoy la app, con el
 * import dinámico que ya usa `contabilidad/libros.vue`) solo pasa el objeto.
 *
 * El encabezado no es decorativo: reportar de qué copropiedad es, con qué
 * versión del reporte y con qué parámetros se ejecutó es lo que permite
 * responder «¿cómo se produjo este documento?» meses después (§95).
 *
 * Sobre colores: D-26 prohíbe hex hardcodeados en el repo, y este archivo no
 * tiene ninguno — los grises del documento se piden por nombre de token y el
 * que imprime los resuelve contra el tema.
 */
import { formatearValor, selloDeGeneracion } from './formato.js'
import { nombreArchivo } from './hoja.js'
import { totalesDe } from './hoja.js'
import type { ColumnaReporte, EncabezadoReporte, FilaReporte } from './tipos.js'

/** Subconjunto de pdfmake que este paquete produce, sin depender de él. */
export interface DocumentoReporte {
  readonly pageSize: string
  readonly pageOrientation: 'portrait' | 'landscape'
  readonly pageMargins: readonly [number, number, number, number]
  readonly content: readonly unknown[]
  readonly styles: Readonly<Record<string, unknown>>
  readonly defaultStyle: Readonly<Record<string, unknown>>
  readonly nombreArchivo: string
  /** Pie con numeración: pdfmake espera una función, se arma al imprimir. */
  readonly piePagina: { readonly texto: string }
}

export interface OpcionesDocumento {
  /** Muchas columnas no caben en vertical; se decide por número de columnas. */
  readonly orientacion?: 'portrait' | 'landscape'
  readonly incluirTotales?: boolean
}

/** A partir de seis columnas, el vertical aprieta hasta ser ilegible. */
export function orientacionSugerida(columnas: number): 'portrait' | 'landscape' {
  return columnas > 6 ? 'landscape' : 'portrait'
}

export function construirDocumento(
  columnas: readonly ColumnaReporte[],
  filas: readonly FilaReporte[],
  encabezado: EncabezadoReporte,
  opciones: OpcionesDocumento = {},
): DocumentoReporte {
  const generadoEn = encabezado.generadoEn ?? new Date()
  const alineacion = columnas.map((c) =>
    ['dinero', 'numero', 'porcentaje'].includes(c.tipo) ? 'right' : 'left',
  )

  const cuerpo: unknown[][] = [
    columnas.map((c, i) => ({ text: c.etiqueta, style: 'th', alignment: alineacion[i] })),
    ...filas.map((fila) =>
      columnas.map((c, i) => ({
        text: formatearValor(fila[c.clave], c.tipo),
        alignment: alineacion[i],
      })),
    ),
  ]

  if ((opciones.incluirTotales ?? true) && filas.length > 0) {
    const totales = totalesDe(columnas, filas)
    if (Object.keys(totales).length > 0) {
      cuerpo.push(
        columnas.map((c, i) => {
          if (i === 0) return { text: 'Total', style: 'th' }
          const total = totales[c.clave]
          return total === undefined
            ? { text: '' }
            : { text: formatearValor(total, c.tipo), style: 'th', alignment: alineacion[i] }
        }),
      )
    }
  }

  const subtitulos: unknown[] = [
    { text: `Copropiedad: ${encabezado.copropiedad}`, style: 'sub' },
  ]
  for (const [etiqueta, valor] of Object.entries(encabezado.parametros ?? {})) {
    subtitulos.push({ text: `${etiqueta}: ${valor}`, style: 'sub' })
  }
  if (encabezado.version !== undefined) {
    subtitulos.push({ text: `Versión del reporte: ${String(encabezado.version)}`, style: 'sub' })
  }
  subtitulos.push({
    text: `Generado: ${selloDeGeneracion(generadoEn, encabezado.zonaHoraria)}`,
    style: 'sub',
    margin: [0, 0, 0, 12],
  })

  return {
    pageSize: 'LETTER',
    pageOrientation: opciones.orientacion ?? orientacionSugerida(columnas.length),
    pageMargins: [32, 32, 32, 40],
    content: [
      { text: encabezado.titulo, style: 'titulo' },
      ...subtitulos,
      {
        table: {
          headerRows: 1,
          widths: columnas.map(() => '*'),
          body: cuerpo,
        },
        layout: 'lightHorizontalLines',
      },
      {
        text: `${String(filas.length)} ${filas.length === 1 ? 'registro' : 'registros'}`,
        style: 'sub',
        margin: [0, 8, 0, 0],
      },
    ],
    styles: {
      titulo: { fontSize: 14, bold: true, margin: [0, 0, 0, 6] },
      sub: { fontSize: 9, color: 'gray' },
      th: { bold: true, fontSize: 9 },
    },
    defaultStyle: { fontSize: 9 },
    nombreArchivo: nombreArchivo(encabezado.titulo, 'pdf', generadoEn),
    piePagina: { texto: encabezado.titulo },
  }
}
