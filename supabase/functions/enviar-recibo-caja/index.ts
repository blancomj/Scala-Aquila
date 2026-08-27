// Gatillo MANUAL: el administrador/auxiliar envía por correo el recibo de
// caja al propietario desde /recaudo o la ficha del inmueble — RC-4, clon de
// enviar-estado-cuenta (D-28).
//
// Rol exigido: auxiliar o administrador (has_role, administrador ⊇
// auxiliar). Idempotencia: si el documento ya fue notificado hace <12h
// responde 409 RECIBO_CAJA_YA_NOTIFICADO; reenviar:true lo fuerza.
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse, parsearErrorRpc, respuestaPreflight } from '../_shared/http.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'
import { comoAdminRecibo, enviarReciboCajaPorId } from '../_shared/envio_recibo_caja.ts'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default {
  fetch: async (req: Request): Promise<Response> => {
    const preflight = respuestaPreflight(req)
    if (preflight) return preflight

    const correlationId = crypto.randomUUID()

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) {
      return errorResponse(500, 'INTERNAL_ERROR', 'Configuración incompleta.', undefined, correlationId)
    }
    // verify_jwt=false a propósito (config.toml) — mismo motivo que
    // enviar-estado-cuenta: con verify_jwt=true el preflight OPTIONS (que
    // nunca lleva Authorization) lo intercepta el gateway con un 401 propio
    // antes de llegar aquí, rompiendo CORS desde cualquier navegador.
    const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    if (!jwt) {
      return errorResponse(401, 'UNAUTHENTICATED', 'Sesión requerida.', undefined, correlationId)
    }
    const admin = createClient<Database>(supabaseUrl, serviceKey)
    const { data: userData, error: errorUser } = await admin.auth.getUser(jwt)
    const actorId = userData?.user?.id ?? null
    if (errorUser || !actorId) {
      return errorResponse(401, 'UNAUTHENTICATED', 'Sesión inválida.', undefined, correlationId)
    }

    if (req.method !== 'POST') {
      return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Solo POST.', undefined, correlationId)
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return errorResponse(400, 'INVALID_PAYLOAD', 'El cuerpo debe ser JSON.', undefined, correlationId)
    }
    const cuerpo = body as { recibo_caja_id?: unknown; reenviar?: unknown } | null
    const id = cuerpo?.recibo_caja_id
    if (typeof id !== 'string' || !UUID_RE.test(id)) {
      return errorResponse(
        400,
        'INVALID_PAYLOAD',
        'recibo_caja_id debe ser un uuid válido.',
        undefined,
        correlationId,
      )
    }
    if (cuerpo?.reenviar !== undefined && typeof cuerpo.reenviar !== 'boolean') {
      return errorResponse(400, 'INVALID_PAYLOAD', 'reenviar debe ser booleano.', undefined, correlationId)
    }

    const bloqueo = await enforceRateLimit(admin, `enviar_recibo:${actorId}`, 20, '1 hour', correlationId)
    if (bloqueo) return bloqueo

    const { data: fila } = await admin
      .from('recibos_caja')
      .select('tenant_id')
      .eq('id', id)
      .maybeSingle()
    if (!fila) {
      return errorResponse(
        404,
        'RECIBO_CAJA_NO_ENCONTRADO',
        'No existe ese recibo de caja.',
        undefined,
        correlationId,
      )
    }
    const { data: membership } = await admin
      .from('memberships')
      .select('id')
      .eq('user_id', actorId)
      .eq('tenant_id', fila.tenant_id)
      .eq('status', 'active')
      .in('role', ['auxiliar', 'administrador'])
      .maybeSingle()
    if (!membership) {
      return errorResponse(
        403,
        'FORBIDDEN',
        'Solo un auxiliar o administrador de esta copropiedad puede enviar el recibo de caja.',
        undefined,
        correlationId,
      )
    }

    try {
      const resultado = await enviarReciboCajaPorId(comoAdminRecibo(admin), id, {
        reenviar: cuerpo?.reenviar === true,
        actorId,
      })
      return jsonResponse(resultado, 200, correlationId)
    } catch (excepcion) {
      const { code, message } = parsearErrorRpc(
        excepcion instanceof Error ? excepcion.message : 'INTERNAL_ERROR',
      )
      const status =
        code === 'RECIBO_CAJA_YA_NOTIFICADO'
          ? 409
          : code === 'RECIBO_CAJA_NO_ENCONTRADO'
            ? 404
            : code === 'CONFIG_INCOMPLETA'
              ? 500
              : 502
      return errorResponse(status, code, message, undefined, correlationId)
    }
  },
}
