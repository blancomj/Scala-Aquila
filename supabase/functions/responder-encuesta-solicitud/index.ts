// GOB-8 §4.5 — encuesta de satisfacción mínima viable, servida por el MISMO enlace de token del
// inmueble (§4.4) tras cerrar/resolver una solicitud. Única excepción de escritura a la regla
// "el consultante sin sesión no puede escribir nada" (§4.4) — angosta a propósito: ni RPC ni
// política RLS de insert, solo esta Edge Function (service_role) valida token + estado antes de
// insertar en solicitud_encuesta (unique por solicitud_id, append-only).
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse, respuestaPreflight } from '../_shared/http.ts'
import { verificarTokenEnlace } from '../_shared/link_token.ts'
import { logEvent } from '../_shared/logger.ts'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ESTADOS_ENCUESTABLES = ['resuelta', 'cerrada']

function ipDelRequest(req: Request): string {
  const reenviada = req.headers.get('x-forwarded-for')
  const primera = reenviada?.split(',')[0]?.trim()
  return primera && primera.length > 0 ? primera : 'desconocida'
}

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
  const cuerpo = body as { id?: unknown; t?: unknown; solicitud_id?: unknown; calificacion?: unknown; comentario?: unknown } | null
  const id = cuerpo?.id
  if (typeof id !== 'string' || !UUID_RE.test(id)) {
    return errorResponse(400, 'INVALID_PAYLOAD', 'id debe ser un uuid válido.', undefined, correlationId)
  }
  if (typeof cuerpo?.t !== 'string' || cuerpo.t.length === 0) {
    return errorResponse(400, 'INVALID_PAYLOAD', 't debe ser un string no vacío.', undefined, correlationId)
  }
  const token = cuerpo.t
  const solicitudId = cuerpo.solicitud_id
  if (typeof solicitudId !== 'string' || !UUID_RE.test(solicitudId)) {
    return errorResponse(400, 'INVALID_PAYLOAD', 'solicitud_id debe ser un uuid válido.', undefined, correlationId)
  }
  const calificacion = cuerpo.calificacion
  if (typeof calificacion !== 'number' || !Number.isInteger(calificacion) || calificacion < 1 || calificacion > 5) {
    return errorResponse(400, 'INVALID_PAYLOAD', 'calificacion debe ser un entero entre 1 y 5.', undefined, correlationId)
  }
  const comentario = cuerpo.comentario
  if (comentario !== undefined && comentario !== null && typeof comentario !== 'string') {
    return errorResponse(400, 'INVALID_PAYLOAD', 'comentario debe ser un string.', undefined, correlationId)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return errorResponse(500, 'INTERNAL_ERROR', 'Configuración incompleta.', undefined, correlationId)
  }
  const admin = createClient<Database>(supabaseUrl, serviceKey)

  const ip = ipDelRequest(req)
  const { data: permitido, error: errorRateLimit } = await admin.rpc('check_rate_limit', {
    p_bucket: `encuesta_ip:${ip}`,
    p_max_hits: 30,
    p_window: '1 hour',
  })
  if (errorRateLimit) {
    logEvent({
      level: 'error', action: 'rate_limit.check_failed', correlationId, message: errorRateLimit.message,
      meta: { funcion: 'responder-encuesta-solicitud' },
    })
  } else if (permitido === false) {
    return errorResponse(429, 'RATE_LIMITED', 'Demasiados intentos desde esta dirección. Inténtalo más tarde.', undefined, correlationId)
  }

  // Misma validación que ver-inmueble: la fila de control (revocado_at/expira_at) antes del HMAC.
  const { data: tokenRow, error: errorToken } = await admin
    .from('atencion_tokens_consulta')
    .select('id, tenant_id, inmueble_id, expira_at, revocado_at')
    .eq('id', id)
    .maybeSingle()
  if (errorToken) {
    return errorResponse(500, 'INTERNAL_ERROR', errorToken.message, undefined, correlationId)
  }
  if (!tokenRow) {
    return errorResponse(404, 'ATENCION_TOKEN_NO_ENCONTRADO', 'Este enlace no existe.', undefined, correlationId)
  }
  if (tokenRow.revocado_at) {
    return errorResponse(403, 'ATENCION_TOKEN_REVOCADO', 'Este enlace fue revocado por la administración.', undefined, correlationId)
  }
  if (new Date(tokenRow.expira_at).getTime() < Date.now()) {
    return errorResponse(410, 'ATENCION_TOKEN_VENCIDO', 'Este enlace venció. Pide uno nuevo a la administración.', undefined, correlationId)
  }

  const veredicto = await verificarTokenEnlace(token, id)
  if (veredicto === 'invalido') {
    return errorResponse(403, 'ATENCION_TOKEN_INVALIDO', 'Este enlace no es válido. Pide uno nuevo a la administración.', undefined, correlationId)
  }
  if (veredicto === 'vencido') {
    return errorResponse(410, 'ATENCION_TOKEN_VENCIDO', 'Este enlace venció. Pide uno nuevo a la administración.', undefined, correlationId)
  }

  const { data: solicitud, error: errorSolicitud } = await admin
    .from('solicitudes')
    .select('id, estado')
    .eq('id', solicitudId)
    .eq('inmueble_id', tokenRow.inmueble_id)
    .eq('tenant_id', tokenRow.tenant_id)
    .maybeSingle()
  if (errorSolicitud) {
    return errorResponse(500, 'INTERNAL_ERROR', errorSolicitud.message, undefined, correlationId)
  }
  if (!solicitud) {
    return errorResponse(404, 'ATENCION_ENCUESTA_SOLICITUD_NO_ENCONTRADA', 'Esta solicitud no pertenece a este inmueble.', undefined, correlationId)
  }
  if (!ESTADOS_ENCUESTABLES.includes(solicitud.estado)) {
    return errorResponse(409, 'ATENCION_ENCUESTA_ESTADO_INVALIDO', 'Solo se puede encuestar una solicitud resuelta o cerrada.', undefined, correlationId)
  }

  const { data: encuesta, error: errorInsert } = await admin
    .from('solicitud_encuesta')
    .insert({
      tenant_id: tokenRow.tenant_id,
      solicitud_id: solicitudId,
      calificacion,
      comentario: comentario ?? null,
    })
    .select('id, calificacion, comentario, respondida_at')
    .single()
  if (errorInsert) {
    if (errorInsert.code === '23505') {
      return errorResponse(409, 'ATENCION_ENCUESTA_YA_RESPONDIDA', 'Esta solicitud ya tiene una encuesta respondida.', undefined, correlationId)
    }
    return errorResponse(500, 'INTERNAL_ERROR', errorInsert.message, undefined, correlationId)
  }

  try {
    await admin.from('audit_log').insert({
      tenant_id: tokenRow.tenant_id,
      action: 'solicitud.encuesta_respondida',
      entity_type: 'solicitud_encuesta',
      entity_id: encuesta.id,
      metadata: { correlation_id: correlationId, solicitud_id: solicitudId },
      ip,
      user_agent: req.headers.get('user-agent'),
    })
  } catch (errorAuditoria) {
    logEvent({
      level: 'warn', action: 'encuesta.auditoria_fallo', correlationId,
      message: errorAuditoria instanceof Error ? errorAuditoria.message : 'desconocido',
      meta: { solicitud_id: solicitudId },
    })
  }

  return jsonResponse(encuesta, 201, correlationId)
})
