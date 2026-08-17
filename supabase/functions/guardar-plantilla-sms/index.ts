// Plantillas SMS §5 (guardar) — valida el cuerpo contra el registro de
// campos (fuente única en packages/shared/src/sms.ts, importado directo —
// mismo patrón que database.generated.ts) y delega el upsert + auditoría
// a fn_guardar_plantilla_sms (SECURITY DEFINER: audit_log no tiene policy
// de INSERT para authenticated, ver la migración de plantillas_sms).
import { withSupabase } from '@supabase/server'
import { z } from 'zod'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { SmsValidationError, validateSmsTemplateBody } from '../../../packages/shared/src/sms.ts'
import { errorResponse, jsonResponse, parsearErrorRpc } from '../_shared/http.ts'
import { logEvent } from '../_shared/logger.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 60
const RATE_LIMIT_VENTANA = '1 hour'

const payloadSchema = z.object({
  tenant_id: z.string().uuid(),
  event_type: z.string().trim().min(1),
  cuerpo: z.string(),
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
    const { tenant_id: tenantId, event_type: eventType, cuerpo } = parseo.data

    const bloqueo = await enforceRateLimit(
      ctx.supabase,
      `guardar_plantilla_sms:${actorId}`,
      RATE_LIMIT_MAX_HITS,
      RATE_LIMIT_VENTANA,
      correlationId,
    )
    if (bloqueo) return bloqueo

    try {
      validateSmsTemplateBody(eventType, cuerpo)
    } catch (e) {
      if (e instanceof SmsValidationError) {
        return errorResponse(400, e.code, e.message, undefined, correlationId)
      }
      throw e
    }

    const { data: plantilla, error: errorRpc } = await ctx.supabase.rpc('fn_guardar_plantilla_sms', {
      p_tenant_id: tenantId,
      p_event_type: eventType,
      p_cuerpo: cuerpo,
    })

    if (errorRpc) {
      const { code, message } = parsearErrorRpc(errorRpc.message)
      logEvent({
        level: 'warn',
        action: 'guardar_plantilla_sms.rpc_error',
        correlationId,
        actorId,
        tenantId,
        meta: { code, eventType },
      })
      const status = code === 'FORBIDDEN' ? 403 : code === 'UNAUTHENTICATED' ? 401 : 400
      return errorResponse(status, code, message, undefined, correlationId)
    }

    logEvent({
      level: 'info',
      action: 'guardar_plantilla_sms.completada',
      correlationId,
      actorId,
      tenantId,
      meta: { eventType },
    })

    return jsonResponse(plantilla, 200, correlationId)
  }),
}
