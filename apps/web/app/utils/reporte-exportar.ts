/**
 * Materializa lo que `@aquila/reporting` construye (RPT-03).
 *
 * El paquete produce datos —texto CSV, matriz de hoja, definición de
 * documento— y este archivo es lo único que toca el navegador: librerías por
 * import dinámico y la descarga. La división importa porque RPT-05 va a
 * construir los mismos archivos desde una Edge Function, donde nada de esto
 * existe.
 *
 * `xlsx` y `pdfmake` se cargan con import dinámico, igual que ya hacían
 * `contabilidad/libros.vue` y `recaudo/index.vue`: pesan demasiado para
 * entrar en el bundle de una página que casi nunca exporta.
 */
import {
  aCsv,
  construirDocumento,
  construirHoja,
  nombreArchivo,
  type ColumnaReporte,
  type EncabezadoReporte,
  type FilaReporte,
} from '@aquila/reporting'

/** Descarga un contenido ya generado, sin dejar el objeto URL colgando. */
function descargar(contenido: BlobPart, nombre: string, tipoMime: string): void {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipoMime }))
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  document.body.appendChild(enlace)
  enlace.click()
  document.body.removeChild(enlace)
  URL.revokeObjectURL(url)
}

export function exportarCsv(
  columnas: readonly ColumnaReporte[],
  filas: readonly FilaReporte[],
  encabezado: EncabezadoReporte,
): void {
  descargar(
    aCsv(columnas, filas),
    nombreArchivo(encabezado.titulo, 'csv', encabezado.generadoEn),
    'text/csv;charset=utf-8',
  )
}

export async function exportarXlsx(
  columnas: readonly ColumnaReporte[],
  filas: readonly FilaReporte[],
  encabezado: EncabezadoReporte,
): Promise<void> {
  const XLSX = await import('xlsx')
  const plano = construirHoja(columnas, filas, encabezado)

  const hoja = XLSX.utils.aoa_to_sheet(plano.celdas as unknown[][])
  hoja['!cols'] = plano.anchos.map((wch) => ({ wch }))

  // El formato numérico se aplica celda a celda: `xlsx` no tiene formato por
  // columna, y sin esto los montos salen como números pelados.
  const primeraFilaDatos = plano.filaEncabezados + 1
  plano.formatos.forEach((formato, columna) => {
    if (!formato) return
    for (let fila = primeraFilaDatos; fila < plano.celdas.length; fila += 1) {
      const celda = hoja[XLSX.utils.encode_cell({ r: fila, c: columna })] as
        | { t?: string; z?: string }
        | undefined
      if (celda && celda.t === 'n') celda.z = formato
    }
  })

  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, plano.nombre)
  XLSX.writeFile(libro, plano.nombreArchivo)
}

export async function exportarPdf(
  columnas: readonly ColumnaReporte[],
  filas: readonly FilaReporte[],
  encabezado: EncabezadoReporte,
): Promise<void> {
  const documento = construirDocumento(columnas, filas, encabezado)

  const pdfMake = (await import('pdfmake/build/pdfmake')).default
  const pdfFonts = (await import('pdfmake/build/vfs_fonts')).default as unknown as {
    pdfMake?: { vfs: Record<string, string> }
    vfs?: Record<string, string>
  }
  pdfMake.vfs = pdfFonts.pdfMake?.vfs ?? pdfFonts.vfs ?? {}

  pdfMake
    .createPdf({
      pageSize: documento.pageSize,
      pageOrientation: documento.pageOrientation,
      pageMargins: [...documento.pageMargins],
      content: documento.content as never,
      styles: documento.styles as never,
      defaultStyle: documento.defaultStyle as never,
      // La paginación se arma aquí porque pdfmake espera una función, que no
      // es serializable y por eso no puede vivir en el paquete.
      footer: (pagina: number, total: number) => ({
        columns: [
          { text: documento.piePagina.texto, fontSize: 8, color: 'gray' },
          { text: `Página ${pagina} de ${total}`, fontSize: 8, color: 'gray', alignment: 'right' },
        ],
        margin: [32, 12, 32, 0],
      }),
    } as never)
    .download(documento.nombreArchivo)
}
