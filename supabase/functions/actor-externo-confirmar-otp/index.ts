// EXT-01 §3.2 — confirma el OTP y, si es válido, crea el usuario en
// auth.users (si no existía ya para ese correo) y la fila en
// actor_externo_vinculo, en una sola operación DE PRODUCTO aunque en dos
// sistemas distintos (Postgres + Admin API) — misma limitación real de la
// arquitectura de Supabase ya documentada en accept-invitation/index.ts.
//
// Un mismo contacto puede verificar varios roles a la vez (§3.3,
// "multi-relación") — fn_actor_externo_confirmar_otp devuelve una fila por
// cada uno; este archivo crea/encuentra UNA cuenta y un vínculo por fila.
// Si un vínculo puntual ya existía (login repetido) o choca con una
// membresía de staff, se omite esa fila sin abortar las demás — solo falla
// la respuesta completa si NINGÚN vínculo pudo crearse/confirmarse.
//
// Entrega la sesión al cliente vía un magic link generado por el Admin
// API (auth.admin.generateLink) — el cliente llama
// supabase.auth.verifyOtp({email, token, type:'magiclink'}) para obtener
// su sesión sin necesitar contraseña en este paso (EXT-01 §3.2: "solo en
// el primer ingreso la app pide establecer una contraseña", DESPUÉS de
// tener sesión).
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse, parsearErrorRpc, respuestaPreflight } from '../_shared/http.ts'
import { logEvent } from '../_shared/logger.ts'

const RATE_LIMIT_MAX_HITS = 20
const RATE_LIMIT_VENTANA = '1 hour'

function ipDelRequest(req: Request): string {
  const reenviada = req.headers.get('x-forwarded-for')
  const primera = reenviada?.split(',')[0]?.trim()
  return primera && primera.length > 0 ? primera : 'desconocida'
}

function personaTipoDeRol(rolCodigo: string): 'propietario' | 'tenedor' {
  return rolCodigo === 'copropietario' ? 'propietario' : 'tenedor'
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
  const cuerpo = body as { canal?: unknown; contacto?: unknown; codigo?: unknown } | null
  const canal = cuerpo?.canal
  if (canal !== 'email' && canal !== 'sms') {
    return errorResponse(400, 'INVALID_PAYLOAD', 'canal debe ser "email" o "sms".', undefined, correlationId)
  }
  const contacto = cuerpo?.contacto
  const codigo = cuerpo?.codigo
  if (typeof contacto !== 'string' || contacto.trim().length === 0) {
    return errorResponse(400, 'INVALID_PAYLOAD', 'contacto es requerido.', undefined, correlationId)
  }
  if (typeof codigo !== 'string' || codigo.trim().length === 0) {
    return errorResponse(400, 'INVALID_PAYLOAD', 'codigo es requerido.', undefined, correlationId)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return errorResponse(500, 'INTERNAL_ERROR', 'Configuración incompleta.', undefined, correlationId)
  }
  const admin = createClient<Database>(supabaseUrl, serviceKey)

  const ip = ipDelRequest(req)
  const { data: permitido, error: errorRateLimit } = await admin.rpc('check_rate_limit', {
    p_bucket: `actor_externo_otp_confirmar_ip:${ip}`,
    p_max_hits: RATE_LIMIT_MAX_HITS,
    p_window: RATE_LIMIT_VENTANA,
  })
  if (errorRateLimit) {
    logEvent({
      level: 'error', action: 'rate_limit.check_failed', correlationId,
      message: errorRateLimit.message, meta: { funcion: 'actor-externo-confirmar-otp' },
    })
  } else if (permitido === false) {
    return errorResponse(429, 'RATE_LIMITED', 'Demasiados intentos. Inténtalo más tarde.', undefined, correlationId)
  }

  const { data: filas, error: errorConfirmar } = await admin.rpc('fn_actor_externo_confirmar_otp', {
    p_canal: canal,
    p_contacto: contacto,
    p_codigo: codigo,
  })
  if (errorConfirmar) {
    const { code, message } = parsearErrorRpc(errorConfirmar.message)
    return errorResponse(code === 'OTP_INVALIDO_O_VENCIDO' ? 401 : 500, code, message, undefined, correlationId)
  }
  if (!filas || filas.length === 0) {
    return errorResponse(
      404,
      'ACTOR_EXTERNO_SIN_VINCULOS',
      'El código es válido pero no se encontró ningún rol vigente para este contacto.',
      undefined,
      correlationId,
    )
  }

  const email = filas[0]?.email
  if (!email) {
    return errorResponse(
      422,
      'ACTOR_EXTERNO_SIN_EMAIL_PARA_CUENTA',
      'Esta persona no tiene un correo registrado; el alta por este canal requiere que el staff registre uno primero.',
      undefined,
      correlationId,
    )
  }

  // Encuentra la cuenta existente vía profiles (espejo de auth.users,
  // E1/handle_new_user) en vez de listar auth.users por la Admin API —
  // más simple y ya disponible.
  const { data: existente } = await admin.from('profiles').select('id').eq('email', email).maybeSingle()
  let authUserId = existente?.id ?? null

  if (!authUserId) {
    const { data: creado, error: errorCrear } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      password: crypto.randomUUID() + crypto.randomUUID(),
    })
    if (errorCrear || !creado.user) {
      logEvent({
        level: 'error', action: 'actor_externo_otp.crear_usuario_fallo', correlationId,
        message: errorCrear?.message ?? 'sin usuario',
      })
      return errorResponse(500, 'INTERNAL_ERROR', 'No se pudo crear la cuenta.', undefined, correlationId)
    }
    authUserId = creado.user.id
  }

  let vinculosCreados = 0
  let ultimoError: { code: string; message: string } | null = null
  for (const fila of filas) {
    const { error: errorVinculo } = await admin.rpc('fn_actor_externo_registrar_vinculo', {
      p_tenant_id: fila.tenant_id,
      p_auth_user_id: authUserId,
      p_persona_rol_id: fila.persona_rol_id,
      p_persona_tipo: personaTipoDeRol(fila.rol_codigo),
      p_origen: 'autoverificacion',
      p_creado_por: null,
    })
    if (errorVinculo) {
      const { code, message } = parsearErrorRpc(errorVinculo.message)
      // ACTOR_EXTERNO_VINCULO_DUPLICADO es esperado en un login repetido —
      // el vínculo ya existe, no es un fallo.
      if (code !== 'ACTOR_EXTERNO_VINCULO_DUPLICADO') {
        ultimoError = { code, message }
        logEvent({
          level: 'warn', action: 'actor_externo_otp.vinculo_fallo', correlationId,
          message, meta: { code, persona_rol_id: fila.persona_rol_id },
        })
      } else {
        vinculosCreados += 1
      }
      continue
    }
    vinculosCreados += 1
  }

  if (vinculosCreados === 0 && ultimoError) {
    return errorResponse(409, ultimoError.code, ultimoError.message, undefined, correlationId)
  }

  const { data: enlace, error: errorEnlace } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  if (errorEnlace || !enlace) {
    logEvent({
      level: 'error', action: 'actor_externo_otp.generar_enlace_fallo', correlationId,
      message: errorEnlace?.message ?? 'sin enlace',
    })
    return errorResponse(500, 'INTERNAL_ERROR', 'No se pudo generar la sesión.', undefined, correlationId)
  }

  return jsonResponse(
    { email, hashed_token: enlace.properties.hashed_token, vinculos: vinculosCreados },
    200,
    correlationId,
  )
})
