/**
 * `const { error } = await cliente.from(...).insert(...)` nunca devuelve una instancia real de
 * `Error` — postgrest-js solo envuelve el error en la clase `PostgrestError` cuando se usa
 * `.throwOnError()` (que este proyecto no usa, ver edge-function-error.ts para el patrón
 * equivalente de Edge Functions); en el camino normal, `error` es el objeto JSON plano que
 * devuelve PostgREST (`{ code, message, details, hint }`), sin prototipo de Error. El patrón
 * `excepcion instanceof Error ? excepcion.message : fallback`, usado en drawers de todo el
 * proyecto, por eso descarta silenciosamente el mensaje real del guard (BUDGET_NOT_RECONCILED,
 * CUENTA_CONCEPTO_AUTOMATICO, etc.) y muestra siempre el fallback genérico — encontrado al
 * verificar en vivo el guard de 20260823290000. `mensajeError` cubre ambas formas.
 */
export function mensajeError(excepcion: unknown, fallback: string): string {
  if (excepcion instanceof Error) return excepcion.message
  if (
    excepcion &&
    typeof excepcion === 'object' &&
    'message' in excepcion &&
    typeof (excepcion as { message: unknown }).message === 'string'
  ) {
    return (excepcion as { message: string }).message
  }
  return fallback
}
