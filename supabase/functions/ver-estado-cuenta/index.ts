// Enlace público del estado de cuenta — D-27 (Docs/evaluacion/13 §A/§B,
// endurece el hallazgo A2 de Docs/evaluacion/01-evaluacion-seguridad-arquitectura.md).
//
// El propietario/residente no tiene auth.users (AD-26), así que no puede leer
// estados_cuenta_generados por RLS normal. Dos formas legítimas de acceso:
//
//   1. TOKEN FIRMADO  — body {id, t}: `t` es un HMAC de {id, exp} (link_token.ts)
//      que mintió enviar-estado-cuenta al notificar al propietario. Caduca solo
//      (30 días) y no se puede falsificar ni reutilizar para otro documento.
//   2. SESIÓN DE MIEMBRO — body {id} con JWT válido: el administrador que abre
//      el documento desde la app (functions.invoke adjunta su sesión); se
//      verifica membresía activa en el tenant del documento.
//
// Endurecimientos frente a la versión anterior (UUID puro + 90 días):
//   · Vigencia del DOCUMENTO baja a 30 días.
//   · Rate-limit por IP (check_rate_limit, bucket edc_ip:<ip>) — antes era un
//     gap aceptado explícito; ahora está cerrado.
//   · Cada acceso queda en audit_log ('estado_cuenta.acceso') — antes ninguna
//     puerta anónima dejaba rastro. Insert best-effort: si auditara fallara no
//     se bloquea la lectura (el fallo se loguea y se investiga), pero el
//     intento sí queda en los logs del proceso vía logEvent.
//   · La respuesta incluye folio y SHA-256 del contenido: el visor público
//     imprime ambos como sello de autenticidad (papel incluido).
//
// Sigue devolviendo JSON, NO HTML: el gateway de Supabase Edge Functions
// fuerza Content-Type text/plain + CSP sandbox en cualquier respuesta (verificado
// empíricamente; ver 20260822120000_estados_cuenta_datos_jsonb.sql) — el HTML
// lo renderiza apps/web/app/pages/comprobante-cuenta/[id].vue sobre nuestro
// propio Nuxt.
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse, respuestaPreflight } from '../_shared/http.ts'
import { sha256HexPublico, verificarTokenEnlace } from '../_shared/link_token.ts'
import { logEvent } from '../_shared/logger.ts'

const VIGENCIA_DIAS = 30
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function ipDelRequest(req: Request): string {
  // Detrás del proxy/gateway llega en x-forwarded-for (primera salto = cliente).
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
  if (cuerpo?.t !== undefined && typeof cuerpo.t !== 'string') {
    return errorResponse(400, 'INVALID_PAYLOAD', 't debe ser un string.', undefined, correlationId)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return errorResponse(500, 'INTERNAL_ERROR', 'Configuración incompleta.', undefined, correlationId)
  }
  const admin = createClient<Database>(supabaseUrl, serviceKey)

  // Rate-limit por IP ANTES de cualquier lectura — primer control anti
  // enumeración/fuerza bruta sobre esta puerta anónima.
  const ip = ipDelRequest(req)
  const { data: permitido, error: errorRateLimit } = await admin.rpc('check_rate_limit', {
    p_bucket: `edc_ip:${ip}`,
    p_max_hits: 120,
    p_window: '1 hour',
  })
  if (errorRateLimit) {
    // Un fallo del rate-limiter no debe dejar la puerta abierta ni cerrada de
    // golpe: se registra y se degradar a permitir (mismo criterio que otros
    // callers: el fallo queda visible en logs para investigar).
    logEvent({
      level: 'error',
      action: 'rate_limit.check_failed',
      correlationId,
      message: errorRateLimit.message,
      meta: { funcion: 'ver-estado-cuenta' },
    })
  } else if (permitido === false) {
    return errorResponse(
      429,
      'RATE_LIMITED',
      'Demasiados accesos desde esta dirección. Inténtalo más tarde.',
      undefined,
      correlationId,
    )
  }

  const { data: registro, error: errorRegistro } = await admin
    .from('estados_cuenta_generados')
    .select('datos, created_at, folio, tenant_id')
    .eq('id', id)
    .maybeSingle()
  if (errorRegistro) {
    return errorResponse(500, 'INTERNAL_ERROR', errorRegistro.message, undefined, correlationId)
  }
  if (!registro) {
    return errorResponse(
      404,
      'ESTADO_CUENTA_NO_ENCONTRADO',
      'Este comprobante de cuenta no existe.',
      undefined,
      correlationId,
    )
  }

  // ── Autorización: token firmado O sesión de miembro activo ──────────────
  const token = typeof cuerpo?.t === 'string' ? cuerpo.t : null
  let via: 'token' | 'sesion'

  if (token !== null) {
    const veredicto = await verificarTokenEnlace(token, id)
    if (veredicto === 'invalido') {
      return errorResponse(
        403,
        'ESTADO_CUENTA_ENLACE_INVALIDO',
        'Este enlace no es válido. Píde uno nuevo a la administración.',
        undefined,
        correlationId,
      )
    }
    if (veredicto === 'vencido') {
      return errorResponse(
        410,
        'ESTADO_CUENTA_VENCIDO',
        'Este enlace venció. Pide uno nuevo a la administración.',
        undefined,
        correlationId,
      )
    }
    via = 'token'
  } else {
    const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    if (!jwt) {
      return errorResponse(
        401,
        'UNAUTHENTICATED',
        'Se requiere enlace firmado o sesión activa en la copropiedad.',
        undefined,
        correlationId,
      )
    }
    const { data: userData, error: errorUser } = await admin.auth.getUser(jwt)
    const userId = userData?.user?.id
    if (errorUser || !userId) {
      return errorResponse(401, 'UNAUTHENTICATED', 'Sesión inválida.', undefined, correlationId)
    }
    // service_role lee memberships por encima de RLS — solo existe la
    // membresía si el usuario pertenece ACTIVO a este tenant.
    const { data: membership } = await admin
      .from('memberships')
      .select('id')
      .eq('user_id', userId)
      .eq('tenant_id', registro.tenant_id)
      .eq('status', 'active')
      .maybeSingle()
    if (!membership) {
      return errorResponse(
        403,
        'FORBIDDEN',
        'No eres miembro de esta copropiedad.',
        undefined,
        correlationId,
      )
    }
    via = 'sesion'
  }

  // Vigencia del documento (independiente de la del token): un snapshot muy
  // viejo deja de servirse — el propietario pide uno nuevo y el folio nuevo
  // queda trazado.
  const vigenteHasta = new Date(registro.created_at)
  vigenteHasta.setDate(vigenteHasta.getDate() + VIGENCIA_DIAS)
  if (vigenteHasta.getTime() < Date.now()) {
    return errorResponse(
      410,
      'ESTADO_CUENTA_VENCIDO',
      'Este comprobante venció. Pide uno actualizado a la administración.',
      undefined,
      correlationId,
    )
  }

  // Auditoría best-effort: toda puerta anónima deja rastro (cierra la mitad
  // "sin auditoría" del hallazgo A2). Un fallo aquí no bloquea la lectura.
  try {
    await admin.from('audit_log').insert({
      action: 'estado_cuenta.acceso',
      entity_type: 'estados_cuenta_generados',
      entity_id: id,
      metadata: { via, correlation_id: correlationId },
      ip,
      user_agent: req.headers.get('user-agent'),
    })
  } catch (errorAuditoria) {
    logEvent({
      level: 'warn',
      action: 'estado_cuenta.auditoria_fallo',
      correlationId,
      message: errorAuditoria instanceof Error ? errorAuditoria.message : 'desconocido',
      meta: { estado_cuenta_id: id },
    })
  }

  // Hash de contenido: JSON.stringify sobre el jsonb leído es determinista
  // (jsonb normaliza claves), así que el mismo registro produce siempre el
  // mismo hash — es lo que imprime el documento como sello de autenticidad.
  const contenidoHash = await sha256HexPublico(JSON.stringify(registro.datos))

  // Fase 2 (D-32, cierra D-28 punto 4): el botón "Pagar" del visor se
  // enciende solo cuando el tenant tiene una pasarela activa. No hace falta
  // comprobar verificada_at aparte: fn_activar_pasarela ya lo exige para
  // activar en modo producción, así que activa=true lo garantiza por
  // invariante. Dato público (un booleano, ningún secreto) — seguro de
  // exponer en esta puerta anónima.
  const { data: pasarelaActiva } = await admin
    .from('pasarela_config')
    .select('id')
    .eq('tenant_id', registro.tenant_id)
    .eq('activa', true)
    .maybeSingle()

  return jsonResponse(
    {
      datos: registro.datos,
      folio: registro.folio,
      contenido_hash: contenidoHash,
      pago_habilitado: !!pasarelaActiva,
    },
    200,
    correlationId,
  )
})
