// Traducciones de enums crudos de BD a lenguaje llano para la UI de Novedades —
// mismo criterio que presupuesto-labels.ts y concepto-labels.ts.
//
// Sobre `novedad_tipo_t`: verificado en fn_aprobar_novedad (20260827100000) que
// el tipo NO llega al ledger — el cargo siempre se inserta con categoria='otro',
// origen_tipo='novedad', y solo hereda el SIGNO del monto (AD-30). La guía
// oficial lo confirma ("el enum va sin sub-clasificación"). Por eso aquí los
// tipos se agrupan por su única diferencia real y validada (la dirección) y las
// descripciones hablan de uso de negocio, sin atribuirle al motor efectos que
// no tiene. La clasificación contable de verdad es tipo_novedad_id ("Motivo").

export type NovedadTipo = 'CHARGE' | 'DEBIT' | 'DISCOUNT' | 'CREDIT' | 'REFUND' | 'ADJUSTMENT'

/** Los 6 valores de `novedad_tipo_t` solo existen para dar cumplimiento a AD-30
 * (el signo del monto según el tipo) — verificado en fn_aprobar_novedad que
 * ninguno tiene efecto distinto en el ledger (mismo categoria='otro', mismo
 * origen_tipo='novedad'). Débito/Descuento/Crédito/Ajuste quedan aquí solo
 * para poder mostrar novedades históricas que ya los usaban; el formulario de
 * creación ya no los ofrece — ver SignoNovedad más abajo. */
export const ETIQUETA_TIPO_NOVEDAD: Record<NovedadTipo, string> = {
  CHARGE: 'Cobro',
  DEBIT: 'Débito',
  DISCOUNT: 'Descuento',
  CREDIT: 'Crédito',
  REFUND: 'Reembolso',
  ADJUSTMENT: 'Ajuste',
}

export const DESCRIPCION_TIPO_NOVEDAD: Record<NovedadTipo, string> = {
  CHARGE: 'Cobro nuevo al inmueble — el caso más común.',
  DEBIT: 'Cobro por corrección o traslado de saldo.',
  DISCOUNT: 'Rebaja sobre lo que el inmueble debe.',
  CREDIT: 'Saldo a favor del inmueble.',
  REFUND: 'Devolución de un dinero ya pagado.',
  ADJUSTMENT: 'Corrección que puede sumar o restar.',
}

/** El formulario de creación solo pregunta esto: ¿la novedad aumenta o reduce
 * lo que debe el inmueble? Débito/Descuento/Crédito/Ajuste desaparecieron de
 * la UI porque no aportaban nada que el signo no dijera ya (confirmado: el
 * motor no los distingue) — Cobro/Reembolso son los dos únicos valores de
 * `novedad_tipo_t` que este formulario llega a escribir. */
export type SignoNovedad = 'cobro' | 'reembolso'

export const TIPO_POR_SIGNO: Record<SignoNovedad, NovedadTipo> = {
  cobro: 'CHARGE',
  reembolso: 'REFUND',
}

export const ETIQUETA_SIGNO: Record<SignoNovedad, string> = {
  cobro: 'Cobro',
  reembolso: 'Reembolso',
}

export const DESCRIPCION_SIGNO: Record<SignoNovedad, string> = {
  cobro: 'Aumenta lo que debe el inmueble.',
  reembolso: 'Reduce lo que debe el inmueble.',
}

export const ETIQUETA_ESTADO_NOVEDAD: Record<string, string> = {
  pendiente: 'Pendiente',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
}

export const DESCRIPCION_ESTADO_NOVEDAD: Record<string, string> = {
  pendiente: 'Esperando aprobación — todavía no generó ningún cargo.',
  aprobada: 'Aprobada — ya generó el cargo en la cuenta del inmueble.',
  rechazada: 'Rechazada — no generó ningún cargo.',
}

export const COLOR_ESTADO_NOVEDAD: Record<string, 'neutral' | 'primary' | 'success' | 'error'> = {
  pendiente: 'primary',
  aprobada: 'success',
  rechazada: 'neutral',
}

export type RepeticionNovedad = 'ninguna' | 'permanente' | 'prorrateable'

export const ETIQUETA_REPETICION: Record<RepeticionNovedad, string> = {
  ninguna: 'Única vez',
  permanente: 'Permanente',
  prorrateable: 'Prorrateable',
}

/** El punto clave de la pantalla: el mismo campo "Monto" significa algo
 * distinto en cada opción (verificado en fn_aprobar_novedad y
 * fn_generar_cargos_novedades_periodo, 20260827100000). */
export const DESCRIPCION_REPETICION: Record<RepeticionNovedad, string> = {
  ninguna: 'Se cobra una sola vez, en el periodo de la fecha efectiva.',
  permanente: 'Se cobra este valor completo cada periodo, hasta que la inhabilites.',
  prorrateable: 'Este valor es el total y se reparte en cuotas iguales, una por periodo.',
}

export const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const

export function mesAnioTexto(fecha: string): string {
  const [anio, mes] = fecha.split('-')
  const indice = Number(mes) - 1
  return MESES[indice] ? `${MESES[indice]} ${anio}` : fecha
}
