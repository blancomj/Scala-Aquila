// Helpers comunes a todas las Edge Functions de este proyecto — contrato
// uniforme de error, PROMPT_MAESTRO_FASE1.md §8:
// `{ error: { code, message, details } }`.
//
// Doc 14 (registro de errores): el catálogo completo de códigos vive en
// packages/shared/src/error-codes.ts (ERROR_CODES) — se mantiene aparte,
// sin tipar `code` aquí como ErrorCode, para no romper la firma pública
// que ya consumen ~10 Edge Functions. tests/governance/error-codes-coverage.test.ts
// es quien realmente hace cumplir que todo código nuevo se registre ahí.

// E7 · headers de seguridad mínimos en toda respuesta JSON: nosniff (no hay
// razón para que el navegador reinterprete el content-type) y no-store
// (estas respuestas son sensibles a tenant/sesión, nunca cacheables).
const HEADERS_SEGURIDAD = {
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
} as const

// CORS: las funciones escritas con Deno.serve()/export default {fetch} crudo
// (a diferencia de las que usan @supabase/server::withSupabase, que ya trae
// su propio manejo) no reciben CORS gratis del runtime — el navegador exige
// que TANTO el preflight (OPTIONS) COMO la respuesta real lleven
// Access-Control-Allow-Origin, o bloquea la lectura aunque el request haya
// llegado bien. Sin esto, cualquier función invocada con
// `cliente.functions.invoke()` desde el navegador (no desde SSR) falla con
// "Failed to fetch" — así se detectó en enviar-estado-cuenta (2026-08-27):
// el propio código devolvía 401/405 para el preflight, que Chrome interpreta
// como "preflight sin status ok" y descarta el request entero.
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
} as const

/** Respuesta al preflight — SIEMPRE antes de cualquier otro chequeo (auth,
 * método, body): un OPTIONS nunca lleva Authorization, así que si el
 * primer check de la función es "¿hay jwt?" o "¿es POST?", el preflight
 * cae ahí con un 401/405 sin CORS y el navegador bloquea todo. */
export function respuestaPreflight(req: Request): Response | null {
  if (req.method !== 'OPTIONS') return null
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

// correlationId (E7 · observabilidad, §11.2): se devuelve en el header de
// TODA respuesta — éxito o error — para poder rastrear un request puntual
// en los logs sin exponer nada sensible en la respuesta misma.
function headersConCorrelacion(correlationId?: string): Record<string, string> {
  return correlationId
    ? { ...HEADERS_SEGURIDAD, ...CORS_HEADERS, 'X-Correlation-Id': correlationId }
    : { ...HEADERS_SEGURIDAD, ...CORS_HEADERS }
}

export function jsonResponse(data: unknown, status = 200, correlationId?: string): Response {
  return Response.json(data, { status, headers: headersConCorrelacion(correlationId) })
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  details?: unknown,
  correlationId?: string,
): Response {
  return Response.json(
    { error: { code, message, details: details ?? null } },
    { status, headers: headersConCorrelacion(correlationId) },
  )
}

// Las RPC de este proyecto lanzan errores con formato "CODIGO: mensaje"
// (ver create_tenant/invite_user/accept_invitation/revoke_invitation en
// supabase/migrations/) — se parsean aquí para no filtrar el
// PostgrestError crudo al cliente.
export function parsearErrorRpc(mensaje: string): { code: string; message: string } {
  const coincidencia = /^([A-Z_]+):\s*(.*)$/.exec(mensaje)
  if (coincidencia) {
    return { code: coincidencia[1], message: coincidencia[2] }
  }
  return { code: 'INTERNAL_ERROR', message: mensaje }
}
