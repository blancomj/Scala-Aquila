// GOB-0 §4.4 — enlace público (sin sesión, AD-26) para consultar cualquier
// documento del tenant (documentos). Mismo patrón exacto que ver-estado-cuenta
// (D-27) y ver-activo (MANT-0 §4.5): token HMAC determinista (link_token.ts,
// mismo secreto compartido, CERO cambios) que firma {documento_id, exp}.
//
// A diferencia de ver-estado-cuenta, NO hay vía de sesión de miembro — el
// corte solo pide el mecanismo de token (Opción 1 mínima de AD-26), y no hay
// hoy una pantalla de portal que lo necesite (fuera de alcance §5). Si una UI
// de miembro autenticado necesita ver un documento arbitrario, ya puede
// hacerlo por RLS directo (documentos_select_agent_auditor) sin pasar por
// aquí.
//
// Devuelve una signed URL de Storage de vida corta (5 min) para el archivo,
// no el archivo mismo — igual que el comentario del bucket estados-cuenta
// ya preveía para ese caso ("sin otra Edge Function").
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse, respuestaPreflight } from '../_shared/http.ts'
import { verificarTokenEnlace } from '../_shared/link_token.ts'
import { logEvent } from '../_shared/logger.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const BUCKET = 'documentos-inmueble'
const URL_FIRMADA_TTL_SEGUNDOS = 300
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
  const cuerpo = body as { id?: unknown; t?: unknown } | null
  const id = cuerpo?.id
  if (typeof id !== 'string' || !UUID_RE.test(id)) {
    return errorResponse(400, 'INVALID_PAYLOAD', 'id debe ser un uuid válido.', undefined, correlationId)
  }
  if (typeof cuerpo?.t !== 'string' || cuerpo.t.length === 0) {
    return errorResponse(400, 'INVALID_PAYLOAD', 't debe ser un string no vacío.', undefined, correlationId)
  }
  const token = cuerpo.t

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return errorResponse(500, 'INTERNAL_ERROR', 'Configuración incompleta.', undefined, correlationId)
  }
  const admin = createClient<Database>(supabaseUrl, serviceKey)

  const ip = ipDelRequest(req)
  const bloqueo = await enforceRateLimit(admin, `doc_ip:${ip}`, 120, '1 hour', correlationId)
  if (bloqueo) return bloqueo

  const { data: documento, error: errorDocumento } = await admin
    .from('documentos')
    .select('id, tenant_id, nombre_archivo, storage_path, tipo_documento_id, fecha_vencimiento')
    .eq('id', id)
    .maybeSingle()
  if (errorDocumento) {
    return errorResponse(500, 'INTERNAL_ERROR', errorDocumento.message, undefined, correlationId)
  }
  if (!documento) {
    return errorResponse(404, 'DOCUMENTO_NO_ENCONTRADO', 'Este documento no existe.', undefined, correlationId)
  }

  const veredicto = await verificarTokenEnlace(token, id)
  if (veredicto === 'invalido') {
    return errorResponse(
      403,
      'DOCUMENTO_ENLACE_INVALIDO',
      'Este enlace no es válido. Pide uno nuevo a la administración.',
      undefined,
      correlationId,
    )
  }
  if (veredicto === 'vencido') {
    return errorResponse(
      410,
      'DOCUMENTO_VENCIDO',
      'Este enlace venció. Pide uno nuevo a la administración.',
      undefined,
      correlationId,
    )
  }

  try {
    await admin.from('audit_log').insert({
      tenant_id: documento.tenant_id,
      action: 'documento.acceso',
      entity_type: 'documentos',
      entity_id: id,
      metadata: { correlation_id: correlationId },
      ip,
      user_agent: req.headers.get('user-agent'),
    })
  } catch (errorAuditoria) {
    logEvent({
      level: 'warn',
      action: 'documento.auditoria_fallo',
      correlationId,
      message: errorAuditoria instanceof Error ? errorAuditoria.message : 'desconocido',
      meta: { documento_id: id },
    })
  }

  const { data: firmada, error: errorFirmada } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(documento.storage_path, URL_FIRMADA_TTL_SEGUNDOS)
  if (errorFirmada || !firmada) {
    return errorResponse(
      500,
      'INTERNAL_ERROR',
      errorFirmada?.message ?? 'No se pudo generar el enlace de descarga.',
      undefined,
      correlationId,
    )
  }

  return jsonResponse(
    {
      nombre_archivo: documento.nombre_archivo,
      tipo_documento_id: documento.tipo_documento_id,
      fecha_vencimiento: documento.fecha_vencimiento,
      url_firmada: firmada.signedUrl,
      url_expira_en_segundos: URL_FIRMADA_TTL_SEGUNDOS,
    },
    200,
    correlationId,
  )
})
