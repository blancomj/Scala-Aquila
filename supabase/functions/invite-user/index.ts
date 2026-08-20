// PROMPT_MAESTRO_FASE1.md §8, §9.2 — invite-user: agent invita a alguien a
// su copropiedad con un rol. token = randomBytes(32) → guarda sha256(token)
// (AD-04); expires_at = now + 48h; envía el enlace por Brevo (AD-07).
//
// Si Brevo falla, la invitación ya insertada se revoca (revoke_invitation)
// para liberar el slot de "invitación pendiente única por correo" y que el
// agent pueda reintentar de inmediato — no queda una invitación fantasma
// cuyo token nadie recibió.
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
  tenant_id: z.string().uuid(),
  email: z.string().trim().toLowerCase().email('Correo inválido.'),
  role: z.enum(['auxiliar', 'auditor']),
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
      logEvent({
        level: 'warn',
        action: 'invite_user.invalid_payload',
        correlationId,
        actorId,
        meta: { issues: parseo.error.issues },
      })
      return errorResponse(
        400,
        'INVALID_PAYLOAD',
        parseo.error.issues[0]?.message ?? 'Payload inválido.',
        { issues: parseo.error.issues },
        correlationId,
      )
    }
    const { tenant_id: tenantId, email, role } = parseo.data

    // Antes de cualquier efecto secundario — un request bloqueado no llega a Brevo.
    const bloqueo = await enforceRateLimit(
      ctx.supabase,
      `invite_user:${actorId}`,
      RATE_LIMIT_MAX_HITS,
      RATE_LIMIT_VENTANA,
      correlationId,
    )
    if (bloqueo) return bloqueo

    const { data: tenant, error: errorTenant } = await ctx.supabase
      .from('tenants')
      .select('name')
      .eq('id', tenantId)
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

    const token = generarToken()
    const tokenHash = await hashToken(token)
    const expiresAt = new Date(Date.now() + EXPIRACION_HORAS * 60 * 60 * 1000).toISOString()

    const { data: invitation, error: errorInvitar } = await ctx.supabase.rpc('invite_user', {
      p_tenant_id: tenantId,
      p_email: email,
      p_role: role,
      p_token_hash: tokenHash,
      p_expires_at: expiresAt,
    })

    if (errorInvitar) {
      const { code, message } = parsearErrorRpc(errorInvitar.message)
      logEvent({
        level: 'warn',
        action: 'invite_user.rpc_error',
        correlationId,
        actorId,
        tenantId,
        meta: { code, role },
      })
      const status = code === 'FORBIDDEN' ? 403 : 409
      return errorResponse(status, code, message, undefined, correlationId)
    }
    if (!invitation) {
      logEvent({ level: 'error', action: 'invite_user.no_row', correlationId, actorId, tenantId })
      return errorResponse(
        500,
        'INTERNAL_ERROR',
        'invite_user no devolvió una fila.',
        undefined,
        correlationId,
      )
    }

    // Nunca en meta: el token (§11.2) ni el correo del invitado (PII innecesaria en logs).
    const envio = await enviarEmailInvitacion({ email, token, tenantNombre: tenant.name, role })
    if (!envio.ok) {
      logEvent({
        level: 'error',
        action: 'invite_user.email_send_failed',
        correlationId,
        actorId,
        tenantId,
        message: envio.error,
      })
      await ctx.supabase.rpc('revoke_invitation', { p_invitation_id: invitation.id })
      return errorResponse(502, 'EMAIL_SEND_FAILED', envio.error, undefined, correlationId)
    }

    return jsonResponse(
      { invitation_id: invitation.id, expires_at: invitation.expires_at },
      200,
      correlationId,
    )
  }),
}
