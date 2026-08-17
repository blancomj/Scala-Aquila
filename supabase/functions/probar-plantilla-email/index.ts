// Plantillas de correo §8 (vista previa) — se renderiza localmente, SIN
// llamada de red: Brevo no expone ningún endpoint de previsualización.
// overrides se filtra contra el registro (nunca renderiza un campo no
// declarado) — mismo criterio que probar-plantilla-sms.
import { withSupabase } from '@supabase/server'
import { z } from 'zod'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import {
  EMAIL_FIELD_REGISTRY,
  filtrarOverridesValidos,
  renderEmailTemplate,
} from '../../../packages/shared/src/email.ts'
import { errorResponse, jsonResponse } from '../_shared/http.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 120
const RATE_LIMIT_VENTANA = '1 hour'

const payloadSchema = z.object({
  tenant_id: z.string().uuid(),
  event_type: z.string().trim().min(1),
  subject: z.string(),
  html_content: z.string(),
  overrides: z.record(z.string(), z.string()).optional(),
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
      return errorResponse(400, 'INVALID_PAYLOAD', 'El cuerpo debe ser JSON válido.', undefined, correlationId)
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
    const { tenant_id: tenantId, event_type: eventType, subject, html_content: htmlContent, overrides } = parseo.data

    const bloqueo = await enforceRateLimit(
      ctx.supabase,
      `probar_plantilla_email:${actorId}`,
      RATE_LIMIT_MAX_HITS,
      RATE_LIMIT_VENTANA,
      correlationId,
    )
    if (bloqueo) return bloqueo

    const campos = EMAIL_FIELD_REGISTRY[eventType]
    if (!campos) {
      return errorResponse(400, 'EMAIL_UNKNOWN_EVENT', `Evento desconocido: ${eventType}`, undefined, correlationId)
    }

    // Solo verifica membresía — mismo criterio que probar-plantilla-sms: ver
    // una vista previa no exige rol agent, pero sí pertenecer al tenant.
    const { data: esMiembro, error: errorMiembro } = await ctx.supabase.rpc('is_member', {
      p_tenant: tenantId,
    })
    if (errorMiembro) {
      return errorResponse(500, 'INTERNAL_ERROR', errorMiembro.message, undefined, correlationId)
    }
    if (!esMiembro) {
      return errorResponse(403, 'FORBIDDEN', 'No perteneces a esta copropiedad.', undefined, correlationId)
    }

    const sample = Object.fromEntries(campos.map((f) => [f.field, f.sample]))
    const overridesValidos = overrides ? filtrarOverridesValidos(eventType, overrides) : {}
    const params = { ...sample, ...overridesValidos }

    return jsonResponse(
      {
        subject: renderEmailTemplate(subject, params),
        html: renderEmailTemplate(htmlContent, params),
      },
      200,
      correlationId,
    )
  }),
}
