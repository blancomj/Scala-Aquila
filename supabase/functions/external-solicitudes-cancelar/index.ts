// EXT-02 §3.2 · El actor externo cancela su propia solicitud mientras siga en recibida_externa
// (antes de que el staff la haya mirado). fn_solicitud_cancelar_externa (parche GOB-8/EXT-02) ya
// valida internamente que el vínculo pertenece al auth.uid() que llama — aquí se hace el mismo
// chequeo explícito contra fn_actor_externo_mis_vinculos ANTES, para devolver siempre el mismo
// 403 VINCULO_NO_PERTENECE que el resto de las Edge Functions de este corte (contrato uniforme).
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse, parsearErrorRpc, respuestaPreflight } from '../_shared/http.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 30
const RATE_LIMIT_VENTANA = '1 hour'

interface VinculoFila {
  vinculo_id: string
}

const ESTADO_HTTP_POR_CODIGO: Record<string, number> = {
  SOLICITUD_CANCELACION_FUERA_DE_PLAZO: 409,
  ATENCION_SOLICITUD_INEXISTENTE: 404,
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
  const cuerpo = body as { vinculo_id?: unknown; solicitud_id?: unknown } | null
  const vinculoId = cuerpo?.vinculo_id
  const solicitudId = cuerpo?.solicitud_id
  if (typeof vinculoId !== 'string' || typeof solicitudId !== 'string') {
    return errorResponse(400, 'INVALID_PAYLOAD', 'vinculo_id y solicitud_id son requeridos.', undefined, correlationId)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !anonKey) {
    return errorResponse(500, 'INTERNAL_ERROR', 'Configuración incompleta.', undefined, correlationId)
  }

  const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!jwt) {
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere sesión activa.', undefined, correlationId)
  }
  const cliente = createClient<Database>(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const {
    data: { user },
  } = await cliente.auth.getUser(jwt)
  if (!user) {
    return errorResponse(401, 'UNAUTHENTICATED', 'Sesión inválida.', undefined, correlationId)
  }

  const { data: vinculos, error: errorVinculos } = await cliente.rpc('fn_actor_externo_mis_vinculos', {
    p_auth_user_id: user.id,
  })
  if (errorVinculos) {
    return errorResponse(500, 'INTERNAL_ERROR', errorVinculos.message, undefined, correlationId)
  }
  const vinculo = (vinculos as VinculoFila[] | null)?.find((v) => v.vinculo_id === vinculoId)
  if (!vinculo) {
    return errorResponse(
      403, 'VINCULO_NO_PERTENECE',
      'Este vínculo no existe, no es tuyo, o ya no está vigente.', undefined, correlationId,
    )
  }

  const bloqueo = await enforceRateLimit(
    cliente, `solicitudes_cancelar_vinculo:${vinculo.vinculo_id}`, RATE_LIMIT_MAX_HITS, RATE_LIMIT_VENTANA, correlationId,
  )
  if (bloqueo) return bloqueo

  const { data: solicitud, error: errorCancelar } = await cliente
    .rpc('fn_solicitud_cancelar_externa', { p_vinculo_id: vinculo.vinculo_id, p_solicitud_id: solicitudId })
    .single()
  if (errorCancelar) {
    const { code, message } = parsearErrorRpc(errorCancelar.message)
    return errorResponse(ESTADO_HTTP_POR_CODIGO[code] ?? 500, code, message, undefined, correlationId)
  }

  return jsonResponse(solicitud, 200, correlationId)
})
