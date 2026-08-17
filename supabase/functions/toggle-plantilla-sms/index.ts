// Plantillas SMS §5 (toggle) — acción independiente de guardar el texto
// (spec del módulo §10: "son dos acciones distintas"). Rechaza eventos sin
// interruptor asignado (fuera de SMS_ACTIVE_EVENT_TYPES) antes de tocar la
// base de datos.
import { withSupabase } from '@supabase/server'
import { z } from 'zod'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { SMS_ACTIVE_EVENT_TYPES } from '../../../packages/shared/src/sms.ts'
import { errorResponse, jsonResponse, parsearErrorRpc } from '../_shared/http.ts'
import { logEvent } from '../_shared/logger.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 60
const RATE_LIMIT_VENTANA = '1 hour'

const payloadSchema = z.object({
  tenant_id: z.string().uuid(),
  event_type: z.string().trim().min(1),
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
    const { tenant_id: tenantId, event_type: eventType, activo } = parseo.data

    const bloqueo = await enforceRateLimit(
      ctx.supabase,
      `toggle_plantilla_sms:${actorId}`,
      RATE_LIMIT_MAX_HITS,
      RATE_LIMIT_VENTANA,
      correlationId,
    )
    if (bloqueo) return bloqueo

    if (!SMS_ACTIVE_EVENT_TYPES.includes(eventType)) {
      return errorResponse(
        400,
        'SMS_EVENT_NOT_ACTIVE',
        `El evento ${eventType} no tiene interruptor asignado.`,
        undefined,
        correlationId,
      )
    }

    const { data: plantilla, error: errorRpc } = await ctx.supabase.rpc('fn_toggle_plantilla_sms', {
      p_tenant_id: tenantId,
      p_event_type: eventType,
      p_activo: activo,
    })

    if (errorRpc) {
      const { code, message } = parsearErrorRpc(errorRpc.message)
      logEvent({
        level: 'warn',
        action: 'toggle_plantilla_sms.rpc_error',
        correlationId,
        actorId,
        tenantId,
        meta: { code, eventType },
      })
      const status =
        code === 'FORBIDDEN' ? 403 : code === 'UNAUTHENTICATED' ? 401 : code === 'SMS_TEMPLATE_NOT_FOUND' ? 404 : 400
      return errorResponse(status, code, message, undefined, correlationId)
    }

    logEvent({
      level: 'info',
      action: 'toggle_plantilla_sms.completada',
      correlationId,
      actorId,
      tenantId,
      meta: { eventType, activo },
    })

    return jsonResponse(plantilla, 200, correlationId)
  }),
}
