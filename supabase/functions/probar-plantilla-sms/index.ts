// Plantillas SMS §7.5 (envío de prueba) — envía el texto tal como está en
// el editor, sin guardarlo, al número indicado, renderizado con los
// valores de ejemplo del registro. No respeta el interruptor maestro ni el
// del evento (quien redacta un evento apagado necesita verlo antes de
// encenderlo), no exige teléfono verificado (número del propio admin,
// escrito a mano), no queda en ninguna tabla de resultados de envío, no
// pasa por cola/outbox (la respuesta es inmediata) y valida el texto igual
// que guardar-plantilla-sms (misma función compartida).
import { withSupabase } from '@supabase/server'
import { z } from 'zod'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import {
  esTelefonoValido,
  renderSmsTemplate,
  SMS_FIELD_REGISTRY,
  SmsValidationError,
  validateSmsTemplateBody,
} from '../../../packages/shared/src/sms.ts'
import { errorResponse, jsonResponse } from '../_shared/http.ts'
import { logEvent } from '../_shared/logger.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'
import { sendSms } from '../_shared/sms_provider.ts'

// Es dinero real gastado por cada llamada (spec §11) — límite más bajo que
// el resto de Edge Functions del proyecto.
const RATE_LIMIT_MAX_HITS = 10
const RATE_LIMIT_VENTANA = '1 hour'

const payloadSchema = z.object({
  tenant_id: z.string().uuid(),
  event_type: z.string().trim().min(1),
  cuerpo: z.string(),
  phone: z.string(),
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
    const { tenant_id: tenantId, event_type: eventType, cuerpo, phone } = parseo.data

    // Antes de cualquier efecto secundario — un request bloqueado no llega al proveedor.
    const bloqueo = await enforceRateLimit(
      ctx.supabase,
      `probar_plantilla_sms:${actorId}`,
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

    if (!esTelefonoValido(phone)) {
      return errorResponse(
        400,
        'SMS_INVALID_PHONE',
        'Número inválido — usa formato internacional con indicativo, ej. +573001234567 (no 3001234567)',
        undefined,
        correlationId,
      )
    }

    // Solo verifica membresía — no se requiere rol agent para ver el resultado
    // de una prueba, pero sí pertenecer al tenant (RLS de is_member vía RPC).
    const { data: esMiembro, error: errorMiembro } = await ctx.supabase.rpc('is_member', {
      p_tenant: tenantId,
    })
    if (errorMiembro) {
      return errorResponse(500, 'INTERNAL_ERROR', errorMiembro.message, undefined, correlationId)
    }
    if (!esMiembro) {
      return errorResponse(403, 'FORBIDDEN', 'No perteneces a esta copropiedad.', undefined, correlationId)
    }

    const sample = Object.fromEntries(
      (SMS_FIELD_REGISTRY[eventType] ?? []).map((f) => [f.field, f.sample]),
    )
    const textoRenderizado = renderSmsTemplate(cuerpo, sample)

    const resultado = await sendSms({
      to: phone,
      body: textoRenderizado,
      reference: `test-${eventType}-${Date.now()}`,
    })

    logEvent({
      level: resultado.success ? 'info' : 'error',
      action: 'probar_plantilla_sms.completada',
      correlationId,
      actorId,
      tenantId,
      meta: { eventType, success: resultado.success, segmentsUsed: resultado.segmentsUsed },
    })

    return jsonResponse(
      {
        success: resultado.success,
        segmentsUsed: resultado.segmentsUsed,
        errorMessage: resultado.errorMessage,
      },
      200,
      correlationId,
    )
  }),
}
