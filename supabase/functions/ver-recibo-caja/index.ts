// Enlace público del recibo de caja — RC-4, clon deliberado de
// ver-estado-cuenta (D-27): mismo problema (el propietario/residente no
// tiene auth.users, AD-26), misma solución de dos puertas.
//
//   1. TOKEN FIRMADO — body {id, t}: `t` es un HMAC de {id, exp}
//      (_shared/link_token.ts, genérico — el mismo módulo que ya usa
//      ver-estado-cuenta, sin cambios) que mintió enviar-recibo-caja.
//   2. SESIÓN DE MIEMBRO — body {id} con JWT válido: el administrador que
//      abre el documento desde la app.
//
// Sigue devolviendo JSON, no HTML — el gateway de Supabase Edge Functions
// fuerza Content-Type text/plain en cualquier respuesta; el HTML lo
// renderiza apps/web/app/pages/recibo-caja/[id].vue sobre nuestro Nuxt.
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse, respuestaPreflight } from '../_shared/http.ts'
import { sha256HexPublico, verificarTokenEnlace } from '../_shared/link_token.ts'
import { logEvent } from '../_shared/logger.ts'

const VIGENCIA_DIAS = 30
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
  if (cuerpo?.t !== undefined && typeof cuerpo.t !== 'string') {
    return errorResponse(400, 'INVALID_PAYLOAD', 't debe ser un string.', undefined, correlationId)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return errorResponse(500, 'INTERNAL_ERROR', 'Configuración incompleta.', undefined, correlationId)
  }
  const admin = createClient<Database>(supabaseUrl, serviceKey)

  const ip = ipDelRequest(req)
  const { data: permitido, error: errorRateLimit } = await admin.rpc('check_rate_limit', {
    p_bucket: `rc_ip:${ip}`,
    p_max_hits: 120,
    p_window: '1 hour',
  })
  if (errorRateLimit) {
    logEvent({
      level: 'error',
      action: 'rate_limit.check_failed',
      correlationId,
      message: errorRateLimit.message,
      meta: { funcion: 'ver-recibo-caja' },
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
    .from('recibos_caja')
    .select('datos, created_at, folio, tenant_id, pago_id')
    .eq('id', id)
    .maybeSingle()
  if (errorRegistro) {
    return errorResponse(500, 'INTERNAL_ERROR', errorRegistro.message, undefined, correlationId)
  }
  if (!registro) {
    return errorResponse(
      404,
      'RECIBO_CAJA_NO_ENCONTRADO',
      'Este recibo de caja no existe.',
      undefined,
      correlationId,
    )
  }

  const token = typeof cuerpo?.t === 'string' ? cuerpo.t : null
  let via: 'token' | 'sesion'

  if (token !== null) {
    const veredicto = await verificarTokenEnlace(token, id)
    if (veredicto === 'invalido') {
      return errorResponse(
        403,
        'RECIBO_CAJA_ENLACE_INVALIDO',
        'Este enlace no es válido. Pide uno nuevo a la administración.',
        undefined,
        correlationId,
      )
    }
    if (veredicto === 'vencido') {
      return errorResponse(
        410,
        'RECIBO_CAJA_VENCIDO',
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

  const vigenteHasta = new Date(registro.created_at)
  vigenteHasta.setDate(vigenteHasta.getDate() + VIGENCIA_DIAS)
  if (vigenteHasta.getTime() < Date.now()) {
    return errorResponse(
      410,
      'RECIBO_CAJA_VENCIDO',
      'Este recibo venció. Pide uno actualizado a la administración.',
      undefined,
      correlationId,
    )
  }

  try {
    await admin.from('audit_log').insert({
      action: 'recibo_caja.acceso',
      entity_type: 'recibos_caja',
      entity_id: id,
      metadata: { via, correlation_id: correlationId },
      ip,
      user_agent: req.headers.get('user-agent'),
    })
  } catch (errorAuditoria) {
    logEvent({
      level: 'warn',
      action: 'recibo_caja.auditoria_fallo',
      correlationId,
      message: errorAuditoria instanceof Error ? errorAuditoria.message : 'desconocido',
      meta: { recibo_caja_id: id },
    })
  }

  // ¿Está anulado? Se DERIVA aquí, no se persiste (mismo principio que el
  // resto del ledger, ver cabecera de 20260903160000_recibos_caja.sql): un
  // recibo cuyo pago tiene una reversa registrada se muestra como anulado.
  const { data: reversa } = await admin
    .from('pagos')
    .select('id, fecha_pago, anulado_motivo')
    .eq('pago_original_id', registro.pago_id)
    .maybeSingle()

  const contenidoHash = await sha256HexPublico(JSON.stringify(registro.datos))

  return jsonResponse(
    {
      datos: registro.datos,
      folio: registro.folio,
      contenido_hash: contenidoHash,
      anulado: reversa !== null,
      anulado_motivo: reversa?.anulado_motivo ?? null,
      anulado_fecha: reversa?.fecha_pago ?? null,
    },
    200,
    correlationId,
  )
})
