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
import { errorResponse, parsearErrorRpc } from '../_shared/http.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'
import { generarToken, hashToken } from '../_shared/tokens.ts'

const EXPIRACION_HORAS = 48
const RATE_LIMIT_MAX_HITS = 20
const RATE_LIMIT_VENTANA = '1 hour'

const payloadSchema = z.object({
  tenant_id: z.string().uuid(),
  email: z.string().trim().toLowerCase().email('Correo inválido.'),
  role: z.enum(['agent', 'auditor']),
})

async function enviarEmailInvitacion(params: {
  email: string
  token: string
  tenantNombre: string
  role: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = Deno.env.get('BREVO_API_KEY')
  const senderEmail = Deno.env.get('BREVO_SENDER_EMAIL')
  const senderName = Deno.env.get('BREVO_SENDER_NAME') ?? 'Aquila PH'
  const appUrl = Deno.env.get('NUXT_PUBLIC_APP_URL') ?? Deno.env.get('APP_URL')

  if (!apiKey || !senderEmail || !appUrl) {
    return { ok: false, error: 'Brevo no está configurado (faltan variables de entorno).' }
  }

  const enlace = `${appUrl}/invite?token=${params.token}`
  const rolTexto = params.role === 'agent' ? 'administrador' : 'auditor'

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { email: senderEmail, name: senderName },
      to: [{ email: params.email }],
      subject: `Te invitaron a administrar ${params.tenantNombre} en Aquila PH`,
      htmlContent: `
        <p>Te invitaron a unirte a <strong>${params.tenantNombre}</strong> como <strong>${rolTexto}</strong>.</p>
        <p><a href="${enlace}">Aceptar invitación</a></p>
        <p>Este enlace expira en ${EXPIRACION_HORAS} horas.</p>
      `,
    }),
  })

  if (!res.ok) {
    const cuerpo = await res.text()
    return { ok: false, error: `Brevo respondió ${res.status}: ${cuerpo}` }
  }
  return { ok: true }
}

export default {
  fetch: withSupabase<Database>({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') {
      return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Solo POST.')
    }

    let payload: unknown
    try {
      payload = await req.json()
    } catch {
      return errorResponse(400, 'INVALID_PAYLOAD', 'El cuerpo debe ser JSON válido.')
    }

    const parseo = payloadSchema.safeParse(payload)
    if (!parseo.success) {
      return errorResponse(400, 'INVALID_PAYLOAD', parseo.error.issues[0]?.message ?? 'Payload inválido.', {
        issues: parseo.error.issues,
      })
    }
    const { tenant_id: tenantId, email, role } = parseo.data

    // Antes de cualquier efecto secundario — un request bloqueado no llega a Brevo.
    const bloqueo = await enforceRateLimit(
      ctx.supabase,
      `invite_user:${ctx.userClaims?.id}`,
      RATE_LIMIT_MAX_HITS,
      RATE_LIMIT_VENTANA,
    )
    if (bloqueo) return bloqueo

    const { data: tenant, error: errorTenant } = await ctx.supabase
      .from('tenants')
      .select('name')
      .eq('id', tenantId)
      .single()
    if (errorTenant || !tenant) {
      return errorResponse(404, 'TENANT_NOT_FOUND', 'Copropiedad no encontrada.')
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
      const status = code === 'FORBIDDEN' ? 403 : 409
      return errorResponse(status, code, message)
    }
    if (!invitation) {
      return errorResponse(500, 'INTERNAL_ERROR', 'invite_user no devolvió una fila.')
    }

    const envio = await enviarEmailInvitacion({ email, token, tenantNombre: tenant.name, role })
    if (!envio.ok) {
      await ctx.supabase.rpc('revoke_invitation', { p_invitation_id: invitation.id })
      return errorResponse(502, 'EMAIL_SEND_FAILED', envio.error)
    }

    return Response.json({ invitation_id: invitation.id, expires_at: invitation.expires_at })
  }),
}
