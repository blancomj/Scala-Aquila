// Extraído de invite-user/index.ts para reusarlo en resend-invitation —
// mismo envío de correo (Brevo, AD-07), reenviar solo cambia el token.

const EXPIRACION_HORAS = 48

export async function enviarEmailInvitacion(params: {
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
