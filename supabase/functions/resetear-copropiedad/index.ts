// Zona de peligro (D-39) — resetea una copropiedad a su estado recién
// creada: borra los datos operativos, conserva toda la configuración y los
// usuarios. Mismo patrón que toggle-compositor-correo: SECURITY DEFINER RPC
// (fn_resetear_copropiedad) decide la autorización (has_role administrador)
// y registra audit_log — esta capa solo valida el contrato y traduce errores.
import { withSupabase } from '@supabase/server'
import { z } from 'zod'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse, parsearErrorRpc } from '../_shared/http.ts'
import { logEvent } from '../_shared/logger.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 5
const RATE_LIMIT_VENTANA = '1 hour'

const payloadSchema = z.object({
  tenant_id: z.string().uuid(),
})

export default {
  fetch: withSupabase<Database>({ auth: 'user' }, async (req, ctx) => {
    const correlationId = crypto.randomUUID()
    const actorId = ctx.userClaims?.id ?? null

    if (req.method !== 'POST') {
      return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Solo POST.', undefined, correlationId)
    }

    let payload: unknown
    try {
      payload = await req.json()
    } catch {
      return errorResponse(
        400,
        'INVALID_PAYLOAD',
        'El cuerpo debe ser JSON válido.',
        undefined,
        correlationId,
      )
    }

    const parseo = payloadSchema.safeParse(payload)
    if (!parseo.success) {
      return errorResponse(
        400,
        'INVALID_PAYLOAD',
        parseo.error.issues[0]?.message ?? 'Payload inválido.',
        { issues: parseo.error.issues },
        correlationId,
      )
    }
    const { tenant_id: tenantId } = parseo.data

    const bloqueo = await enforceRateLimit(
      ctx.supabase,
      `resetear_copropiedad:${actorId}`,
      RATE_LIMIT_MAX_HITS,
      RATE_LIMIT_VENTANA,
      correlationId,
    )
    if (bloqueo) return bloqueo

    const { data, error: errorRpc } = await ctx.supabase.rpc('fn_resetear_copropiedad', {
      p_tenant_id: tenantId,
    })

    if (errorRpc) {
      const { code, message } = parsearErrorRpc(errorRpc.message)
      logEvent({
        level: 'warn',
        action: 'resetear_copropiedad.rpc_error',
        correlationId,
        actorId,
        tenantId,
        meta: { code },
      })
      const status = code === 'FORBIDDEN' ? 403 : code === 'UNAUTHENTICATED' ? 401 : 400
      return errorResponse(status, code, message, undefined, correlationId)
    }

    logEvent({
      level: 'warn',
      action: 'resetear_copropiedad.completada',
      correlationId,
      actorId,
      tenantId,
    })

    return jsonResponse({ borrados: data }, 200, correlationId)
  }),
}
