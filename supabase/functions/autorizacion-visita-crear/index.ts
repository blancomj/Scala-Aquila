// MANT-11 §4.1-4.2 · Crea una autorización de visita y firma su QR de vigencia corta.
//
// Dos pasos porque firmarTokenEnlace() necesita el id de la fila (que solo existe tras el
// INSERT) y el propio guard de la base (AUTORIZACION_INMUEBLE_NO_VINCULADO/
// AUTORIZACION_VIGENCIA_EXCESIVA) valida al insertar — mismo patrón exacto que
// generar-qr-activo (MANT-0): insertar primero, firmar con el id ya real, adjuntar después.
//
// Solo staff en este corte (has_role auxiliar+) — el alta desde un actor externo (residente)
// es EXT-03, que reutilizará el guard de la base pero con su propia verificación de identidad;
// aquí solo se construye la función (MANT-11 §5).
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse, respuestaPreflight } from '../_shared/http.ts'
import { firmarTokenEnlace } from '../_shared/link_token.ts'

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
    tenant_id?: unknown
    inmueble_id?: unknown
    visitante_nombre?: unknown
    visitante_documento?: unknown
    tipo_id?: unknown
    fecha_prevista?: unknown
    hora_desde?: unknown
    hora_hasta?: unknown
  } | null
  const tenantId = cuerpo?.tenant_id
  const inmuebleId = cuerpo?.inmueble_id
  const visitanteNombre = cuerpo?.visitante_nombre
  const fechaPrevista = cuerpo?.fecha_prevista
  if (
    typeof tenantId !== 'string' ||
    typeof inmuebleId !== 'string' ||
    typeof visitanteNombre !== 'string' ||
    !visitanteNombre.trim() ||
    typeof fechaPrevista !== 'string'
  ) {
    return errorResponse(
      400, 'INVALID_PAYLOAD',
      'tenant_id, inmueble_id, visitante_nombre y fecha_prevista son requeridos.',
      undefined, correlationId,
    )
  }
  const visitanteDocumento = typeof cuerpo?.visitante_documento === 'string' ? cuerpo.visitante_documento : null
  const tipoId = typeof cuerpo?.tipo_id === 'number' ? cuerpo.tipo_id : null
  const horaDesde = typeof cuerpo?.hora_desde === 'string' ? cuerpo.hora_desde : null
  const horaHasta = typeof cuerpo?.hora_hasta === 'string' ? cuerpo.hora_hasta : null

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
  const {
    data: { user },
  } = await cliente.auth.getUser(jwt)
  if (!user) {
    return errorResponse(401, 'UNAUTHENTICATED', 'Sesión inválida.', undefined, correlationId)
  }

  const finVentanaBase = new Date(`${fechaPrevista}T${horaHasta ?? horaDesde ?? '23:59:59'}`)
  if (Number.isNaN(finVentanaBase.getTime())) {
    return errorResponse(400, 'INVALID_PAYLOAD', 'fecha_prevista/hora_hasta inválidas.', undefined, correlationId)
  }
  const qrExpiraAt = new Date(finVentanaBase.getTime() + VENTANA_HORAS * 3600 * 1000)

  const { data: fila, error: errorInsert } = await admin
    .from('mant_autorizaciones_visita')
    .insert({
      tenant_id: tenantId,
      inmueble_id: inmuebleId,
      autorizado_por_ref: user.id,
      autorizado_por_origen: 'staff',
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
