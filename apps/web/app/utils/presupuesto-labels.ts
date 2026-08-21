// Traducciones de enums crudos de BD a lenguaje llano para la UI de Presupuesto (rediseño
// aprobado en mockup "Libro Presupuestal") — centralizado aquí para no repetir el mapa en cada
// componente que muestra presupuesto.estado. fuente_financiacion.tipo ya no vive aquí: pasó de
// enum a lista_tipos (20260830210000) — su etiqueta es lista_tipos.nombre directamente, no un
// mapa estático (ver presupuestoStore.tiposFuente).

export const ETIQUETA_ESTADO_PRESUPUESTO: Record<string, string> = {
  borrador: 'Borrador',
  aprobado: 'Aprobado',
  vigente: 'Vigente',
  cerrado: 'Cerrado',
}

export const DESCRIPCION_ESTADO_PRESUPUESTO: Record<string, string> = {
  borrador: 'Editable — todavía no genera cobros a las unidades.',
  aprobado: 'Aprobado en asamblea, pendiente de activar.',
  vigente: 'Activo — sus valores ya se están cobrando.',
  cerrado: 'Cerrado — de solo lectura, corregir crea una versión nueva.',
}

export const COLOR_ESTADO_PRESUPUESTO: Record<string, 'neutral' | 'primary' | 'success'> = {
  borrador: 'neutral',
  aprobado: 'primary',
  vigente: 'success',
  cerrado: 'neutral',
}

