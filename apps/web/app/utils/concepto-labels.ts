// Traducciones de enums crudos de BD a lenguaje llano para la UI de Conceptos —
// mismo criterio que presupuesto-labels.ts: centralizado aquí para no repetir
// el mapa en cada componente que muestra concepto.estado/tipo_recurrencia.

export const ETIQUETA_ESTADO_CONCEPTO: Record<string, string> = {
  borrador: 'Borrador',
  en_revision: 'En revisión',
  activo: 'Activo',
  archivado: 'Archivado',
}

export const DESCRIPCION_ESTADO_CONCEPTO: Record<string, string> = {
  borrador: 'Editable — todavía no genera cargos.',
  en_revision: 'Enviado a revisión — pendiente de aprobación de otra persona.',
  activo: 'Activo — genera cargos en cada liquidación.',
  archivado: 'Archivado — ya no genera cargos nuevos; su historial permanece intacto.',
}

export const COLOR_ESTADO_CONCEPTO: Record<string, 'neutral' | 'primary' | 'success'> = {
  borrador: 'neutral',
  en_revision: 'primary',
  activo: 'success',
  archivado: 'neutral',
}

export const ETIQUETA_TIPO_RECURRENCIA: Record<string, string> = {
  recurrente: 'Recurrente',
  unico: 'Único',
  por_periodo: 'Por periodo',
  novedad: 'Novedad',
}

export const ETIQUETA_PERIODICIDAD: Record<string, string> = {
  mensual: 'mensual',
  bimensual: 'bimensual',
  trimestral: 'trimestral',
  semestral: 'semestral',
  anual: 'anual',
}
