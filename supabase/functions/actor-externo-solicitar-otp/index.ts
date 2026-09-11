// EXT-01 §3.2 — primer paso del alta/login de un actor externo: pide un OTP
// para el contacto que la persona escribe (no un identificador — es una
// búsqueda, EXT_APP_MOVIL_PROMPT_MAESTRO.md §5.1). Público, sin sesión: no
// existe ninguna todavía en este punto del flujo — mismo patrón que
// responder-encuesta-solicitud (Deno.serve directo, admin client manual,
// check_rate_limit por IP), no withSupabase (que exige auth:'user').
//
// La respuesta es SIEMPRE la misma, exista o no el contacto — nunca revela
// si un correo/teléfono está registrado (EXT_APP_MOVIL_PROMPT_MAESTRO.md
// §5.1.2). fn_actor_externo_solicitar_otp (service_role, revocada de
// anon/authenticated) ya escribe la fila de OTP en ambos casos; aquí solo
// se decide si además se envía el correo/sms.
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse, respuestaPreflight } from '../_shared/http.ts'
import { logEvent } from '../_shared/logger.ts'
import { enviarEmailOtpActorExterno } from '../_shared/email_otp_actor_externo.ts'
import { sendSms } from '../_shared/sms_provider.ts'

const RATE_LIMIT_MAX_HITS = 10
const RATE_LIMIT_VENTANA = '1 hour'
const MENSAJE_GENERICO = 'Si el contacto está registrado, recibirás un código de verificación.'

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
  const cuerpo = body as { canal?: unknown; contacto?: unknown } | null
  const canal = cuerpo?.canal
  if (canal !== 'email' && canal !== 'sms') {
    return errorResponse(400, 'INVALID_PAYLOAD', 'canal debe ser "email" o "sms".', undefined, correlationId)
  }
  const contacto = cuerpo?.contacto
  if (typeof contacto !== 'string' || contacto.trim().length === 0) {
    return errorResponse(400, 'INVALID_PAYLOAD', 'contacto es requerido.', undefined, correlationId)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return errorResponse(500, 'INTERNAL_ERROR', 'Configuración incompleta.', undefined, correlationId)
  }
  const admin = createClient<Database>(supabaseUrl, serviceKey)

  const ip = ipDelRequest(req)
  const { data: permitido, error: errorRateLimit } = await admin.rpc('check_rate_limit', {
    p_bucket: `actor_externo_otp_ip:${ip}`,
    p_max_hits: RATE_LIMIT_MAX_HITS,
    p_window: RATE_LIMIT_VENTANA,
  })
  if (errorRateLimit) {
    logEvent({
      level: 'error', action: 'rate_limit.check_failed', correlationId,
      message: errorRateLimit.message, meta: { funcion: 'actor-externo-solicitar-otp' },
    })
  } else if (permitido === false) {
    return errorResponse(429, 'RATE_LIMITED', 'Demasiados intentos. Inténtalo más tarde.', undefined, correlationId)
  }

  const { data: codigo, error: errorSolicitar } = await admin.rpc('fn_actor_externo_solicitar_otp', {
    p_canal: canal,
    p_contacto: contacto,
  })
  if (errorSolicitar) {
    logEvent({
      level: 'error', action: 'actor_externo_otp.solicitar_rpc_error', correlationId,
      message: errorSolicitar.message,
    })
    // Nunca se propaga el detalle del error al cliente — mismo criterio
    // "nunca revela" que aplica a la existencia del contacto.
    return jsonResponse({ message: MENSAJE_GENERICO }, 200, correlationId)
  }

  if (codigo) {
    if (canal === 'email') {
      const envio = await enviarEmailOtpActorExterno({ email: contacto, codigo })
      if (!envio.ok) {
        logEvent({
          level: 'error', action: 'actor_externo_otp.envio_fallido', correlationId,
          message: envio.error, meta: { canal },
        })
      }
    } else {
      const envio = await sendSms({
        to: contacto,
        body: `Tu código de verificación de Aquila PH es ${codigo}. Vence en 10 minutos.`,
        reference: correlationId,
      })
      if (!envio.success) {
        logEvent({
          level: 'error', action: 'actor_externo_otp.envio_fallido', correlationId,
          message: envio.errorMessage ?? 'desconocido', meta: { canal },
        })
      }
    }
  }

  return jsonResponse({ message: MENSAJE_GENERICO }, 200, correlationId)
})
