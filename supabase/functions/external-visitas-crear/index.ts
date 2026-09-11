// EXT-04 §3.1 · Un actor externo (EXT-01, sesión real) autoriza una visita y recibe su QR de
// vigencia corta. `inmueble_id` se resuelve SIEMPRE del lado del servidor vía
// fn_actor_externo_mis_vinculos() del propio caller — nunca del cuerpo que mande el cliente,
// mismo criterio que external-solicitudes-crear (EXT-02) / external-reservas-crear (EXT-03).
//
// Duplica (no reutiliza) el mismo patrón de dos pasos que ya usa autorizacion-visita-crear
// (MANT-11, staff-only): insertar primero (guard_mant_autorizacion_visita valida
// AUTORIZACION_INMUEBLE_NO_VINCULADO/AUTORIZACION_VIGENCIA_EXCESIVA al insertar), firmar el QR
// con el id ya real, adjuntar después — no se modificó esa función existente, mismo criterio de
// diff mínimo que el resto de la sesión (fn_solicitud_cancelar_externa, fn_reserva_crear_externa).
// No hay función SQL equivalente posible: firmar el QR exige Web Crypto de Deno
// (_shared/link_token.ts), irreproducible en plpgsql.
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse, respuestaPreflight } from '../_shared/http.ts'
import { firmarTokenEnlace } from '../_shared/link_token.ts'

interface VinculoFila {
  vinculo_id: string
  tenant_id: string
  inmueble_id: string
}

const VENTANA_HORAS = 6

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
    visitante_nombre?: unknown
    visitante_documento?: unknown
    tipo_id?: unknown
    fecha_prevista?: unknown
    hora_desde?: unknown
    hora_hasta?: unknown
  } | null
  const vinculoId = cuerpo?.vinculo_id
  const visitanteNombre = cuerpo?.visitante_nombre
  const fechaPrevista = cuerpo?.fecha_prevista
  if (
    typeof vinculoId !== 'string' || typeof visitanteNombre !== 'string' || !visitanteNombre.trim()
    || typeof fechaPrevista !== 'string'
  ) {
    return errorResponse(
      400, 'INVALID_PAYLOAD',
      'vinculo_id, visitante_nombre y fecha_prevista son requeridos.', undefined, correlationId,
    )
  }
  const visitanteDocumento = typeof cuerpo?.visitante_documento === 'string' ? cuerpo.visitante_documento : null
  const tipoId = typeof cuerpo?.tipo_id === 'number' ? cuerpo.tipo_id : null
  const horaDesde = typeof cuerpo?.hora_desde === 'string' ? cuerpo.hora_desde : null
  const horaHasta = typeof cuerpo?.hora_hasta === 'string' ? cuerpo.hora_hasta : null

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceKey) {
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

  const finVentanaBase = new Date(`${fechaPrevista}T${horaHasta ?? horaDesde ?? '23:59:59'}`)
  if (Number.isNaN(finVentanaBase.getTime())) {
    return errorResponse(400, 'INVALID_PAYLOAD', 'fecha_prevista/hora_hasta inválidas.', undefined, correlationId)
  }
  const qrExpiraAt = new Date(finVentanaBase.getTime() + VENTANA_HORAS * 3600 * 1000)

  const admin = createClient<Database>(supabaseUrl, serviceKey)
  const { data: fila, error: errorInsert } = await admin
    .from('mant_autorizaciones_visita')
    .insert({
      tenant_id: vinculo.tenant_id,
      inmueble_id: vinculo.inmueble_id,
      autorizado_por_ref: vinculo.vinculo_id,
      autorizado_por_origen: 'externo',
      visitante_nombre: visitanteNombre.trim(),
      visitante_documento: visitanteDocumento,
      tipo_id: tipoId,
      fecha_prevista: fechaPrevista,
      hora_desde: horaDesde,
      hora_hasta: horaHasta,
      qr_expira_at: qrExpiraAt.toISOString(),
    })
    .select('*')
    .single()
  if (errorInsert) {
    return errorResponse(400, 'AUTORIZACION_INVALIDA', errorInsert.message, undefined, correlationId)
  }

  const vigenciaDias = (qrExpiraAt.getTime() - Date.now()) / (24 * 3600 * 1000)
  const firmado = await firmarTokenEnlace(fila.id, vigenciaDias)
  const qrToken = `${fila.id}.${firmado}`

  const { data: filaFinal, error: errorUpdate } = await admin
    .from('mant_autorizaciones_visita')
    .update({ qr_token: qrToken })
    .eq('id', fila.id)
    .select('*')
    .single()
  if (errorUpdate) {
    return errorResponse(500, 'INTERNAL_ERROR', errorUpdate.message, undefined, correlationId)
  }

  return jsonResponse(filaFinal, 201, correlationId)
})
