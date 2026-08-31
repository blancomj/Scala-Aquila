/** Constantes de UI compartidas entre las pantallas de liquidación. */

export const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
] as const

export type LiquidacionEstado =
  | 'pre_liquidada'
  | 'pendiente_aprobacion'
  | 'rechazada'
  | 'aplicada'
  | 'anulada'
  | 'descartada'
  | 'fallida'

export const ESTADO_UI: Record<
  string,
  { etiqueta: string; color: 'success' | 'error' | 'warning' | 'info' | 'neutral' }
> = {
  pre_liquidada: { etiqueta: 'Pre-liquidada', color: 'warning' },
  pendiente_aprobacion: { etiqueta: 'Pendiente de aprobación', color: 'info' },
  rechazada: { etiqueta: 'Rechazada', color: 'warning' },
  aplicada: { etiqueta: 'Aplicada', color: 'success' },
  anulada: { etiqueta: 'Anulada', color: 'error' },
  descartada: { etiqueta: 'Descartada', color: 'neutral' },
  fallida: { etiqueta: 'Fallida', color: 'error' },
}
