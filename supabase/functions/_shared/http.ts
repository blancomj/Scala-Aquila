// Helpers comunes a todas las Edge Functions de este proyecto — contrato
// uniforme de error, PROMPT_MAESTRO_FASE1.md §8:
// `{ error: { code, message, details } }`.

export function errorResponse(status: number, code: string, message: string, details?: unknown): Response {
  return Response.json({ error: { code, message, details: details ?? null } }, { status })
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
