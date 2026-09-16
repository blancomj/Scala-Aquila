// Envío del reporte programado vía Brevo, CON ADJUNTO (RPT-05).
//
// Existe aparte de email_cobranza_provider.ts por una diferencia que no es
// cosmética: aquí va un archivo. Brevo acepta adjuntos en
// /v3/smtp/email como `attachment: [{ name, content }]` con el contenido en
// base64, y ese camino no lo usa ningún otro envío del repo.
//
// Mismo contrato de errores que el resto de proveedores del repositorio:
// **nunca lanza**. Un envío que falla tiene que poder leerse en la bitácora
// de entregas (`reporte_entregas.detalle`), no en los logs del servidor —
// si esto tumbara la función, una corrida entera se perdería porque un solo
// buzón estaba lleno.
//
// El `try/catch` envuelve TODO el fetch, no solo el parseo del cuerpo de
// error: un fallo de red/DNS/TLS revienta en el propio `fetch` y ese fue un
// bug real del repo (D-123, cuatro archivos afectados).

export interface EnvioReporteResult {
  success: boolean
  providerMessageId?: string
  errorMessage?: string
}

interface BrevoErrorBody {
  message?: string
}

/** Brevo quiere el adjunto en base64, y un XLSX es binario. */
export function aBase64(bytes: Uint8Array): string {
  let binario = ''
  // De a trozos: `String.fromCharCode(...bytes)` con un archivo de cientos
  // de kB desborda la pila de argumentos.
  const TROZO = 0x8000
  for (let i = 0; i < bytes.length; i += TROZO) {
    binario += String.fromCharCode(...bytes.subarray(i, i + TROZO))
  }
  return btoa(binario)
}

export async function enviarEmailReporte(params: {
  to: string
  destinatarioNombre: string | null
  subject: string
  html: string
  adjunto: { nombre: string; contenido: Uint8Array }
  /** id de la programación — viaja como tag para rastrearlo en Brevo. */
  reference: string
}): Promise<EnvioReporteResult> {
  const apiKey = Deno.env.get('BREVO_API_KEY')
  const senderEmail = Deno.env.get('BREVO_SENDER_EMAIL')
  const senderName = Deno.env.get('BREVO_SENDER_NAME') ?? 'Aquila PH'

  if (!apiKey || !senderEmail) {
    return {
      success: false,
      errorMessage: 'Brevo no está configurado (faltan BREVO_API_KEY o BREVO_SENDER_EMAIL).',
    }
  }

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sender: { email: senderEmail, name: senderName },
        to: [
          params.destinatarioNombre
            ? { email: params.to, name: params.destinatarioNombre }
            : { email: params.to },
        ],
        subject: params.subject,
        htmlContent: params.html,
        attachment: [
          { name: params.adjunto.nombre, content: aBase64(params.adjunto.contenido) },
        ],
        tags: ['reporte-programado', params.reference],
      }),
    })

    if (!res.ok) {
      let mensaje = `HTTP ${String(res.status)}`
      try {
        const cuerpo = (await res.json()) as BrevoErrorBody
        if (cuerpo.message) mensaje = cuerpo.message
      } catch {
        // el cuerpo no era JSON — se usa el mensaje genérico de arriba
      }
      return { success: false, errorMessage: `${mensaje} (HTTP ${String(res.status)})` }
    }

    const cuerpo = (await res.json()) as { messageId?: string }
    return { success: true, providerMessageId: cuerpo.messageId }
  } catch (excepcion) {
    const detalle = excepcion instanceof Error ? excepcion.message : String(excepcion)
    return { success: false, errorMessage: `No se pudo contactar a Brevo: ${detalle}` }
  }
}
