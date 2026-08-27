// Correo del recibo de caja — RC-4, clon de email_estado_cuenta.ts (D-28):
// mismo concepto, el cuerpo del correo es un resumen mínimo (monto + fecha +
// enlace); el documento completo vive en el link firmado, nunca adjunto.
//
// construirCorreoReciboCaja() es PURA (sin red, sin Deno.env) para poder
// testearla; enviarEmailReciboCaja() es la cáscara Brevo.

export interface ParametrosCorreoReciboCaja {
  tenantNombre: string
  inmuebleCodigo: string
  monto: number
  folio: string
  /** fecha_pago del snapshot, YYYY-MM-DD. */
  fechaPagoIso: string
  urlDocumento: string
  vigenciaDias: number
}

function escaparHtml(texto: string): string {
  return texto
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function formatoMoneda(valor: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(valor)
}

function formatoFecha(iso: string): string {
  const [anio, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${anio}`
}

export function hostDelEnlace(url: string): string | null {
  try {
    return new URL(url).host
  } catch {
    return null
  }
}

export function construirCorreoReciboCaja(p: ParametrosCorreoReciboCaja): {
  subject: string
  html: string
} {
  const tenant = escaparHtml(p.tenantNombre)
  const inmueble = escaparHtml(p.inmuebleCodigo)
  const monto = formatoMoneda(p.monto)
  const fecha = formatoFecha(p.fechaPagoIso)
  const host = hostDelEnlace(p.urlDocumento)

  const subject = `Recibo de caja ${p.folio} — ${p.tenantNombre}`

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;border:1px solid #e4e4e7;">
  <tr><td style="background:#1e3a5f;color:#ffffff;padding:18px 24px;border-radius:8px 8px 0 0;font-size:16px;font-weight:bold;">${tenant}</td></tr>
  <tr><td style="padding:24px;">
    <p style="margin:0 0 16px;font-size:14px;color:#3f3f46;line-height:1.5;">Cordial saludo. Confirmamos la recepción de tu pago — este es el recibo de caja correspondiente.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:20px;">
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e4e4e7;font-size:13px;color:#52525b;">Inmueble</td>
        <td align="right" style="padding:10px 12px;border-bottom:1px solid #e4e4e7;font-size:13px;color:#18181b;font-weight:bold;">${inmueble}</td>
      </tr>
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e4e4e7;font-size:13px;color:#52525b;">Fecha de pago</td>
        <td align="right" style="padding:10px 12px;border-bottom:1px solid #e4e4e7;font-size:13px;color:#18181b;">${fecha}</td>
      </tr>
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e4e4e7;font-size:13px;color:#52525b;">Recibo No.</td>
        <td align="right" style="padding:10px 12px;border-bottom:1px solid #e4e4e7;font-size:13px;color:#18181b;">${p.folio}</td>
      </tr>
      <tr>
        <td style="padding:14px 12px;font-size:14px;color:#52525b;">Valor recibido</td>
        <td align="right" style="padding:14px 12px;font-size:22px;font-weight:bold;color:#166534;">${monto}</td>
      </tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td align="center" style="padding-bottom:8px;">
      <a href="${p.urlDocumento}" style="display:inline-block;background:#1e3a5f;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:13px 30px;border-radius:6px;">Ver recibo de caja</a>
    </td></tr></table>
    <p style="margin:0 0 6px;font-size:12px;color:#71717a;text-align:center;">El enlace vence en ${p.vigenciaDias} días. Puedes volver a pedirlo a la administración.</p>
    <hr style="border:none;border-top:1px solid #e4e4e7;margin:20px 0;">
    <p style="margin:0 0 6px;font-size:11px;color:#a1a1aa;line-height:1.5;"><strong>Seguridad:</strong> verifica que el enlace comience con <strong>https://${host ?? 'el sitio oficial'}</strong>. Nunca compartas este mensaje si no reconoces la copropiedad.</p>
    <p style="margin:0;font-size:11px;color:#a1a1aa;line-height:1.5;">Este recibo es soporte de pago; no reemplaza la factura o el recibo de caja tributario si aplica. Recibes este correo como copropietario o residente registrado de ${tenant}.</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`

  return { subject, html }
}

export async function enviarEmailReciboCaja(
  params: ParametrosCorreoReciboCaja & { email: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = Deno.env.get('BREVO_API_KEY')
  const senderEmail = Deno.env.get('BREVO_SENDER_EMAIL')
  const senderName = Deno.env.get('BREVO_SENDER_NAME') ?? 'Aquila PH'
  if (!apiKey || !senderEmail) {
    return { ok: false, error: 'Brevo no está configurado (faltan variables de entorno).' }
  }

  const { subject, html } = construirCorreoReciboCaja(params)

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
      subject,
      htmlContent: html,
    }),
  })

  if (!res.ok) {
    const cuerpo = await res.text()
    return { ok: false, error: `Brevo respondió ${res.status}: ${cuerpo}` }
  }
  return { ok: true }
}
