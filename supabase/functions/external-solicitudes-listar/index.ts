// EXT-02 §3.3 · "Mis solicitudes" — listado (fn_solicitud_mis_solicitudes_externas, EXT-02) y
// detalle (fn_solicitud_estado_externo, parche GOB-8, sin cambios) del mismo vínculo. Una sola
// Edge Function para ambos casos: solicitud_id presente → detalle; ausente → lista completa.
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse, respuestaPreflight } from '../_shared/http.ts'

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
  const cuerpo = body as { vinculo_id?: unknown; solicitud_id?: unknown } | null
  const vinculoId = cuerpo?.vinculo_id
  if (typeof vinculoId !== 'string') {
    return errorResponse(400, 'INVALID_PAYLOAD', 'vinculo_id es requerido.', undefined, correlationId)
  }
  const solicitudId = typeof cuerpo?.solicitud_id === 'string' ? cuerpo.solicitud_id : null

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

  if (solicitudId) {
    const { data, error } = await cliente.rpc('fn_solicitud_estado_externo', {
      p_actor_externo_vinculo_id: vinculo.vinculo_id, p_solicitud_id: solicitudId,
    })
    if (error) {
      return errorResponse(500, 'INTERNAL_ERROR', error.message, undefined, correlationId)
    }
    const fila = (data as unknown[])[0]
    if (!fila) {
      return errorResponse(404, 'ATENCION_SOLICITUD_INEXISTENTE', 'Solicitud no encontrada.', undefined, correlationId)
    }
    return jsonResponse(fila, 200, correlationId)
  }

  const { data: lista, error: errorLista } = await cliente.rpc('fn_solicitud_mis_solicitudes_externas', {
    p_vinculo_id: vinculo.vinculo_id,
  })
  if (errorLista) {
    return errorResponse(500, 'INTERNAL_ERROR', errorLista.message, undefined, correlationId)
  }
  return jsonResponse(lista ?? [], 200, correlationId)
})
