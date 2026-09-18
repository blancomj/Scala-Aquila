// EXT-14 §7.9 (Ola 2, M19) — contactos de emergencia de un inmueble, gestionados por cualquier
// actor externo vinculado a ESE inmueble (no solo por quien los creó — decisión de §4.1:
// "cualquier residente del mismo inmueble ve/gestiona los mismos contactos").
//
// Una sola Edge Function con un discriminador `accion` (mismo espíritu minimalista que
// external-solicitudes-listar) — el dominio es chico (3 verbos CRUD sencillos) y no justifica
// tres archivos separados como sí lo justifican crear/revocar/listar de visitas (cada uno con
// reglas de negocio propias más grandes).
//
// `contactos_emergencia` no tiene NINGUNA política RLS de escritura (ni siquiera para staff) —
// todo pasa por aquí con service_role, mismo criterio que mant_autorizaciones_visita.
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

interface Cuerpo {
  vinculo_id?: unknown
  accion?: unknown
  nombre?: unknown
  telefono?: unknown
  parentesco?: unknown
  contacto_id?: unknown
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
  if (accion !== 'listar' && accion !== 'crear' && accion !== 'eliminar') {
    return errorResponse(400, 'INVALID_PAYLOAD', 'accion debe ser "listar", "crear" o "eliminar".', undefined, correlationId)
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
    `contactos_emergencia:${contexto.vinculoId}`,
    RATE_LIMIT_MAX_HITS,
    RATE_LIMIT_VENTANA,
    correlationId,
  )
  if (bloqueo) return bloqueo

  if (accion === 'listar') {
    const { data, error } = await admin
      .from('contactos_emergencia')
      .select('id, nombre, telefono, parentesco, created_at')
      .eq('tenant_id', contexto.tenantId)
      .eq('inmueble_id', contexto.inmuebleId)
      .order('created_at', { ascending: true })
    if (error) {
      return errorResponse(500, 'INTERNAL_ERROR', error.message, undefined, correlationId)
    }
    return jsonResponse({ contactos: data ?? [] }, 200, correlationId)
  }

  if (accion === 'crear') {
    const nombre = typeof cuerpo?.nombre === 'string' ? cuerpo.nombre.trim() : ''
    const telefono = typeof cuerpo?.telefono === 'string' ? cuerpo.telefono.trim() : ''
    const parentescoRaw = cuerpo?.parentesco
    const parentesco = typeof parentescoRaw === 'string' && parentescoRaw.trim().length > 0 ? parentescoRaw.trim() : null
    if (!nombre || !telefono) {
      return errorResponse(400, 'INVALID_PAYLOAD', 'nombre y telefono son requeridos.', undefined, correlationId)
    }
    const { data, error } = await admin
      .from('contactos_emergencia')
      .insert({
        tenant_id: contexto.tenantId,
        inmueble_id: contexto.inmuebleId,
        nombre,
        telefono,
        parentesco,
        creado_por_vinculo_id: contexto.vinculoId,
      })
      .select('id, nombre, telefono, parentesco, created_at')
      .single()
    if (error) {
      return errorResponse(500, 'INTERNAL_ERROR', error.message, undefined, correlationId)
    }
    return jsonResponse(data, 201, correlationId)
  }

  // accion === 'eliminar'
  const contactoId = cuerpo?.contacto_id
  if (typeof contactoId !== 'string' || contactoId.length === 0) {
    return errorResponse(400, 'INVALID_PAYLOAD', 'contacto_id es requerido.', undefined, correlationId)
  }
  // Verifica que el contacto pertenece al MISMO inmueble_id del contexto — nunca solo al
  // creado_por_vinculo_id (§7.9: cualquier residente del inmueble puede gestionar todos).
  const { data: existente, error: errorExistente } = await admin
    .from('contactos_emergencia')
    .select('id, inmueble_id, tenant_id')
    .eq('id', contactoId)
    .maybeSingle()
  if (errorExistente) {
    return errorResponse(500, 'INTERNAL_ERROR', errorExistente.message, undefined, correlationId)
  }
  if (!existente || existente.tenant_id !== contexto.tenantId || existente.inmueble_id !== contexto.inmuebleId) {
    return errorResponse(404, 'CONTACTO_NO_ENCONTRADO', 'Este contacto no existe o no es de tu inmueble.', undefined, correlationId)
  }
  const { error: errorDelete } = await admin.from('contactos_emergencia').delete().eq('id', contactoId)
  if (errorDelete) {
    return errorResponse(500, 'INTERNAL_ERROR', errorDelete.message, undefined, correlationId)
  }
  return jsonResponse({ eliminado: true, id: contactoId }, 200, correlationId)
})
