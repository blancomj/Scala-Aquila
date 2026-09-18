// EXT-08b §7.10 (Ola 2, M11) — bandeja in-app del actor externo. Una sola Edge Function con
// `accion: 'listar'|'marcar_leida'` (mismo espíritu minimalista que external-contactos-emergencia).
//
// `notificaciones_actor_externo` no tiene NINGUNA política RLS (ni siquiera SELECT, a diferencia
// de exs2_notificaciones) — todo pasa por admin (service_role) tras resolver el contexto
// (_shared/actor_externo_context.ts), mismo camino que external-cuenta-resumen/documentos-listar.
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import {
  extraerJwtDelHeader,
  resolverContextoActorExterno,
  respuestaErrorContextoActorExterno,
} from '../_shared/actor_externo_context.ts'
import { errorResponse, jsonResponse, respuestaPreflight } from '../_shared/http.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 60
const RATE_LIMIT_VENTANA = '1 hour'
const LIMITE_LISTADO = 30

interface Cuerpo {
  vinculo_id?: unknown
  accion?: unknown
  notificacion_id?: unknown
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
  const cuerpo = body as Cuerpo | null
  const vinculoId = cuerpo?.vinculo_id
  const accion = cuerpo?.accion
  if (typeof vinculoId !== 'string' || vinculoId.length === 0) {
    return errorResponse(400, 'INVALID_PAYLOAD', 'vinculo_id es requerido.', undefined, correlationId)
  }
  if (accion !== 'listar' && accion !== 'marcar_leida') {
    return errorResponse(400, 'INVALID_PAYLOAD', 'accion debe ser "listar" o "marcar_leida".', undefined, correlationId)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return errorResponse(500, 'INTERNAL_ERROR', 'Configuración incompleta.', undefined, correlationId)
  }
  const admin = createClient<Database>(supabaseUrl, serviceKey)

  const jwt = extraerJwtDelHeader(req)
  const contexto = await resolverContextoActorExterno(admin, jwt, vinculoId)
  if ('tipo' in contexto) {
    return respuestaErrorContextoActorExterno(contexto, correlationId)
  }

  const bloqueo = await enforceRateLimit(
    admin,
    `notificaciones_actor_externo:${contexto.vinculoId}`,
    RATE_LIMIT_MAX_HITS,
    RATE_LIMIT_VENTANA,
    correlationId,
  )
  if (bloqueo) return bloqueo

  if (accion === 'listar') {
    const { data, error } = await admin
      .from('notificaciones_actor_externo')
      .select('id, titulo, cuerpo, enlace, leida_at, created_at')
      .eq('actor_externo_vinculo_id', contexto.vinculoId)
      .order('created_at', { ascending: false })
      .limit(LIMITE_LISTADO)
    if (error) {
      return errorResponse(500, 'INTERNAL_ERROR', error.message, undefined, correlationId)
    }
    return jsonResponse({ notificaciones: data ?? [] }, 200, correlationId)
  }

  // accion === 'marcar_leida'
  const notificacionId = cuerpo?.notificacion_id
  if (typeof notificacionId !== 'string' || notificacionId.length === 0) {
    return errorResponse(400, 'INVALID_PAYLOAD', 'notificacion_id es requerido.', undefined, correlationId)
  }
  const { data, error } = await admin
    .from('notificaciones_actor_externo')
    .update({ leida_at: new Date().toISOString() })
    .eq('id', notificacionId)
    .eq('actor_externo_vinculo_id', contexto.vinculoId) // nunca marca la de otro vínculo
    .select('id, titulo, cuerpo, enlace, leida_at, created_at')
    .maybeSingle()
  if (error) {
    return errorResponse(500, 'INTERNAL_ERROR', error.message, undefined, correlationId)
  }
  if (!data) {
    return errorResponse(404, 'NOTIFICACION_NO_ENCONTRADA', 'Esta notificación no existe o no es tuya.', undefined, correlationId)
  }
  return jsonResponse(data, 200, correlationId)
})
