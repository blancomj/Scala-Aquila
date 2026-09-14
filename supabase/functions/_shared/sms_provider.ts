// Aísla al proveedor de SMS (Brevo Transactional SMS) detrás de este único
// archivo — es lo único que cambiaría si algún día se cambia de proveedor.
// Usado por guardar-plantilla-sms (validación de remitente al arrancar) y
// probar-plantilla-sms (envío real).
//
// Trampas verificadas contra Brevo real (ya documentadas para el email
// transaccional en invite-user/index.ts, aquí replicadas para SMS):
//
// 1. Remitente alfanumérico: máximo 11 caracteres. Un remitente más largo
//    se rechaza con un 400 cuyo único síntoma es "no llegó el SMS" — se
//    valida al cargar el módulo, no en cada envío, para que un remitente
//    mal configurado tumbe el arranque de forma ruidosa.
// 2. El SDK/API rechaza con un objeto: el motivo real llega en
//    error.body.message (o error.response.body.message), no en
//    error.message — si no se extrae, quien prueba ve "error desconocido".
// 3. Sin credencial configurada, no revienta: devuelve success:false con
//    el motivo — el editor debe poder funcionar sin credenciales.

const BREVO_SMS_SENDER = Deno.env.get('BREVO_SMS_SENDER')

if (BREVO_SMS_SENDER && BREVO_SMS_SENDER.length > 11) {
  throw new Error(
    `BREVO_SMS_SENDER tiene ${BREVO_SMS_SENDER.length} caracteres — Brevo exige remitente ` +
      'alfanumérico de máximo 11.',
  )
}

export interface SendSmsParams {
  to: string
  body: string
  reference: string
}

export interface SendSmsResult {
  success: boolean
  providerMessageId?: string
  segmentsUsed: number
  errorMessage?: string
}

interface BrevoErrorBody {
  message?: string
}

export async function sendSms(params: SendSmsParams): Promise<SendSmsResult> {
  const apiKey = Deno.env.get('BREVO_API_KEY')

  if (!apiKey || !BREVO_SMS_SENDER) {
    return {
      success: false,
      segmentsUsed: 0,
      errorMessage: 'Brevo SMS no está configurado (faltan BREVO_API_KEY o BREVO_SMS_SENDER).',
    }
  }

  // Igual que email_cobranza_provider.ts: un fetch que revienta por red/DNS/TLS, o un 200 con
  // cuerpo no-JSON, no es un HTTP no-ok — sin este try/catch tumbaría la función con un 500
  // crudo en vez de degradar a success:false, legible en la bandeja.
  try {
    const res = await fetch('https://api.brevo.com/v3/transactionalSMS/sms', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: BREVO_SMS_SENDER,
        recipient: params.to,
        content: params.body,
        type: 'transactional',
        tag: params.reference,
      }),
    })

    if (!res.ok) {
      let mensaje = `HTTP ${res.status}`
      try {
        const cuerpo = (await res.json()) as BrevoErrorBody
        if (cuerpo.message) mensaje = cuerpo.message
      } catch {
        // el cuerpo no era JSON — se usa el mensaje genérico de arriba
      }
      return {
        success: false,
        segmentsUsed: 0,
        errorMessage: `${mensaje} (HTTP ${res.status})`,
      }
    }

    const cuerpo = (await res.json()) as { messageId?: string; smsCount?: number }
    return {
      success: true,
      providerMessageId: cuerpo.messageId,
      segmentsUsed: cuerpo.smsCount ?? 1,
    }
  } catch (excepcion) {
    const detalle = excepcion instanceof Error ? excepcion.message : String(excepcion)
    return { success: false, segmentsUsed: 0, errorMessage: `No se pudo contactar a Brevo: ${detalle}` }
  }
}
