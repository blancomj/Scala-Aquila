// Gatillo MANUAL: el administrador envía por correo el estado de cuenta al
// propietario desde /estado-cuenta — D-28 (Docs/evaluacion/13 §G).
//
// Rol exigido: auxiliar (mismo rol que registra pagos y sube documentos; el
// auditor es solo lectura y no dispara comunicaciones). El enlace devuelto
// lleva token HMAC firmado (D-27) — se retorna también en la respuesta para
// que el administrador pueda copiarlo y compartirlo manualmente (WhatsApp),
// caso de uso real hoy.
//
// Idempotencia: si el documento ya fue notificado hace <12h responde 409
// ESTADO_CUENTA_YA_NOTIFICADO; reenviar:true lo fuerza (audita igual).
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse, parsearErrorRpc } from '../_shared/http.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'
import { enviarEstadoCuentaPorId, comoAdmin } from '../_shared/envio_estado_cuenta.ts'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default {
  fetch: async (req: Request): Promise<Response> => {
    const correlationId = crypto.randomUUID()

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) {
      return errorResponse(500, 'INTERNAL_ERROR', 'Configuración incompleta.', undefined, correlationId)
    }
    // Sesión obligatoria (verify_jwt=true en config.toml además).
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
    const cuerpo = body as { estado_cuenta_id?: unknown; reenviar?: unknown } | null
    const id = cuerpo?.estado_cuenta_id
    if (typeof id !== 'string' || !UUID_RE.test(id)) {
      return errorResponse(
        400,
        'INVALID_PAYLOAD',
        'estado_cuenta_id debe ser un uuid válido.',
        undefined,
        correlationId,
      )
    }
    if (cuerpo?.reenviar !== undefined && typeof cuerpo.reenviar !== 'boolean') {
      return errorResponse(400, 'INVALID_PAYLOAD', 'reenviar debe ser booleano.', undefined, correlationId)
    }

    // Rate limit por actor antes de efectos secundarios (patrón E7 §15.1).
    const bloqueo = await enforceRateLimit(admin, `enviar_edc:${actorId}`, 20, '1 hour', correlationId)
    if (bloqueo) return bloqueo

    // Rol: auxiliar activo del tenant del documento (el auditor no notifica).
    const { data: fila } = await admin
      .from('estados_cuenta_generados')
      .select('tenant_id')
      .eq('id', id)
      .maybeSingle()
    if (!fila) {
      return errorResponse(
        404,
        'ESTADO_CUENTA_NO_ENCONTRADO',
        'No existe ese estado de cuenta.',
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
      .eq('role', 'auxiliar')
      .maybeSingle()
    if (!membership) {
      return errorResponse(
        403,
        'FORBIDDEN',
        'Solo un auxiliar de esta copropiedad puede enviar el estado de cuenta.',
        undefined,
        correlationId,
      )
    }

    try {
      const resultado = await enviarEstadoCuentaPorId(comoAdmin(admin), id, {
        reenviar: cuerpo?.reenviar === true,
        actorId,
      })
      return jsonResponse(resultado, 200, correlationId)
    } catch (excepcion) {
      const { code, message } = parsearErrorRpc(
        excepcion instanceof Error ? excepcion.message : 'INTERNAL_ERROR',
      )
      const status =
        code === 'ESTADO_CUENTA_YA_NOTIFICADO'
          ? 409
          : code === 'ESTADO_CUENTA_NO_ENCONTRADO'
            ? 404
            : code === 'CONFIG_INCOMPLETA'
              ? 500
              : 502
      return errorResponse(status, code, message, undefined, correlationId)
    }
  },
}
