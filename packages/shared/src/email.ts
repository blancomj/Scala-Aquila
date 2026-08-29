/**
 * Configuración de plantillas de correo transaccional sincronizadas con
 * Brevo — fuente única de verdad, mismo patrón que sms.ts: un solo
 * archivo, sin imports relativos internos (Deno lo importa directo desde
 * las Edge Functions, igual que database.generated.ts).
 *
 * Reutiliza los mismos event_type que SMS_FIELD_REGISTRY (sms.ts) — mismo
 * evento de negocio, canal distinto. El registro de campos es
 * independiente: el correo admite más variables que el SMS del mismo
 * evento.
 *
 * Desde 2026-08-29, 'cartera_pago_vencido' SÍ tiene disparador real: el
 * canal email de cobranza (supabase/functions/_shared/despacho_cobranza.ts)
 * rellena esos campos y envía. Los otros tres siguen sin disparador — sus
 * campos son provisionales.
 */

// ── Registro de eventos ────────────────────────────────────────────────

export interface EmailFieldDef {
  field: string
  sample: string
  description: string
}

export const EMAIL_FIELD_REGISTRY: Record<string, EmailFieldDef[]> = {
  cartera_recordatorio_pago: [
    { field: 'nombreResidente', sample: 'Ana María Gómez', description: 'Nombre del residente' },
    { field: 'inmueble', sample: 'Apto 302', description: 'Código del inmueble' },
    { field: 'saldoPendiente', sample: '$450.000', description: 'Saldo pendiente de pago' },
    { field: 'fechaVencimiento', sample: '5 de septiembre', description: 'Fecha de vencimiento' },
  ],
  // Único evento con disparador real de correo (despacho_cobranza.ts,
  // canal email). 'copropiedad' se declara SOLO aquí: ofrecerlo en los
  // otros eventos sería publicar un campo que nadie rellena y que se
  // enviaría literal como {{ params.copropiedad }}.
  cartera_pago_vencido: [
    { field: 'copropiedad', sample: 'Conjunto Los Laureles', description: 'Nombre de la copropiedad' },
    { field: 'nombreResidente', sample: 'Ana María Gómez', description: 'Nombre del residente' },
    { field: 'inmueble', sample: 'Apto 302', description: 'Código del inmueble' },
    { field: 'diasMora', sample: '12', description: 'Días en mora' },
    { field: 'saldoPendiente', sample: '$450.000', description: 'Saldo pendiente de pago' },
  ],
  cartera_pago_confirmado: [
    { field: 'nombreResidente', sample: 'Ana María Gómez', description: 'Nombre del residente' },
    { field: 'inmueble', sample: 'Apto 302', description: 'Código del inmueble' },
    { field: 'montoPagado', sample: '$450.000', description: 'Monto pagado' },
    { field: 'fechaPago', sample: '3 de septiembre', description: 'Fecha del pago' },
  ],
  cartera_acuerdo_pago_creado: [
    { field: 'nombreResidente', sample: 'Ana María Gómez', description: 'Nombre del residente' },
    { field: 'inmueble', sample: 'Apto 302', description: 'Código del inmueble' },
    { field: 'cuotaMensual', sample: '$150.000', description: 'Valor de cada cuota' },
    { field: 'numeroCuotas', sample: '3', description: 'Número de cuotas del acuerdo' },
  ],
}

/** Eventos que el panel expone con editor e interruptor. */
export const EMAIL_ACTIVE_EVENT_TYPES: readonly string[] = [
  'cartera_recordatorio_pago',
  'cartera_pago_vencido',
  'cartera_pago_confirmado',
  'cartera_acuerdo_pago_creado',
]

/** No hay sistema de i18n en el repo — mismo patrón que SMS_EVENT_LABELS. */
export const EMAIL_EVENT_LABELS: Record<string, string> = {
  cartera_recordatorio_pago: 'Recordatorio de pago',
  cartera_pago_vencido: 'Pago vencido',
  cartera_pago_confirmado: 'Pago confirmado',
  cartera_acuerdo_pago_creado: 'Acuerdo de pago creado',
}

// ── Renderizado ─────────────────────────────────────────────────────────

/**
 * Sintaxis de Brevo: `{{ params.campo }}`, con el prefijo `params.`
 * obligatorio. `{{ campo }}` sin prefijo no da error en Brevo — renderiza
 * vacío en silencio (trampa real documentada en el spec del módulo) — de
 * ahí PREFIJO_FALTANTE_PATTERN más abajo, que la detecta explícitamente.
 */
const PARAM_PATTERN = /\{\{\s*params\.(\w+)\s*\}\}/g
const PREFIJO_FALTANTE_PATTERN = /\{\{\s*(?!params\.)(\w+)\s*\}\}/g

export function renderEmailTemplate(text: string, params: Record<string, string>): string {
  return text.replace(PARAM_PATTERN, (match, key: string) => params[key] ?? match)
}

export function extraerCamposPlantillaEmail(text: string): string[] {
  return [...text.matchAll(PARAM_PATTERN)].map((m) => m[1] as string)
}

export function extraerCamposSinPrefijo(text: string): string[] {
  return [...new Set([...text.matchAll(PREFIJO_FALTANTE_PATTERN)].map((m) => m[1] as string))]
}

// ── Validación ──────────────────────────────────────────────────────────

const LONGITUD_MINIMA = 10

export class EmailValidationError extends Error {
  code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

/**
 * Valida asunto + cuerpo a la vez (el asunto también admite variables y
 * se olvida siempre, spec §6) contra el registro de campos del evento.
 */
export function validateEmailTemplateBody(eventType: string, subject: string, htmlContent: string): void {
  const campos = EMAIL_FIELD_REGISTRY[eventType]
  if (!campos) {
    throw new EmailValidationError('EMAIL_UNKNOWN_EVENT', `Evento desconocido: ${eventType}`)
  }

  if (htmlContent.trim().length < LONGITUD_MINIMA) {
    throw new EmailValidationError(
      'EMAIL_BODY_TOO_SHORT',
      `El contenido del correo es demasiado corto (mínimo ${String(LONGITUD_MINIMA)} caracteres útiles).`,
    )
  }

  const textoCompleto = `${subject}\n${htmlContent}`

  const [primerCampoSinPrefijo] = extraerCamposSinPrefijo(textoCompleto)
  if (primerCampoSinPrefijo !== undefined) {
    throw new EmailValidationError(
      'EMAIL_MISSING_PARAMS_PREFIX',
      `Usa {{ params.${primerCampoSinPrefijo} }}, no {{ ${primerCampoSinPrefijo} }} — sin el prefijo el campo se envía vacío.`,
    )
  }

  const camposValidos = new Set(campos.map((c) => c.field))
  const desconocidos = [...new Set(extraerCamposPlantillaEmail(textoCompleto))].filter(
    (campo) => !camposValidos.has(campo),
  )
  if (desconocidos.length > 0) {
    throw new EmailValidationError(
      'EMAIL_UNKNOWN_FIELDS',
      `Campos desconocidos para este evento: ${desconocidos.join(', ')}`,
    )
  }
}

/** Filtra overrides de vista previa contra el registro — nunca renderiza campos no declarados (spec §8). */
export function filtrarOverridesValidos(eventType: string, overrides: Record<string, string>): Record<string, string> {
  const campos = new Set((EMAIL_FIELD_REGISTRY[eventType] ?? []).map((c) => c.field))
  return Object.fromEntries(Object.entries(overrides).filter(([campo]) => campos.has(campo)))
}

// ── Canal email de cobranza (CAR §18.4, GAP-CAR-005) ────────────────────

/**
 * Validación deliberadamente laxa: un `algo@algo.dominio` sin espacios.
 * La validez real de un correo solo la conoce el servidor que lo recibe, y
 * el rebote queda registrado como acuse (§34.2). Rechazar aquí direcciones
 * raras pero válidas sería peor: dejaría al deudor sin notificar por una
 * regla nuestra, no del mundo.
 */
export function esEmailValido(valor: string): boolean {
  const limpio = valor.trim()
  if (limpio.length === 0 || limpio.length > 254) return false
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(limpio)
}

/**
 * HTML → texto legible. El expediente probatorio y la bandeja muestran lo
 * que se envió; para SMS eso es el texto tal cual, pero para correo lo
 * enviado es HTML y la plantilla es editable por quien administra.
 *
 * Se deriva texto en vez de renderizar el HTML en la pantalla por dos
 * razones: el expediente se imprime (un iframe no imprime de forma
 * fiable) y ese HTML sale de la base de datos — pintarlo con v-html sería
 * ejecutar en la sesión del administrador lo que alguien guardó en una
 * plantilla.
 *
 * Lo GUARDADO como prueba sigue siendo el HTML íntegro: esto es solo una
 * vista legible, no la evidencia.
 */
export function htmlATextoPlano(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split('\n')
    .map((linea) => linea.trim())
    // Colapsa los saltos consecutivos que deja el maquetado, pero deja
    // uno: los párrafos del mensaje se leen separados, como se enviaron.
    .filter((linea, indice, todas) => linea.length > 0 || (todas[indice - 1] ?? '').length > 0)
    .join('\n')
    .trim()
}

/**
 * Correo de cobranza por defecto — el que se envía cuando la copropiedad
 * no ha escrito el suyo en `email_templates`. Existe para que encender el
 * canal no exija redactar HTML: mismo criterio que la configuración
 * sugerida de §8.4/§9.4.
 *
 * Decisiones de contenido que no son estéticas:
 *
 * · El ASUNTO no menciona mora ni deuda. El estado de cartera es dato
 *   personal (Ley 1266); el asunto se ve en la notificación del teléfono,
 *   a la vista de cualquiera que pase por al lado.
 * · Sin adjuntos y sin imágenes externas: renderiza igual con imágenes
 *   bloqueadas y no filtra aperturas a terceros (Ley 1581).
 * · Tono informativo, no conminatorio: esto lo dispara un job automático
 *   sobre un saldo que puede estar equivocado, y hay una línea explícita
 *   para el caso de que el pago ya se hizo.
 * · No anuncia intereses, sanciones ni acciones jurídicas: eso depende de
 *   reglamento y asamblea, y AP-02/AP-03 prohíben inventarlos.
 * · Tablas con estilos inline y ≤600px, como todo transaccional: los
 *   clientes de correo ignoran flex, grid y <style> en el head.
 */
export const CORREO_COBRANZA_POR_DEFECTO: { subject: string; htmlContent: string } = {
  subject: 'Estado de su cuenta — {{ params.inmueble }}',
  htmlContent: `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;border:1px solid #e4e4e7;">
  <tr><td style="background:#1e3a5f;color:#ffffff;padding:18px 24px;border-radius:8px 8px 0 0;font-size:16px;font-weight:bold;">{{ params.copropiedad }}</td></tr>
  <tr><td style="padding:24px;">
    <p style="margin:0 0 16px;font-size:14px;color:#3f3f46;line-height:1.5;">Cordial saludo, {{ params.nombreResidente }}.</p>
    <p style="margin:0 0 20px;font-size:14px;color:#3f3f46;line-height:1.5;">Le escribimos para informarle que su cuenta de administración registra un saldo pendiente. A continuación el detalle:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:20px;">
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e4e4e7;font-size:13px;color:#52525b;">Inmueble</td>
        <td align="right" style="padding:10px 12px;border-bottom:1px solid #e4e4e7;font-size:13px;color:#18181b;font-weight:bold;">{{ params.inmueble }}</td>
      </tr>
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e4e4e7;font-size:13px;color:#52525b;">Días transcurridos desde el vencimiento</td>
        <td align="right" style="padding:10px 12px;border-bottom:1px solid #e4e4e7;font-size:13px;color:#18181b;">{{ params.diasMora }}</td>
      </tr>
      <tr>
        <td style="padding:14px 12px;font-size:14px;color:#52525b;">Saldo pendiente</td>
        <td align="right" style="padding:14px 12px;font-size:22px;font-weight:bold;color:#7f1d1d;">{{ params.saldoPendiente }}</td>
      </tr>
    </table>
    <p style="margin:0 0 16px;font-size:14px;color:#3f3f46;line-height:1.5;">Le agradecemos ponerse al día o comunicarse con la administración para acordar una alternativa de pago. Estamos atentos a atenderle.</p>
    <hr style="border:none;border-top:1px solid #e4e4e7;margin:20px 0;">
    <p style="margin:0 0 6px;font-size:11px;color:#a1a1aa;line-height:1.5;">Si ya realizó el pago, le pedimos hacer caso omiso de este mensaje: es posible que aún no estuviera registrado al momento de generarlo.</p>
    <p style="margin:0;font-size:11px;color:#a1a1aa;line-height:1.5;">Recibe este correo como copropietario o residente registrado de {{ params.copropiedad }}. Para actualizar sus datos de contacto, comuníquese con la administración.</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`,
}
