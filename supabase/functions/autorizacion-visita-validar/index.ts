// MANT-11 §4.2 · Valida un QR de autorización de visita SIN consumirlo — portería confirma la
// identidad/franja antes de dejar pasar al visitante. La verificación criptográfica
// (verificarTokenEnlace) vive aquí, en Deno; la fila la resuelve el cliente admin.
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse, respuestaPreflight } from '../_shared/http.ts'
import { verificarTokenEnlace } from '../_shared/link_token.ts'

Deno.serve(async (req) => {
  const preflight = respuestaPreflight(req)
  if (preflight) return preflight

  const correlationId = crypto.randomUUID()
  if (req.method !== 'POST') {
    return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Solo POST.', undefined, correlationId)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return errorResponse(400, 'INVALID_PAYLOAD', 'El cuerpo debe ser JSON.', undefined, correlationId)
  }
  const qrToken = (body as { qr_token?: unknown } | null)?.qr_token
  if (typeof qrToken !== 'string' || !qrToken.includes('.')) {
    return errorResponse(400, 'INVALID_PAYLOAD', 'qr_token es requerido.', undefined, correlationId)
  }
  const separador = qrToken.indexOf('.')
  const autorizacionId = qrToken.slice(0, separador)
  const firmado = qrToken.slice(separador + 1)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return errorResponse(500, 'INTERNAL_ERROR', 'Configuración incompleta.', undefined, correlationId)
  }
  const admin = createClient<Database>(supabaseUrl, serviceKey)

  const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!jwt) {
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere sesión activa.', undefined, correlationId)
  }
  const cliente = createClient<Database>(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })

  const { data: fila, error: errorFila } = await admin
    .from('mant_autorizaciones_visita')
    .select('*')
    .eq('id', autorizacionId)
    .maybeSingle()
  if (errorFila) {
    return errorResponse(500, 'INTERNAL_ERROR', errorFila.message, undefined, correlationId)
  }
  if (!fila) {
    return errorResponse(404, 'AUTORIZACION_INEXISTENTE', 'La autorización no existe.', undefined, correlationId)
  }

  const { data: rolOk, error: errorRol } = await cliente.rpc('has_role', {
    p_tenant: fila.tenant_id,
    p_roles: ['auxiliar'],
  })
  if (errorRol || !rolOk) {
    return errorResponse(403, 'FORBIDDEN', 'Se requiere rol auxiliar o administrador.', undefined, correlationId)
  }

  const veredicto = await verificarTokenEnlace(firmado, autorizacionId)
  if (veredicto === 'invalido') {
    return errorResponse(400, 'AUTORIZACION_QR_INVALIDO', 'El QR no es válido.', undefined, correlationId)
  }
  if (veredicto === 'vencido') {
    return errorResponse(400, 'AUTORIZACION_VENCIDA', 'El QR ya venció.', undefined, correlationId)
  }

  if (fila.estado !== 'vigente') {
    return errorResponse(
      400, 'AUTORIZACION_ESTADO_INVALIDO',
      `La autorización está en estado ${fila.estado}, no vigente.`,
      undefined, correlationId,
    )
  }

  return jsonResponse(fila, 200, correlationId)
})
