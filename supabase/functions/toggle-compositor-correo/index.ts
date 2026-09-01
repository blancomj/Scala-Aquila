// Compositor de correo — toggle de feature a nivel de tenant.
// Mismo patrón que toggle-plantilla-sms: SECURITY DEFINER RPC + audit_log.
import { withSupabase } from '@supabase/server'
import { z } from 'zod'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse, parsearErrorRpc } from '../_shared/http.ts'
import { logEvent } from '../_shared/logger.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 30
const RATE_LIMIT_VENTANA = '1 hour'

const payloadSchema = z.object({
  tenant_id: z.string().uuid(),
  activo: z.boolean(),
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
    const { tenant_id: tenantId, activo } = parseo.data

    const bloqueo = await enforceRateLimit(
      ctx.supabase,
      `toggle_compositor_correo:${actorId}`,
      RATE_LIMIT_MAX_HITS,
      RATE_LIMIT_VENTANA,
      correlationId,
    )
    if (bloqueo) return bloqueo

    const { error: errorRpc } = await ctx.supabase.rpc('fn_toggle_compositor_correo', {
      p_tenant_id: tenantId,
      p_activo: activo,
    })

    if (errorRpc) {
      const { code, message } = parsearErrorRpc(errorRpc.message)
      logEvent({
        level: 'warn',
        action: 'toggle_compositor_correo.rpc_error',
        correlationId,
        actorId,
        tenantId,
        meta: { code },
      })
      const status =
        code === 'FORBIDDEN' ? 403 : code === 'UNAUTHENTICATED' ? 401 : 400
      return errorResponse(status, code, message, undefined, correlationId)
    }

    logEvent({
      level: 'info',
      action: 'toggle_compositor_correo.completada',
      correlationId,
      actorId,
      tenantId,
      meta: { activo },
    })

    return jsonResponse({ ok: true }, 200, correlationId)
  }),
}
