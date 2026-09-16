/**
 * Contrato de salida del Motor de Reportes (RPT-03).
 *
 * Es deliberadamente pobre: una columna, un tipo y filas planas. Todo lo que
 * los renderers necesitan saber lo dice el catálogo (`reporte_campos`), y
 * nada aquí depende de Vue, de Supabase ni del navegador — por eso el
 * paquete sirve igual a la app y, más adelante, a la Edge Function que
 * enviará los reportes programados (RPT-05).
 */

/** Los mismos tipos que declara `reporte_campos.tipo_dato`. */
export type TipoDato = 'texto' | 'numero' | 'dinero' | 'fecha' | 'booleano' | 'porcentaje'

export interface ColumnaReporte {
  /** Nombre de la propiedad en la fila — el código del campo del catálogo. */
  readonly clave: string
  /** Lo que lee la persona: alias del reporte o etiqueta del catálogo. */
  readonly etiqueta: string
  readonly tipo: TipoDato
}

export type FilaReporte = Record<string, unknown>

/** Lo que identifica una ejecución concreta, para que el archivo lo diga. */
export interface EncabezadoReporte {
  readonly titulo: string
  readonly copropiedad: string
  /** Versión publicada con la que se ejecutó — §95: cómo se produjo esto. */
  readonly version?: number
  readonly generadoEn?: Date
  /** Parámetros efectivos, ya resueltos: {etiqueta: valor mostrado}. */
  readonly parametros?: Readonly<Record<string, string>>
  /**
   * Zona de la copropiedad, para sellar la hora de generación. Sin ella se
   * usa la del entorno, y eso hace que el MISMO reporte diga una hora en el
   * navegador y otra en el servidor —que corre en UTC—. El sello dice
   * cuándo se produjo el documento: tiene que decirlo donde vive quien lo lee.
   */
  readonly zonaHoraria?: string
}

export interface ResultadoReporte {
  readonly columnas: readonly ColumnaReporte[]
  readonly filas: readonly FilaReporte[]
  readonly encabezado: EncabezadoReporte
}
