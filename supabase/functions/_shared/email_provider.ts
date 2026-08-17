// Aísla al proveedor de plantillas de correo (Brevo SMTP Templates) detrás
// de este único archivo — mismo criterio que sms_provider.ts. A diferencia
// del correo transaccional de invite-user (HTML inline, /v3/smtp/email),
// esto usa el motor de PLANTILLAS de Brevo (/v3/smtp/templates): Brevo
// guarda y renderiza el HTML, esta app solo sincroniza la copia local.
//
// Trampas verificadas contra la documentación pública de Brevo (mismo
// criterio de extracción de error que sms_provider.ts/invite-user):
// el motivo real de un rechazo llega en el cuerpo JSON (`message`), no en
// el texto de estado HTTP.
//
// No inventa brevo_template_id: crear() es la única vía para obtener uno
// real — nunca se siembra un id sin haberlo creado u obtenido de Brevo.

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/templates'

export interface EmailTemplateContenido {
  subject: string
  htmlContent: string
}

export interface EmailProviderResult {
  success: boolean
  templateId?: number
  errorMessage?: string
}

interface BrevoErrorBody {
  message?: string
}

function remitente(): { email: string; name: string } | null {
  const email = Deno.env.get('BREVO_SENDER_EMAIL')
  const name = Deno.env.get('BREVO_SENDER_NAME') ?? 'Aquila PH'
  if (!email) return null
  return { email, name }
}

async function extraerError(res: Response): Promise<string> {
  try {
    const cuerpo = (await res.json()) as BrevoErrorBody
    if (cuerpo.message) return `${cuerpo.message} (HTTP ${String(res.status)})`
  } catch {
    // el cuerpo no era JSON — se usa el mensaje genérico de abajo
  }
  return `HTTP ${String(res.status)}`
}

/** Crea una plantilla nueva en Brevo — única vía legítima para obtener un brevo_template_id real. */
export async function createEmailTemplate(
  templateName: string,
  contenido: EmailTemplateContenido,
): Promise<EmailProviderResult> {
  const apiKey = Deno.env.get('BREVO_API_KEY')
  const sender = remitente()
  if (!apiKey || !sender) {
    return { success: false, errorMessage: 'Brevo no está configurado (faltan BREVO_API_KEY o BREVO_SENDER_EMAIL).' }
  }

  const res = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      templateName,
      subject: contenido.subject,
      htmlContent: contenido.htmlContent,
      sender,
      isActive: true,
    }),
  })

  if (!res.ok) {
    return { success: false, errorMessage: await extraerError(res) }
  }

  const cuerpo = (await res.json()) as { id?: number }
  if (typeof cuerpo.id !== 'number') {
    return { success: false, errorMessage: 'Brevo no devolvió un id de plantilla.' }
  }
  return { success: true, templateId: cuerpo.id }
}

/** Actualiza una plantilla ya existente en Brevo. */
export async function updateEmailTemplate(
  templateId: number,
  contenido: EmailTemplateContenido,
): Promise<EmailProviderResult> {
  const apiKey = Deno.env.get('BREVO_API_KEY')
  const sender = remitente()
  if (!apiKey || !sender) {
    return { success: false, errorMessage: 'Brevo no está configurado (faltan BREVO_API_KEY o BREVO_SENDER_EMAIL).' }
  }

  const res = await fetch(`${BREVO_API_URL}/${String(templateId)}`, {
    method: 'PUT',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      subject: contenido.subject,
      htmlContent: contenido.htmlContent,
      sender,
      isActive: true,
    }),
  })

  if (!res.ok) {
    return { success: false, errorMessage: await extraerError(res) }
  }
  return { success: true, templateId }
}
