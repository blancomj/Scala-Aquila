// Plantillas de correo §7 (guardar + sincronizar) — orden exacto del spec:
// guardar local → auditar → intentar sincronizar → marcar is_synced.
// fn_guardar_plantilla_email (SQL) hace los dos primeros pasos (mismo
// motivo que fn_guardar_plantilla_sms: audit_log no tiene política INSERT
// para authenticated). Los dos últimos SOLO pueden vivir aquí — sincronizar
// es una llamada HTTP real a Brevo, imposible desde SQL.
//
// Un fallo de sincronización NO es un error de la petición (spec §7.2):
// el contenido ya quedó guardado, se responde 200 con synced:false y el
// motivo real de Brevo — nunca un 500 que haga pensar que no se guardó nada.
import { withSupabase } from '@supabase/server'
import { z } from 'zod'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { EmailValidationError, validateEmailTemplateBody } from '../../../packages/shared/src/email.ts'
import { createEmailTemplate, updateEmailTemplate } from '../_shared/email_provider.ts'
import { errorResponse, jsonResponse, parsearErrorRpc } from '../_shared/http.ts'
import { logEvent } from '../_shared/logger.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 60
const RATE_LIMIT_VENTANA = '1 hour'

const payloadSchema = z.object({
  tenant_id: z.string().uuid(),
  event_type: z.string().trim().min(1),
  subject: z.string().trim().min(1),
  html_content: z.string(),
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
    const { tenant_id: tenantId, event_type: eventType, subject, html_content: htmlContent } = parseo.data

    const bloqueo = await enforceRateLimit(
      ctx.supabase,
      `guardar_plantilla_email:${actorId}`,
      RATE_LIMIT_MAX_HITS,
      RATE_LIMIT_VENTANA,
      correlationId,
    )
    if (bloqueo) return bloqueo

    try {
      validateEmailTemplateBody(eventType, subject, htmlContent)
    } catch (e) {
      if (e instanceof EmailValidationError) {
        return errorResponse(400, e.code, e.message, undefined, correlationId)
      }
      throw e
    }

    const { data: plantilla, error: errorRpc } = await ctx.supabase.rpc('fn_guardar_plantilla_email', {
      p_tenant_id: tenantId,
      p_event_type: eventType,
      p_subject: subject,
      p_html_content: htmlContent,
    })

    if (errorRpc) {
      const { code, message } = parsearErrorRpc(errorRpc.message)
      logEvent({
        level: 'warn',
        action: 'guardar_plantilla_email.rpc_error',
        correlationId,
        actorId,
        tenantId,
        meta: { code, eventType },
      })
      const status = code === 'FORBIDDEN' ? 403 : code === 'UNAUTHENTICATED' ? 401 : 400
      return errorResponse(status, code, message, undefined, correlationId)
    }

    const contenido = { subject, htmlContent }
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
        action: 'guardar_plantilla_email.completada',
        correlationId,
        actorId,
        tenantId,
        meta: { eventType, synced: true },
      })
      return jsonResponse({ saved: true, synced: true, template: actualizada }, 200, correlationId)
    }

    logEvent({
      level: 'warn',
      action: 'guardar_plantilla_email.sync_fallida',
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
