// EXT-02 §3.1 · Un actor externo (EXT-01, sesión real) radica una PQRS. Primera Edge Function de
// External que autentica por sesión en vez de por token firmado (link_token.ts) — precedente para
// EXT-03/04. `inmueble_id` se resuelve SIEMPRE del lado del servidor vía
// fn_actor_externo_mis_vinculos() del propio caller — nunca del cuerpo que mande el cliente, para
// que sea imposible radicar a nombre de otro inmueble aunque el cliente móvil esté comprometido
// (spec, prueba 2).
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse, parsearErrorRpc, respuestaPreflight } from '../_shared/http.ts'

interface VinculoFila {
  vinculo_id: string
  inmueble_id: string
}

const ESTADO_HTTP_POR_CODIGO: Record<string, number> = {
  SOLICITUD_EXTERNA_INMUEBLE_NO_VINCULADO: 400,
  RATE_LIMITED: 429,
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
  const cuerpo = body as {
    vinculo_id?: unknown
    tipo_id?: unknown
    categoria_id?: unknown
    asunto?: unknown
    descripcion?: unknown
  } | null
  const vinculoId = cuerpo?.vinculo_id
  const tipoId = cuerpo?.tipo_id
  const categoriaId = cuerpo?.categoria_id
  const asunto = cuerpo?.asunto
  if (
    typeof vinculoId !== 'string' || typeof tipoId !== 'number' || typeof categoriaId !== 'number'
    || typeof asunto !== 'string' || !asunto.trim()
  ) {
    return errorResponse(
      400, 'INVALID_PAYLOAD',
      'vinculo_id, tipo_id, categoria_id y asunto son requeridos.', undefined, correlationId,
    )
  }
  const descripcion = typeof cuerpo?.descripcion === 'string' ? cuerpo.descripcion : null

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

  const { data: solicitud, error: errorCrear } = await cliente
    .rpc('fn_solicitud_recibir_externa', {
      p_actor_externo_vinculo_id: vinculo.vinculo_id,
      p_inmueble_id: vinculo.inmueble_id,
      p_tipo_id: tipoId,
      p_categoria_id: categoriaId,
      p_asunto: asunto.trim(),
      ...(descripcion ? { p_descripcion: descripcion } : {}),
    })
    .single()
  if (errorCrear) {
    const { code, message } = parsearErrorRpc(errorCrear.message)
    return errorResponse(ESTADO_HTTP_POR_CODIGO[code] ?? 500, code, message, undefined, correlationId)
  }

  return jsonResponse(solicitud, 201, correlationId)
})
