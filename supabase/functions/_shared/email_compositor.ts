// Compositor de correo — builder puro de HTML (Patrón A, testable sin red).
// Sigue el mismo patrón que email_estado_cuenta.ts: tabla-based, inline
// styles, ≤600px, sin imágenes externas (Ley 1581), escape de interpolados.

function escaparHtml(texto: string): string {
  return texto
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export interface ParametrosCorreoCompositor {
  asunto: string
  cuerpo: string
  remitenteNombre: string
  destinatarioNombre: string
}

/**
 * Construye el HTML final del correo del compositor.
 * `asunto` y `cuerpo` vienen de la plantilla o del texto libre escrito
 * por el usuario — ya con placeholders potencialmente presentes.
 * `params` contiene los valores resueltos del registro de campos.
 *
 * función PURA: sin red, sin Deno.env — testeable con deno test.
 */
export function construirCorreoCompositor(
  parametros: ParametrosCorreoCompositor,
  params: Record<string, string>,
): { subject: string; html: string } {
  const PARAM_PATTERN = /\{\{\s*params\.(\w+)\s*\}\}/g
  const render = (text: string) =>
    text.replace(PARAM_PATTERN, (_match, key: string) => {
      const valor = params[key]
      return valor !== undefined ? escaparHtml(valor) : `{{ params.${key} }}`
    })

  const asunto = render(parametros.asunto)
  const cuerpoRenderizado = render(parametros.cuerpo)
  const remitente = escaparHtml(parametros.remitenteNombre)

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;border:1px solid #e4e4e7;">
  <tr><td style="background:#1e3a5f;color:#ffffff;padding:18px 24px;border-radius:8px 8px 0 0;font-size:16px;font-weight:bold;">${remitente}</td></tr>
  <tr><td style="padding:24px;font-size:14px;color:#3f3f46;line-height:1.5;">
    ${cuerpoRenderizado}
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`

  return { subject: asunto, html }
}
