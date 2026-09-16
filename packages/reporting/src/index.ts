/**
 * @aquila/reporting — renderers del Motor de Reportes (RPT-03).
 *
 * Existe como paquete y no como `utils/` de apps/web por una razón concreta:
 * RPT-05 enviará reportes programados desde una Edge Function (Deno), y esa
 * función necesita construir el mismo XLSX que la app. Un renderer que solo
 * viva en el front no se puede reutilizar ahí, y acabaríamos con dos formas
 * de armar el mismo archivo — justo lo que este corte viene a eliminar.
 *
 * Nada aquí importa Vue, Supabase, pdfmake ni xlsx: los módulos producen
 * datos (texto CSV, matriz de hoja, definición de documento) y cada
 * consumidor los materializa con su librería.
 */
export type {
  ColumnaReporte,
  EncabezadoReporte,
  FilaReporte,
  ResultadoReporte,
  TipoDato,
} from './tipos.js'

export {
  VACIO,
  anchoColumna,
  formatearFecha,
  formatearValor,
  formatoCeldaExcel,
  selloDeGeneracion,
  valorParaHoja,
} from './formato.js'

export { aCsv, escaparCampo, type OpcionesCsv } from './csv.js'

export {
  construirHoja,
  nombreArchivo,
  nombreHojaValido,
  totalesDe,
  type CeldaHoja,
  type HojaReporte,
  type OpcionesHoja,
} from './hoja.js'

export {
  construirDocumento,
  orientacionSugerida,
  type DocumentoReporte,
  type OpcionesDocumento,
} from './documento.js'

// ── Definición y parámetros (RPT-05) ────────────────────────────────────
// La traducción de «filtro por referencia» a «filtro con valor» vive aquí
// porque la usan los DOS ejecutores: el navegador y el despachador de
// reportes programados. Cuando vivía solo en el store de Pinia, la primera
// corrida programada produjo un archivo de cero filas.
export {
  definicionEjecutable,
  parametrosSinValor,
  resolverFiltros,
  type DefinicionReporte,
  type FiltroDefinicion,
  type ParametroDefinicion,
} from './definicion.js'
