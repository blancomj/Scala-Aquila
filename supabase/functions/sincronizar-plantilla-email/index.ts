// Plantillas de correo §7.4 (reintento) — recupera el desfase is_synced=false
// sin volver a editar: reintenta con el contenido YA guardado en la fila,
// mismo syncToProvider que guardar-plantilla-email, ninguna ruta de código
// aparte (spec §7, punto 4).
import { withSupabase } from '@supabase/server'
import { z } from 'zod'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { createEmailTemplate, updateEmailTemplate } from '../_shared/email_provider.ts'
import { errorResponse, jsonResponse } from '../_shared/http.ts'
import { logEvent } from '../_shared/logger.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 60
const RATE_LIMIT_VENTANA = '1 hour'

const payloadSchema = z.object({
  tenant_id: z.string().uuid(),
  event_type: z.string().trim().min(1),
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
    const { tenant_id: tenantId, event_type: eventType } = parseo.data

    const bloqueo = await enforceRateLimit(
      ctx.supabase,
      `sincronizar_plantilla_email:${actorId}`,
      RATE_LIMIT_MAX_HITS,
      RATE_LIMIT_VENTANA,
      correlationId,
    )
    if (bloqueo) return bloqueo

    const { data: tieneRol, error: errorRol } = await ctx.supabase.rpc('has_role', {
      p_tenant: tenantId,
      p_roles: ['agent'],
    })
    if (errorRol) {
      return errorResponse(500, 'INTERNAL_ERROR', errorRol.message, undefined, correlationId)
    }
    if (!tieneRol) {
      return errorResponse(403, 'FORBIDDEN', 'Se requiere rol agent en esta copropiedad.', undefined, correlationId)
    }

    const { data: plantilla, error: errorPlantilla } = await ctx.supabase
      .from('email_templates')
      .select('id, subject, html_content, brevo_template_id')
      .eq('tenant_id', tenantId)
      .eq('event_type', eventType)
      .maybeSingle()
    if (errorPlantilla) {
      return errorResponse(500, 'INTERNAL_ERROR', errorPlantilla.message, undefined, correlationId)
    }
    if (!plantilla) {
      return errorResponse(
        404,
        'EMAIL_TEMPLATE_NOT_FOUND',
        `No hay una plantilla guardada para el evento '${eventType}' en este tenant.`,
        undefined,
        correlationId,
      )
    }

    const contenido = { subject: plantilla.subject, htmlContent: plantilla.html_content }
    const resultadoSync =
      plantilla.brevo_template_id === null
        ? await createEmailTemplate(`AQUILA - ${eventType} - ${tenantId}`, contenido)
        : await updateEmailTemplate(plantilla.brevo_template_id, contenido)

    if (resultadoSync.success) {
      const { data: actualizada, error: errorUpdate } = await ctx.supabase
        .from('email_templates')
        .update({
          brevo_template_id: resultadoSync.templateId,
          is_synced: true,
          last_synced_at: new Date().toISOString(),
        })
        .eq('id', plantilla.id)
        .select()
        .single()
      if (errorUpdate) {
        return errorResponse(500, 'INTERNAL_ERROR', errorUpdate.message, undefined, correlationId)
      }
      logEvent({
        level: 'info',
        action: 'sincronizar_plantilla_email.completada',
        correlationId,
        actorId,
        tenantId,
        meta: { eventType, synced: true },
      })
      return jsonResponse({ saved: true, synced: true, template: actualizada }, 200, correlationId)
    }

    logEvent({
      level: 'warn',
      action: 'sincronizar_plantilla_email.sync_fallida',
      correlationId,
      actorId,
      tenantId,
      meta: { eventType, error: resultadoSync.errorMessage },
    })
    return jsonResponse(
      { saved: true, synced: false, error: resultadoSync.errorMessage, template: plantilla },
      200,
      correlationId,
    )
  }),
}
