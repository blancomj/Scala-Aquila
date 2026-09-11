// MANT-11 §4.2 · Consume un QR de autorización de visita: verifica criptográficamente el token
// (Deno/Web Crypto) y, si es válido y no está vencido, delega la transición atómica
// (vigente -> usada + registro de acceso, misma transacción) a
// fn_autorizacion_visita_marcar_usada (`for update`, mismo patrón que accept_invitation) —
// así dos porteros consumiendo el mismo QR a la vez nunca ambos tienen éxito (MANT-11 §6,
// prueba 4).
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
  const cuerpo = body as { qr_token?: unknown; observaciones?: unknown } | null
  const qrToken = cuerpo?.qr_token
  if (typeof qrToken !== 'string' || !qrToken.includes('.')) {
    return errorResponse(400, 'INVALID_PAYLOAD', 'qr_token es requerido.', undefined, correlationId)
  }
  const observaciones = typeof cuerpo?.observaciones === 'string' ? cuerpo.observaciones : null
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
    .select('tenant_id')
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
  const {
    data: { user },
  } = await cliente.auth.getUser(jwt)
  if (!user) {
    return errorResponse(401, 'UNAUTHENTICATED', 'Sesión inválida.', undefined, correlationId)
  }

  const veredicto = await verificarTokenEnlace(firmado, autorizacionId)
  if (veredicto === 'invalido') {
    return errorResponse(400, 'AUTORIZACION_QR_INVALIDO', 'El QR no es válido.', undefined, correlationId)
  }
  if (veredicto === 'vencido') {
    return errorResponse(400, 'AUTORIZACION_VENCIDA', 'El QR ya venció.', undefined, correlationId)
  }

  const { data: registro, error: errorConsumir } = await admin
    .rpc('fn_autorizacion_visita_marcar_usada', {
      p_autorizacion_id: autorizacionId,
      p_registrado_por: user.id,
      p_observaciones: observaciones ?? undefined,
    })
    .single()
  if (errorConsumir) {
    return errorResponse(409, 'AUTORIZACION_CONSUMO_FALLIDO', errorConsumir.message, undefined, correlationId)
  }

  return jsonResponse(registro, 200, correlationId)
})
