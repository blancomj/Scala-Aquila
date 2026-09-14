// EXT-01 §3.2 — contenido fijo, no pasa por plantillas_email (tenant-
// configurable): un OTP de seguridad no es contenido de negocio editable
// por el tenant, mismo criterio que enviarEmailInvitacion (invite-user).

const EXPIRACION_MINUTOS = 10

export async function enviarEmailOtpActorExterno(params: {
  email: string
  codigo: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = Deno.env.get('BREVO_API_KEY')
  const senderEmail = Deno.env.get('BREVO_SENDER_EMAIL')
  const senderName = Deno.env.get('BREVO_SENDER_NAME') ?? 'Aquila PH'

  if (!apiKey || !senderEmail) {
    return { ok: false, error: 'Brevo no está configurado (faltan variables de entorno).' }
  }

  // Un fetch que revienta por red/DNS/TLS no es un HTTP no-ok — sin este try/catch tumbaría la
  // función con un 500 crudo en vez de degradar a ok:false (mismo criterio que
  // email_cobranza_provider.ts/sms_provider.ts/email_invitation.ts).
  try {
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
        subject: 'Tu código de verificación de Aquila PH',
        htmlContent: `
          <p>Tu código de verificación es:</p>
          <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px;">${params.codigo}</p>
          <p>Vence en ${EXPIRACION_MINUTOS} minutos. Si no solicitaste este código, ignora este correo.</p>
        `,
      }),
    })

    if (!res.ok) {
      const cuerpo = await res.text()
      return { ok: false, error: `Brevo respondió ${res.status}: ${cuerpo}` }
    }
    return { ok: true }
  } catch (excepcion) {
    const detalle = excepcion instanceof Error ? excepcion.message : String(excepcion)
    return { ok: false, error: `No se pudo contactar a Brevo: ${detalle}` }
  }
}
