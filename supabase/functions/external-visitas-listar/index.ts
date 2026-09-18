// EXT-04 §3.3 · "Mis visitas" — historial y autorizaciones vigentes del vínculo que llama.
// Igual que external-reservas-listar (EXT-03), el spec no define un endpoint de detalle separado
// — cada fila del listado ya trae su estado completo (incluido si ya fue usada, vía
// fn_autorizacion_visita_mis_autorizaciones_externas).
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse, respuestaPreflight } from '../_shared/http.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 60
const RATE_LIMIT_VENTANA = '1 hour'

interface VinculoFila {
  vinculo_id: string
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
  const vinculoId = (body as { vinculo_id?: unknown } | null)?.vinculo_id
  if (typeof vinculoId !== 'string') {
    return errorResponse(400, 'INVALID_PAYLOAD', 'vinculo_id es requerido.', undefined, correlationId)
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
    cliente, `visitas_listar_vinculo:${vinculo.vinculo_id}`, RATE_LIMIT_MAX_HITS, RATE_LIMIT_VENTANA, correlationId,
  )
  if (bloqueo) return bloqueo

  const { data: lista, error: errorLista } = await cliente.rpc('fn_autorizacion_visita_mis_autorizaciones_externas', {
    p_vinculo_id: vinculo.vinculo_id,
  })
  if (errorLista) {
    return errorResponse(500, 'INTERNAL_ERROR', errorLista.message, undefined, correlationId)
  }
  return jsonResponse(lista ?? [], 200, correlationId)
})
