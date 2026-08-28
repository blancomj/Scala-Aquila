// Consulta pública y mínima del estado de una intención de pago — la
// pantalla de resultado (§8.2) la sondea tras volver del checkout de Wompi.
//
// Autorización: el propio intencion_id (uuid v4 generado por el servidor en
// crear-intencion-pago, nunca por el cliente) actúa como capability token —
// mismo criterio que un enlace de reseteo de contraseña. No se firma con
// HMAC como el estado de cuenta (D-27) porque no hay nada que perdure ni que
// reenviar: la intención expira sola (§7) y esta consulta es de solo
// lectura, sin ningún dato más sensible que "sigue pendiente / se aprobó".
// El propietario no tiene auth.users (AD-26), así que esta puerta también
// tiene que ser anónima.
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse, respuestaPreflight } from '../_shared/http.ts'
import { logEvent } from '../_shared/logger.ts'

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
  const intencionId = (body as { intencion_id?: unknown } | null)?.intencion_id
  if (typeof intencionId !== 'string' || !UUID_RE.test(intencionId)) {
    return errorResponse(400, 'INVALID_PAYLOAD', 'intencion_id debe ser un uuid válido.', undefined, correlationId)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return errorResponse(500, 'INTERNAL_ERROR', 'Configuración incompleta.', undefined, correlationId)
  }
  const admin = createClient<Database>(supabaseUrl, serviceKey)

  const ip = ipDelRequest(req)
  const { data: permitido, error: errorRateLimit } = await admin.rpc('check_rate_limit', {
    p_bucket: `ver_intencion_ip:${ip}`,
    p_max_hits: 120,
    p_window: '1 hour',
  })
  if (errorRateLimit) {
    logEvent({ level: 'error', action: 'rate_limit.check_failed', correlationId, message: errorRateLimit.message })
  } else if (permitido === false) {
    return errorResponse(429, 'RATE_LIMITED', 'Demasiadas consultas. Inténtalo más tarde.', undefined, correlationId)
  }

  const { data: intencion, error } = await admin
    .from('intenciones_pago')
    .select('estado, monto, referencia')
    .eq('id', intencionId)
    .maybeSingle()
  if (error) {
    return errorResponse(500, 'INTERNAL_ERROR', error.message, undefined, correlationId)
  }
  if (!intencion) {
    return errorResponse(404, 'PASARELA_INTENCION_NO_ENCONTRADA', 'Esta intención de pago no existe.', undefined, correlationId)
  }

  return jsonResponse(
    { estado: intencion.estado, monto: intencion.monto, referencia: intencion.referencia },
    200,
    correlationId,
  )
})
