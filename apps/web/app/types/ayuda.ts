// Centro de ayuda in-app (piloto) — datos estructurados, no markdown: cada artículo se
// escribe para el usuario final, no es un volcado de los docs técnicos internos.

export type BloqueAyuda =
  | { tipo: 'texto'; parrafos: string[] }
  | { tipo: 'pasos'; items: string[] }
  | { tipo: 'aviso'; texto: string }
  | { tipo: 'preguntas'; items: { pregunta: string; respuesta: string }[] }

export interface ArticuloAyuda {
  slug: string
  /** Agrupador visual en el índice, p. ej. "Cartera". */
  modulo: string
  titulo: string
  /** 1-2 líneas, se muestra en la tarjeta del índice. */
  resumen: string
  /** Para el filtro de búsqueda del índice. */
  tags: string[]
  bloques: BloqueAyuda[]
}
