// Helpers comunes a todas las Edge Functions de este proyecto — contrato
// uniforme de error, PROMPT_MAESTRO_FASE1.md §8:
// `{ error: { code, message, details } }`.

// E7 · headers de seguridad mínimos en toda respuesta JSON: nosniff (no hay
// razón para que el navegador reinterprete el content-type) y no-store
// (estas respuestas son sensibles a tenant/sesión, nunca cacheables).
const HEADERS_SEGURIDAD = {
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
} as const

// correlationId (E7 · observabilidad, §11.2): se devuelve en el header de
// TODA respuesta — éxito o error — para poder rastrear un request puntual
// en los logs sin exponer nada sensible en la respuesta misma.
function headersConCorrelacion(correlationId?: string): Record<string, string> {
  return correlationId ? { ...HEADERS_SEGURIDAD, 'X-Correlation-Id': correlationId } : { ...HEADERS_SEGURIDAD }
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
