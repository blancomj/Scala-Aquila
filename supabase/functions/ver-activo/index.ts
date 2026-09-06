// Consulta pública de la ficha básica de un activo por QR — MANT-0 §4.5.
//
// El técnico externo y el residente no tienen sesión (AD-26) — mismo patrón
// que ver-estado-cuenta (D-27): un token HMAC determinista (link_token.ts,
// mismo secreto compartido) firma {activo_id, exp}. A diferencia del estado
// de cuenta, `qr_token` se genera UNA VEZ con vigencia muy larga (~50 años,
// ver generar-qr-activo) porque se imprime en un rótulo físico permanente
// — no se regenera por acceso.
//
// Solo CONSULTA de la ficha básica: qué activo es, dónde está, su estado.
// Nunca expone valor_adquisicion, proveedor, costos ni historial financiero
// (MANT-0 §4.5, prueba #17) — el SELECT ni siquiera trae esas columnas.
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse, respuestaPreflight } from '../_shared/http.ts'
import { verificarTokenEnlace } from '../_shared/link_token.ts'
import { logEvent } from '../_shared/logger.ts'

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
  const cuerpo = body as { qr?: unknown } | null
  const qr = cuerpo?.qr
  if (typeof qr !== 'string' || qr.length === 0) {
    return errorResponse(400, 'INVALID_PAYLOAD', 'qr debe ser un string.', undefined, correlationId)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return errorResponse(500, 'INTERNAL_ERROR', 'Configuración incompleta.', undefined, correlationId)
  }
  const admin = createClient<Database>(supabaseUrl, serviceKey)

  const ip = ipDelRequest(req)
  const { data: permitido, error: errorRateLimit } = await admin.rpc('check_rate_limit', {
    p_bucket: `qr_activo_ip:${ip}`,
    p_max_hits: 120,
    p_window: '1 hour',
  })
  if (errorRateLimit) {
    logEvent({
      level: 'error',
      action: 'rate_limit.check_failed',
      correlationId,
      message: errorRateLimit.message,
      meta: { funcion: 'ver-activo' },
    })
  } else if (permitido === false) {
    return errorResponse(429, 'RATE_LIMITED', 'Demasiados accesos desde esta dirección.', undefined, correlationId)
  }

  // El qr_token es único (constraint) — se busca por él directamente, no por id: el rótulo
  // físico solo conoce el token, nunca el uuid del activo.
  const { data: activo, error: errorActivo } = await admin
    .from('activos')
    .select(
      'id, qr_token, nombre, estado, ubicacion_detalle, tenant_id, ' +
        'tipo:tipo_id(nombre), categoria:categoria_id(nombre), ' +
        'agrupacion:agrupacion_id(nombre), zona_comun:zona_comun_id(nombre)',
    )
    .eq('qr_token', qr)
    .maybeSingle()
  if (errorActivo) {
    return errorResponse(500, 'INTERNAL_ERROR', errorActivo.message, undefined, correlationId)
  }
  if (!activo?.qr_token) {
    return errorResponse(404, 'ACTIVO_INVALIDO', 'Este código no corresponde a ningún activo.', undefined, correlationId)
  }

  const veredicto = await verificarTokenEnlace(activo.qr_token, activo.id)
  if (veredicto === 'invalido') {
    return errorResponse(403, 'ACTIVO_INVALIDO', 'Este código no es válido.', undefined, correlationId)
  }
  if (veredicto === 'vencido') {
    return errorResponse(410, 'ACTIVO_INVALIDO', 'Este código venció — pide uno nuevo a la administración.', undefined, correlationId)
  }

  try {
    await admin.from('audit_log').insert({
      tenant_id: activo.tenant_id,
      action: 'activo.qr_acceso',
      entity_type: 'activos',
      entity_id: activo.id,
      metadata: { correlation_id: correlationId },
      ip,
      user_agent: req.headers.get('user-agent'),
    })
  } catch (errorAuditoria) {
    logEvent({
      level: 'warn',
      action: 'activo.qr_auditoria_fallo',
      correlationId,
      message: errorAuditoria instanceof Error ? errorAuditoria.message : 'desconocido',
      meta: { activo_id: activo.id },
    })
  }

  return jsonResponse(
    {
      nombre: activo.nombre,
      estado: activo.estado,
      tipo: (activo.tipo as { nombre: string } | null)?.nombre ?? null,
      categoria: (activo.categoria as { nombre: string } | null)?.nombre ?? null,
      ubicacion: (activo.agrupacion as { nombre: string } | null)?.nombre
        ?? (activo.zona_comun as { nombre: string } | null)?.nombre
        ?? null,
      ubicacion_detalle: activo.ubicacion_detalle,
    },
    200,
    correlationId,
  )
})
