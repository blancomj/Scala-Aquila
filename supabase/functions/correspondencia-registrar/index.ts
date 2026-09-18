// EXT-12 §7.7/§8.4 (Ola 2, M17) — lado staff de correspondencia: registrar que llegó un envío, y
// marcar que ya fue entregado. Una sola Edge Function con `accion` (mismo criterio minimalista
// que external-contactos-emergencia) — el doc de diseño dejó explícito que podía ser "el mismo
// Edge Function o uno de actualización" (§8.4 paso 3); se elige el mismo, por consistencia con
// el resto de esta ola.
//
// `correspondencia` no tiene política de INSERT/UPDATE para `authenticated` (ni para staff) —
// todo pasa por aquí con service_role, mismo criterio que subir-documento/mant_autorizaciones_visita.
// has_role() lee auth.uid() por dentro — llamarla desde el cliente service_role (sin JWT de
// usuario) siempre daría false, así que se replica su condición con una consulta directa a
// memberships (mismo patrón que crear-intencion-pago para su vía 'sesion').
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse, respuestaPreflight } from '../_shared/http.ts'

interface Cuerpo {
  accion?: unknown
  inmueble_id?: unknown
  destino?: unknown
  remitente?: unknown
  tipo_id?: unknown
  descripcion?: unknown
  correspondencia_id?: unknown
  entregada_a?: unknown
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
  const accion = cuerpo?.accion
  if (accion !== 'registrar' && accion !== 'marcar_entregada') {
    return errorResponse(400, 'INVALID_PAYLOAD', 'accion debe ser "registrar" o "marcar_entregada".', undefined, correlationId)
  }

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
  const { data: userData, error: errorUser } = await admin.auth.getUser(jwt)
  const userId = userData?.user?.id
  if (errorUser || !userId) {
    return errorResponse(401, 'UNAUTHENTICATED', 'Sesión inválida.', undefined, correlationId)
  }

  async function esAgenteDeTenant(tenantId: string): Promise<boolean> {
    const { data: membership } = await admin
      .from('memberships')
      .select('role')
      .eq('user_id', userId!)
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .maybeSingle()
    return membership?.role === 'auxiliar' || membership?.role === 'administrador'
  }

  if (accion === 'registrar') {
    const inmuebleId = cuerpo?.inmueble_id
    const destino = typeof cuerpo?.destino === 'string' ? cuerpo.destino.trim() : ''
    const remitente = typeof cuerpo?.remitente === 'string' ? cuerpo.remitente.trim() : ''
    if (typeof inmuebleId !== 'string' || !inmuebleId || !destino || !remitente) {
      return errorResponse(
        400, 'INVALID_PAYLOAD',
        'inmueble_id, destino y remitente son requeridos.', undefined, correlationId,
      )
    }
    const tipoIdRaw = cuerpo?.tipo_id
    const tipoId = typeof tipoIdRaw === 'number' ? tipoIdRaw : null
    const descripcionRaw = cuerpo?.descripcion
    const descripcion = typeof descripcionRaw === 'string' && descripcionRaw.trim().length > 0 ? descripcionRaw.trim() : null

    const { data: inmueble, error: errorInmueble } = await admin
      .from('inmuebles')
      .select('id, tenant_id')
      .eq('id', inmuebleId)
      .maybeSingle()
    if (errorInmueble) {
      return errorResponse(500, 'INTERNAL_ERROR', errorInmueble.message, undefined, correlationId)
    }
    if (!inmueble) {
      return errorResponse(404, 'INMUEBLE_NO_ENCONTRADO', 'El inmueble no existe.', undefined, correlationId)
    }
    if (!(await esAgenteDeTenant(inmueble.tenant_id))) {
      return errorResponse(403, 'FORBIDDEN', 'Solo un auxiliar o administrador puede registrar correspondencia.', undefined, correlationId)
    }

    const { data, error } = await admin
      .from('correspondencia')
      .insert({
        tenant_id: inmueble.tenant_id,
        inmueble_id: inmueble.id,
        tipo_id: tipoId,
        destino,
        remitente,
        descripcion,
        registrado_por: userId,
      })
      .select('*')
      .single()
    if (error) {
      return errorResponse(500, 'INTERNAL_ERROR', error.message, undefined, correlationId)
    }
    return jsonResponse(data, 201, correlationId)
  }

  // accion === 'marcar_entregada'
  const correspondenciaId = cuerpo?.correspondencia_id
  const entregadaA = typeof cuerpo?.entregada_a === 'string' ? cuerpo.entregada_a.trim() : ''
  if (typeof correspondenciaId !== 'string' || !correspondenciaId || !entregadaA) {
    return errorResponse(400, 'INVALID_PAYLOAD', 'correspondencia_id y entregada_a son requeridos.', undefined, correlationId)
  }

  const { data: existente, error: errorExistente } = await admin
    .from('correspondencia')
    .select('id, tenant_id, entregada')
    .eq('id', correspondenciaId)
    .maybeSingle()
  if (errorExistente) {
    return errorResponse(500, 'INTERNAL_ERROR', errorExistente.message, undefined, correlationId)
  }
  if (!existente) {
    return errorResponse(404, 'CORRESPONDENCIA_NO_ENCONTRADA', 'Este registro no existe.', undefined, correlationId)
  }
  if (!(await esAgenteDeTenant(existente.tenant_id))) {
    return errorResponse(403, 'FORBIDDEN', 'Solo un auxiliar o administrador puede marcar una entrega.', undefined, correlationId)
  }
  if (existente.entregada) {
    return errorResponse(409, 'CORRESPONDENCIA_YA_ENTREGADA', 'Este registro ya fue marcado como entregado.', undefined, correlationId)
  }

  const { data, error } = await admin
    .from('correspondencia')
    .update({ entregada: true, entregada_a: entregadaA, entregada_at: new Date().toISOString() })
    .eq('id', correspondenciaId)
    .select('*')
    .single()
  if (error) {
    return errorResponse(500, 'INTERNAL_ERROR', error.message, undefined, correlationId)
  }
  return jsonResponse(data, 200, correlationId)
})
