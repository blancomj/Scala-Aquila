// E6 — reenviar una invitación pendiente: reutiliza la misma fila (mismo
// email/rol/tenant), regenera token_hash + expires_at (resend_invitation,
// 20260823130000_admin_actualizar_perfil_miembro.sql) y reenvía el correo.
//
// A diferencia de invite-user, si Brevo falla acá NO se hace rollback: la
// invitación ya era válida antes del intento (a diferencia de una fila
// recién insertada que conviene liberar) — el admin puede tocar "Reenviar"
// de nuevo, lo que regenera el token una vez más. Trade-off deliberado.
import { withSupabase } from '@supabase/server'
import { z } from 'zod'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { enviarEmailInvitacion } from '../_shared/email_invitation.ts'
import { errorResponse, jsonResponse, parsearErrorRpc } from '../_shared/http.ts'
import { logEvent } from '../_shared/logger.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'
import { generarToken, hashToken } from '../_shared/tokens.ts'

const EXPIRACION_HORAS = 48
const RATE_LIMIT_MAX_HITS = 20
const RATE_LIMIT_VENTANA = '1 hour'

const payloadSchema = z.object({
  invitation_id: z.string().uuid(),
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
        undefined,
        correlationId,
      )
    }

    const bloqueo = await enforceRateLimit(
      ctx.supabase,
      `resend_invitation:${actorId}`,
      RATE_LIMIT_MAX_HITS,
      RATE_LIMIT_VENTANA,
      correlationId,
    )
    if (bloqueo) return bloqueo

    const token = generarToken()
    const tokenHash = await hashToken(token)
    const expiresAt = new Date(Date.now() + EXPIRACION_HORAS * 60 * 60 * 1000).toISOString()

    const { data: invitation, error: errorReenviar } = await ctx.supabase.rpc(
      'resend_invitation',
      { p_invitation_id: parseo.data.invitation_id, p_token_hash: tokenHash, p_expires_at: expiresAt },
    )

    if (errorReenviar) {
      const { code, message } = parsearErrorRpc(errorReenviar.message)
      logEvent({
        level: 'warn',
        action: 'resend_invitation.rpc_error',
        correlationId,
        actorId,
        meta: { code },
      })
      const status = code === 'INV_NOT_FOUND' ? 404 : code === 'FORBIDDEN' ? 403 : 409
      return errorResponse(status, code, message, undefined, correlationId)
    }
    if (!invitation) {
      logEvent({ level: 'error', action: 'resend_invitation.no_row', correlationId, actorId })
      return errorResponse(
        500,
        'INTERNAL_ERROR',
        'resend_invitation no devolvió una fila.',
        undefined,
        correlationId,
      )
    }

    const { data: tenant, error: errorTenant } = await ctx.supabase
      .from('tenants')
      .select('name')
      .eq('id', invitation.tenant_id)
      .single()
    if (errorTenant || !tenant) {
      return errorResponse(
        404,
        'TENANT_NOT_FOUND',
        'Copropiedad no encontrada.',
        undefined,
        correlationId,
      )
    }

    // Nunca en meta: el token (§11.2) ni el correo del invitado (PII innecesaria en logs).
    const envio = await enviarEmailInvitacion({
      email: invitation.email,
      token,
      tenantNombre: tenant.name,
      role: invitation.role,
    })
    if (!envio.ok) {
      logEvent({
        level: 'error',
        action: 'resend_invitation.email_send_failed',
        correlationId,
        actorId,
        tenantId: invitation.tenant_id,
        message: envio.error,
      })
      return errorResponse(502, 'EMAIL_SEND_FAILED', envio.error, undefined, correlationId)
    }

    return jsonResponse(
      { invitation_id: invitation.id, expires_at: invitation.expires_at },
      200,
      correlationId,
    )
  }),
}
