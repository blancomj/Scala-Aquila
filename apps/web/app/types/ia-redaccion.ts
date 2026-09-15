/** Ola 3 (ENFOQUE_CONSOLIDACION) — respuesta de la Edge Function
 *  `ia-redactar-explicacion`, compartida por cartera y finanzas (y por
 *  cualquier dominio futuro que redacte una Explicacion con IA) para
 *  evitar que dos stores declaren el mismo tipo con el mismo nombre — Nuxt
 *  auto-importa los exports de `stores/*.ts` globalmente y una colisión de
 *  nombres pisa uno de los dos en silencio. */
export interface ResultadoRedaccionIa {
  texto: string | null
  degradado: boolean
  motivo?: string
}
