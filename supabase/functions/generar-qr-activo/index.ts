// Genera (una sola vez) el qr_token de un activo — MANT-0 §4.5.
//
// A diferencia de los enlaces del estado de cuenta (30-90 días, se
// regeneran por request), un QR se imprime en un rótulo físico permanente:
// se firma UNA VEZ con una vigencia deliberadamente larga (~50 años, no
// "para siempre" — link_token.ts exige un `exp` numérico, así que se elige
// un horizonte que en la práctica nunca vence) y se guarda en
// `activos.qr_token`. Idempotente: si el activo ya tiene token, lo
// devuelve tal cual en vez de invalidar el rótulo ya impreso.
//
// Requiere sesión de miembro con rol auxiliar/administrador — mismo criterio
// que fn_mant_capitalizar_activo (verificación vía RPC has_role, no una
// tabla nueva de permisos).
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse, respuestaPreflight } from '../_shared/http.ts'
import { firmarTokenEnlace } from '../_shared/link_token.ts'

const VIGENCIA_DIAS = 365 * 50

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
  const cuerpo = body as { activo_id?: unknown; tenant_id?: unknown } | null
  const activoId = cuerpo?.activo_id
  const tenantId = cuerpo?.tenant_id
  if (typeof activoId !== 'string' || typeof tenantId !== 'string') {
    return errorResponse(400, 'INVALID_PAYLOAD', 'activo_id y tenant_id son requeridos.', undefined, correlationId)
  }

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
  const { data: rolOk, error: errorRol } = await cliente.rpc('has_role', {
    p_tenant: tenantId,
    p_roles: ['auxiliar'],
  })
  if (errorRol || !rolOk) {
    return errorResponse(403, 'FORBIDDEN', 'Se requiere rol auxiliar o administrador.', undefined, correlationId)
  }

  const { data: activo, error: errorActivo } = await admin
    .from('activos')
    .select('id, qr_token')
    .eq('id', activoId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (errorActivo) {
    return errorResponse(500, 'INTERNAL_ERROR', errorActivo.message, undefined, correlationId)
  }
  if (!activo) {
    return errorResponse(404, 'ACTIVO_INVALIDO', 'El activo no existe en esta copropiedad.', undefined, correlationId)
  }
  if (activo.qr_token) {
    return jsonResponse({ qr_token: activo.qr_token }, 200, correlationId)
  }

  const token = await firmarTokenEnlace(activo.id, VIGENCIA_DIAS)
  const { error: errorUpdate } = await admin.from('activos').update({ qr_token: token }).eq('id', activo.id)
  if (errorUpdate) {
    return errorResponse(500, 'INTERNAL_ERROR', errorUpdate.message, undefined, correlationId)
  }

  return jsonResponse({ qr_token: token }, 200, correlationId)
})
