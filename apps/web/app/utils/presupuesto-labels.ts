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

export const COLOR_ESTADO_PRESUPUESTO: Record<string, 'neutral' | 'primary' | 'success'> = {
  borrador: 'neutral',
  aprobado: 'primary',
  vigente: 'success',
  cerrado: 'neutral',
}

