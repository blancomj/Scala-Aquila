// EXT-03 §3.2 · Un actor externo (EXT-01, sesión real) solicita una reserva. `inmueble_id` se
// resuelve SIEMPRE del lado del servidor vía fn_actor_externo_mis_vinculos() del propio caller —
// nunca del cuerpo que mande el cliente, mismo criterio que external-solicitudes-crear (EXT-02).
// Toda validación de negocio (duración/ventana/límite/cupo/traslape) vive en guard_mant_reserva y
// el exclude constraint de MANT-10 — esta función no valida solapamiento por su cuenta (spec,
// prueba 10).
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse, parsearErrorRpc, respuestaPreflight } from '../_shared/http.ts'

interface VinculoFila {
  vinculo_id: string
  inmueble_id: string
}

const ESTADO_HTTP_POR_CODIGO: Record<string, number> = {
  RESERVA_ZONA_SIN_REGLA_VIGENTE: 400,
  RESERVA_DURACION_EXCEDIDA: 400,
  RESERVA_FUERA_DE_VENTANA: 400,
  RESERVA_LIMITE_INMUEBLE_EXCEDIDO: 400,
  RESERVA_INMUEBLE_NO_VINCULADO: 400,
  RESERVA_FUERA_DE_HORARIO_SEMANAL: 400,
  RESERVA_CUPO_EXCEDIDO: 409,
  RESERVA_TRASLAPE: 409,
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
    zona_comun_id?: unknown
    fecha?: unknown
    hora_inicio?: unknown
    hora_fin?: unknown
  } | null
  const vinculoId = cuerpo?.vinculo_id
  const zonaComunId = cuerpo?.zona_comun_id
  const fecha = cuerpo?.fecha
  const horaInicio = cuerpo?.hora_inicio
  const horaFin = cuerpo?.hora_fin
  if (
    typeof vinculoId !== 'string' || typeof zonaComunId !== 'string' || typeof fecha !== 'string'
    || typeof horaInicio !== 'string' || typeof horaFin !== 'string'
  ) {
    return errorResponse(
      400, 'INVALID_PAYLOAD',
      'vinculo_id, zona_comun_id, fecha, hora_inicio y hora_fin son requeridos.', undefined, correlationId,
    )
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

  const { data: reserva, error: errorCrear } = await cliente
    .rpc('fn_reserva_crear_externa', {
      p_vinculo_id: vinculo.vinculo_id,
      p_inmueble_id: vinculo.inmueble_id,
      p_zona_comun_id: zonaComunId,
      p_fecha: fecha,
      p_hora_inicio: horaInicio,
      p_hora_fin: horaFin,
    })
    .single()
  if (errorCrear) {
    const { code, message } = parsearErrorRpc(errorCrear.message)
    return errorResponse(ESTADO_HTTP_POR_CODIGO[code] ?? 500, code, message, undefined, correlationId)
  }

  return jsonResponse(reserva, 201, correlationId)
})
