// Envío del correo de cobranza vía Brevo (/v3/smtp/email, HTML inline).
//
// Existe aparte de email_provider.ts a propósito: aquel sincroniza
// PLANTILLAS con Brevo (/v3/smtp/templates) y esa vía lleva bloqueada
// desde el 2026-08-17 por la verificación de remitente de la cuenta. El
// correo transaccional inline sí funciona hoy — es el que ya usan
// invite-user y el estado de cuenta —, así que el canal de cobranza no
// depende de que se desbloquee la sincronización.
//
// La diferencia que importa frente a los otros envíos inline del repo
// (email_invitation.ts, email_estado_cuenta.ts): aquí SÍ se devuelve el
// messageId. Sin él no hay forma de resolver el acuse del webhook contra
// el envío, y una notificación sin acuse no acredita nada (§34.4).
//
// El messageId de Brevo llega entre ángulos — "<20260829...@smtp-relay>" —
// y el webhook lo reenvía en el mismo formato. Se guarda SIN ángulos y el
// webhook normaliza igual antes de buscar: los ángulos son sintaxis del
// encabezado Message-ID (RFC 5322), no parte del identificador, y basta
// con que una de las dos puntas los conserve para que nada case.

/** Quita los ángulos del Message-ID. Idempotente: un id sin ellos no cambia. */
export function normalizarMessageId(valor: string): string {
  return valor.trim().replace(/^<|>$/g, '')
}

export interface EnvioEmailResult {
  success: boolean
  providerMessageId?: string
  errorMessage?: string
}

interface BrevoErrorBody {
  message?: string
}

export async function enviarEmailCobranza(params: {
  to: string
  destinatarioNombre: string | null
  subject: string
  html: string
  /** id de la acción — viaja como tag para poder rastrearlo en Brevo. */
  reference: string
  /**
   * GOB-9 §3.1: tags de Brevo, aditivo — sin este parámetro el
   * comportamiento es idéntico al de siempre (['cobranza', reference]).
   * Un envío generalizado (enviar-comunicacion) pasa su propio origen en
   * vez de la etiqueta 'cobranza', que no le corresponde.
   */
  tags?: string[]
}): Promise<EnvioEmailResult> {
  const apiKey = Deno.env.get('BREVO_API_KEY')
  const senderEmail = Deno.env.get('BREVO_SENDER_EMAIL')
  const senderName = Deno.env.get('BREVO_SENDER_NAME') ?? 'Aquila PH'

  // Mismo criterio que sms_provider: sin credencial no revienta, devuelve
  // el motivo. Un despacho que falla por configuración tiene que poder
  // leerse en la bandeja, no en los logs del servidor.
  if (!apiKey || !senderEmail) {
    return {
      success: false,
      errorMessage: 'Brevo no está configurado (faltan BREVO_API_KEY o BREVO_SENDER_EMAIL).',
    }
  }

  // Todo lo que sigue puede fallar de formas que no son un HTTP no-ok (fetch que revienta por
  // red/DNS/TLS, o un 200 con cuerpo no-JSON) — un despacho que falla tiene que poder leerse en
  // la bandeja (success:false), nunca tumbar la función con un 500 crudo.
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sender: { email: senderEmail, name: senderName },
        to: [params.destinatarioNombre ? { email: params.to, name: params.destinatarioNombre } : { email: params.to }],
        subject: params.subject,
        htmlContent: params.html,
        tags: params.tags ?? ['cobranza', params.reference],
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
    if (!cuerpo.messageId) {
      // Brevo aceptó pero no identificó el mensaje. El correo salió, así que
      // no es un fallo; pero sin id ningún acuse podrá resolverse contra este
      // envío y hay que poder verlo en la evidencia.
      return { success: true, errorMessage: 'Brevo aceptó el correo sin devolver messageId — no habrá acuses.' }
    }
    return { success: true, providerMessageId: normalizarMessageId(cuerpo.messageId) }
  } catch (excepcion) {
    const detalle = excepcion instanceof Error ? excepcion.message : String(excepcion)
    return { success: false, errorMessage: `No se pudo contactar a Brevo: ${detalle}` }
  }
}
