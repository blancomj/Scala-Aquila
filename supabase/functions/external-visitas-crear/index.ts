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
//
// EXT-09 (Ola 2, M14) — foto + autorización permanente: el body pasa de JSON a
// multipart/form-data (mismo criterio que subir-documento, la única otra función del proyecto
// que recibe un archivo) SOLO para poder adjuntar la foto opcional; ningún campo cambia de
// significado. `permanente=true` omite fecha_prevista/hora_desde/hora_hasta (el CHECK de la
// migración 20260943000000 los exige en null) y usa una vigencia de QR de 1 año (el tope que
// permite el guard actualizado) en vez de la ventana de 6h sobre una fecha puntual que no existe
// para este caso. La foto se sube DESPUÉS de tener el id real de la fila (mismo motivo que el QR:
// la ruta del objeto en Storage usa ese id) — si la subida falla, la autorización queda creada
// igual, sin foto: una foto es un enriquecimiento, no una condición de validez de la visita.
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse, respuestaPreflight } from '../_shared/http.ts'
import { firmarTokenEnlace } from '../_shared/link_token.ts'
import { logEvent } from '../_shared/logger.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 20
const RATE_LIMIT_VENTANA = '1 hour'

interface VinculoFila {
  vinculo_id: string
  tenant_id: string
  inmueble_id: string
}

const VENTANA_HORAS_PUNTUAL = 6
const VENTANA_DIAS_PERMANENTE = 365
const TAMANO_MAXIMO_BYTES = 5 * 1024 * 1024 // 5 MB — mismo límite que el bucket visitas-fotos.
const MIME_PERMITIDOS = new Set(['image/jpeg', 'image/png'])

function sanearNombreArchivo(nombre: string): string {
  const limpio = nombre.replace(/[^\w.\-]+/g, '_').slice(-100)
  return limpio.length > 0 ? limpio : 'foto'
}

Deno.serve(async (req) => {
  const preflight = respuestaPreflight(req)
  if (preflight) return preflight

  const correlationId = crypto.randomUUID()
  if (req.method !== 'POST') {
    return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Solo POST.', undefined, correlationId)
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return errorResponse(400, 'INVALID_PAYLOAD', 'El cuerpo debe ser multipart/form-data.', undefined, correlationId)
  }

  const vinculoId = form.get('vinculo_id')
  const visitanteNombre = form.get('visitante_nombre')
  const permanente = form.get('permanente') === 'true'
  const fechaPrevistaRaw = form.get('fecha_prevista')
  if (
    typeof vinculoId !== 'string' || typeof visitanteNombre !== 'string' || !visitanteNombre.trim()
    || (!permanente && typeof fechaPrevistaRaw !== 'string')
  ) {
    return errorResponse(
      400, 'INVALID_PAYLOAD',
      'vinculo_id, visitante_nombre son requeridos; fecha_prevista es requerida salvo permanente=true.',
      undefined, correlationId,
    )
  }
  const fechaPrevista = permanente ? null : (fechaPrevistaRaw as string)
  const visitanteDocumentoRaw = form.get('visitante_documento')
  const visitanteDocumento = typeof visitanteDocumentoRaw === 'string' ? visitanteDocumentoRaw : null
  const tipoIdRaw = form.get('tipo_id')
  const tipoId = typeof tipoIdRaw === 'string' && tipoIdRaw.length > 0 ? Number(tipoIdRaw) : null
  // Una autorización permanente no tiene ventana horaria propia (CHECK de la migración) —
  // hora_desde/hora_hasta se ignoran si permanente=true en vez de exigir que el cliente no los mande.
  const horaDesdeRaw = form.get('hora_desde')
  const horaDesde = !permanente && typeof horaDesdeRaw === 'string' && horaDesdeRaw.length > 0 ? horaDesdeRaw : null
  const horaHastaRaw = form.get('hora_hasta')
  const horaHasta = !permanente && typeof horaHastaRaw === 'string' && horaHastaRaw.length > 0 ? horaHastaRaw : null
  const foto = form.get('foto')

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return errorResponse(500, 'INTERNAL_ERROR', 'Configuración incompleta.', undefined, correlationId)
  }

  if (foto instanceof File) {
    if (!MIME_PERMITIDOS.has(foto.type)) {
      return errorResponse(400, 'INVALID_PAYLOAD', 'La foto debe ser JPEG o PNG.', undefined, correlationId)
    }
    if (foto.size > TAMANO_MAXIMO_BYTES) {
      return errorResponse(400, 'INVALID_PAYLOAD', 'La foto supera el tamaño máximo (5 MB).', undefined, correlationId)
    }
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
    cliente, `visitas_crear_vinculo:${vinculo.vinculo_id}`, RATE_LIMIT_MAX_HITS, RATE_LIMIT_VENTANA, correlationId,
  )
  if (bloqueo) return bloqueo

  let qrExpiraAt: Date
  if (permanente) {
    qrExpiraAt = new Date(Date.now() + VENTANA_DIAS_PERMANENTE * 24 * 3600 * 1000)
  } else {
    const finVentanaBase = new Date(`${fechaPrevista}T${horaHasta ?? horaDesde ?? '23:59:59'}`)
    if (Number.isNaN(finVentanaBase.getTime())) {
      return errorResponse(400, 'INVALID_PAYLOAD', 'fecha_prevista/hora_hasta inválidas.', undefined, correlationId)
    }
    qrExpiraAt = new Date(finVentanaBase.getTime() + VENTANA_HORAS_PUNTUAL * 3600 * 1000)
  }

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
      permanente,
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

  let fotoUrl: string | null = null
  if (foto instanceof File) {
    const ruta = `${vinculo.tenant_id}/${fila.id}/${sanearNombreArchivo(foto.name)}`
    const { error: errorSubida } = await admin.storage.from('visitas-fotos').upload(ruta, foto, {
      contentType: foto.type,
      upsert: false,
    })
    if (errorSubida) {
      logEvent({
        level: 'error', action: 'external_visitas_crear.foto_fallida', correlationId,
        message: errorSubida.message, meta: { autorizacionId: fila.id },
      })
    } else {
      fotoUrl = ruta
    }
  }

  const { data: filaFinal, error: errorUpdate } = await admin
    .from('mant_autorizaciones_visita')
    .update({ qr_token: qrToken, ...(fotoUrl ? { foto_url: fotoUrl } : {}) })
    .eq('id', fila.id)
    .select('*')
    .single()
  if (errorUpdate) {
    return errorResponse(500, 'INTERNAL_ERROR', errorUpdate.message, undefined, correlationId)
  }

  return jsonResponse(filaFinal, 201, correlationId)
})
