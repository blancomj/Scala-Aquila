// Correo del estado de cuenta — D-28 (Docs/evaluacion/13 §G, evaluación del
// punto 8 Docs/evaluacion/11). Concepto acordado: el cuerpo del correo es un
// RESUMEN mínimo (saldo + corte + enlace); el documento completo vive en el
// link firmado — nunca adjunto. Menos superficie de filtración y de phishing.
//
// El HTML usa tablas con estilos inline (≤600px): los clientes de correo no
// soportan flex/grid ni <style> en head — mismo estándar que cualquier
// transaccional. Sin imágenes externas: renderiza igual con imágenes
// bloqueadas y no filtra aperturas a terceros (Ley 1581).
//
// construirCorreoEstadoCuenta() es PURA (sin red, sin Deno.env) para poder
// testearla con deno test; enviarEmailEstadoCuenta() es la cáscara Brevo —
// COM-1: delega en enviarEmailCobranza (email_cobranza_provider.ts) en vez
// de hacer su propio fetch, porque ese es el único sitio del repo que ya
// normaliza providerMessageId — sin él el webhook de Brevo no puede
// resolver un acuse contra este envío.
import { enviarEmailCobranza } from './email_cobranza_provider.ts'

export interface ParametrosCorreoEstadoCuenta {
  tenantNombre: string
  inmuebleCodigo: string
  saldoFinal: number
  /** generado_en del snapshot — la fecha de corte impresa en el documento. */
  corteIso: string
  /** URL firmada del documento (token HMAC, D-27) — nunca lleva montos. */
  urlDocumento: string
  vigenciaDias: number
}

/** Escapa todo lo interpolable: nombre de copropiedad y código de inmueble
 * vienen de datos ingresados por usuarios; un `<script>` ahí es XSS dentro
 * del propio correo del cliente. */
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
  // Fecha pura del snapshot — se muestra tal cual llega, sin zonas horarias
  // del cliente: el corte es una fecha contable, no un instante.
  const fecha = new Date(iso)
  return `${String(fecha.getUTCDate()).padStart(2, '0')}/${String(fecha.getUTCMonth() + 1).padStart(2, '0')}/${fecha.getUTCFullYear()}`
}

/** Host del enlace, para la línea anti-phishing: "verifica que empiece por…".
 * Si la URL fuera inválida (no debería), devuelve el texto genérico. */
export function hostDelEnlace(url: string): string | null {
  try {
    return new URL(url).host
  } catch {
    return null
  }
}

export function construirCorreoEstadoCuenta(p: ParametrosCorreoEstadoCuenta): {
  subject: string
  html: string
} {
  const tenant = escaparHtml(p.tenantNombre)
  const inmueble = escaparHtml(p.inmuebleCodigo)
  const saldo = formatoMoneda(p.saldoFinal)
  const corte = formatoFecha(p.corteIso)
  const aFavor = p.saldoFinal < 0
  const host = hostDelEnlace(p.urlDocumento)

  const subject = `Estado de cuenta ${corte} — ${p.tenantNombre}`

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;border:1px solid #e4e4e7;">
  <tr><td style="background:#1e3a5f;color:#ffffff;padding:18px 24px;border-radius:8px 8px 0 0;font-size:16px;font-weight:bold;">${tenant}</td></tr>
  <tr><td style="padding:24px;">
    <p style="margin:0 0 16px;font-size:14px;color:#3f3f46;line-height:1.5;">Cordial saludo. Este es el resumen de tu estado de cuenta de administración correspondiente al corte <strong>${corte}</strong>.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:20px;">
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e4e4e7;font-size:13px;color:#52525b;">Inmueble</td>
        <td align="right" style="padding:10px 12px;border-bottom:1px solid #e4e4e7;font-size:13px;color:#18181b;font-weight:bold;">${inmueble}</td>
      </tr>
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e4e4e7;font-size:13px;color:#52525b;">Fecha de corte</td>
        <td align="right" style="padding:10px 12px;border-bottom:1px solid #e4e4e7;font-size:13px;color:#18181b;">${corte}</td>
      </tr>
      <tr>
        <td style="padding:14px 12px;font-size:14px;color:#52525b;">${aFavor ? 'Saldo a tu favor' : 'Saldo actual'}</td>
        <td align="right" style="padding:14px 12px;font-size:22px;font-weight:bold;color:${aFavor ? '#166534' : '#7f1d1d'};">${saldo}</td>
      </tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td align="center" style="padding-bottom:8px;">
      <a href="${p.urlDocumento}" style="display:inline-block;background:#1e3a5f;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:13px 30px;border-radius:6px;">Ver estado de cuenta completo</a>
    </td></tr></table>
    <p style="margin:0 0 6px;font-size:12px;color:#71717a;text-align:center;">El enlace vence en ${p.vigenciaDias} días. Puedes volver a pedirlo a la administración.</p>
    <p style="margin:16px 0 0;font-size:12px;color:#71717a;line-height:1.5;">El documento detallado incluye el movimiento completo del periodo y un folio verificable.</p>
    <hr style="border:none;border-top:1px solid #e4e4e7;margin:20px 0;">
    <p style="margin:0 0 6px;font-size:11px;color:#a1a1aa;line-height:1.5;"><strong>Seguridad:</strong> verifica que el enlace comience con <strong>https://${host ?? 'el sitio oficial'}</strong>. Nunca compartas este mensaje si no reconoces la copropiedad.</p>
    <p style="margin:0;font-size:11px;color:#a1a1aa;line-height:1.5;">Las cuotas de administración no requieren factura electrónica (Concepto DIAN 106/2022); el documento es informativo. Recibes este correo como copropietario o residente registrado de ${tenant}.</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`

  return { subject, html }
}

/** Envío real vía Brevo (/v3/smtp/email, HTML inline) a través de
 * enviarEmailCobranza — COM-1: subject/html/providerMessageId viajan en la
 * respuesta porque envio_estado_cuenta.ts los necesita para registrar el
 * envío en acciones_cobranza_envios (registrarEnvioComunicacion). */
export interface ResultadoEnvioEstadoCuenta {
  readonly ok: boolean
  /** subject/html se devuelven SIEMPRE, incluso en fallo — el envío fallido también es evidencia
   * (CAR §34.1: los intentos fallidos acreditan diligencia, no se descartan). */
  readonly subject: string
  readonly html: string
  readonly providerMessageId: string | null
  readonly error: string | null
}

export async function enviarEmailEstadoCuenta(
  params: ParametrosCorreoEstadoCuenta & { email: string; reference: string },
): Promise<ResultadoEnvioEstadoCuenta> {
  const { subject, html } = construirCorreoEstadoCuenta(params)

  const resultado = await enviarEmailCobranza({
    to: params.email,
    destinatarioNombre: null,
    subject,
    html,
    reference: params.reference,
    tags: ['estado_cuenta', params.reference],
  })

  return {
    ok: resultado.success,
    subject,
    html,
    providerMessageId: resultado.providerMessageId ?? null,
    error: resultado.success ? null : (resultado.errorMessage ?? 'Brevo no aceptó el correo.'),
  }
}
