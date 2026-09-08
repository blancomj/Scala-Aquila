// GOB-8 §4.4 — paquete de consulta sin sesión POR INMUEBLE (AD-26, Opción 1):
// estado de cuenta, paz y salvo, actas publicadas y estado de solicitudes.
// "Documentos publicados" genéricos queda fuera de este paquete (Plan del
// corte, confirmado con el usuario): `documentos` no tiene hoy ninguna
// marca de visibilidad pública, y agregarla tocaría una tabla compartida
// por todo el repo sin que ninguna prueba lo exija.
//
// Este endpoint NO sirve archivos ni datos pesados él mismo — por cada
// ítem que ya tiene su propio visor público (estado de cuenta →
// ver-estado-cuenta, acta → ver-documento) firma un sub-token nuevo
// ({id, t}) con el MISMO mecanismo HMAC (link_token.ts, D-27) para que el
// cliente llame a esos visores ya existentes y probados — cero lógica de
// Storage duplicada aquí. Paz y salvo (certificaciones_deuda) no tiene
// visor propio hoy: se devuelve su dato tal cual, inline.
//
// A diferencia del token de generar-enlace-documento (stateless puro),
// este token SÍ puede revocarse (atencion_tokens_consulta, spec §4.4) —
// por eso valida la fila ademas del HMAC.
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse, respuestaPreflight } from '../_shared/http.ts'
import { firmarTokenEnlace, verificarTokenEnlace } from '../_shared/link_token.ts'
import { logEvent } from '../_shared/logger.ts'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SUB_TOKEN_VIGENCIA_DIAS = 1

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
  const { data: permitido, error: errorRateLimit } = await admin.rpc('check_rate_limit', {
    p_bucket: `inmueble_ip:${ip}`,
    p_max_hits: 120,
    p_window: '1 hour',
  })
  if (errorRateLimit) {
    logEvent({
      level: 'error', action: 'rate_limit.check_failed', correlationId, message: errorRateLimit.message,
      meta: { funcion: 'ver-inmueble' },
    })
  } else if (permitido === false) {
    return errorResponse(429, 'RATE_LIMITED', 'Demasiados accesos desde esta dirección. Inténtalo más tarde.', undefined, correlationId)
  }

  // La fila de control se lee ANTES de verificar el HMAC: revocado_at/expira_at son la parte
  // que el HMAC por sí solo no puede expresar (D-27 es stateless).
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

  try {
    await admin.from('audit_log').insert({
      tenant_id: tokenRow.tenant_id,
      action: 'inmueble.acceso',
      entity_type: 'atencion_tokens_consulta',
      entity_id: id,
      metadata: { correlation_id: correlationId, inmueble_id: tokenRow.inmueble_id },
      ip,
      user_agent: req.headers.get('user-agent'),
    })
  } catch (errorAuditoria) {
    logEvent({
      level: 'warn', action: 'inmueble.auditoria_fallo', correlationId,
      message: errorAuditoria instanceof Error ? errorAuditoria.message : 'desconocido',
      meta: { token_id: id },
    })
  }

  const inmuebleId = tokenRow.inmueble_id

  const [{ data: estadoCuenta }, { data: certificacion }, { data: actas }, { data: solicitudes }] = await Promise.all([
    admin.from('estados_cuenta_generados').select('id, folio, created_at').eq('inmueble_id', inmuebleId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    admin.from('certificaciones_deuda').select('consecutivo, fecha_expedicion, monto_total, certificacion_hash')
      .eq('inmueble_id', inmuebleId).order('fecha_expedicion', { ascending: false }).limit(1).maybeSingle(),
    admin.from('gobierno_actas').select('numero, anio, documento_id').eq('tenant_id', tokenRow.tenant_id)
      .eq('estado', 'publicada').order('anio', { ascending: false }).order('numero', { ascending: false }),
    admin.from('solicitudes').select('id, numero, anio, estado, asunto').eq('inmueble_id', inmuebleId)
      .order('anio', { ascending: false }).order('numero', { ascending: false }),
  ])

  const estadoCuentaPaquete = estadoCuenta
    ? { folio: estadoCuenta.folio, generado_en: estadoCuenta.created_at, id: estadoCuenta.id, t: await firmarTokenEnlace(estadoCuenta.id, SUB_TOKEN_VIGENCIA_DIAS) }
    : null

  const actasPaquete = await Promise.all(
    (actas ?? []).map(async (a: { numero: number; anio: number; documento_id: string | null }) => ({
      numero: a.numero,
      anio: a.anio,
      ...(a.documento_id
        ? { documento_id: a.documento_id, t: await firmarTokenEnlace(a.documento_id, SUB_TOKEN_VIGENCIA_DIAS) }
        : {}),
    })),
  )

  return jsonResponse(
    {
      estado_cuenta: estadoCuentaPaquete,
      paz_y_salvo: certificacion ?? null,
      actas_publicadas: actasPaquete,
      solicitudes: solicitudes ?? [],
    },
    200,
    correlationId,
  )
})
