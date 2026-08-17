/**
 * Configuración de plantillas de correo transaccional sincronizadas con
 * Brevo — fuente única de verdad, mismo patrón que sms.ts: un solo
 * archivo, sin imports relativos internos (Deno lo importa directo desde
 * las Edge Functions, igual que database.generated.ts).
 *
 * Reutiliza los mismos event_type que SMS_FIELD_REGISTRY (sms.ts) — mismo
 * evento de negocio, canal distinto. El registro de campos es
 * independiente: el correo admite más variables que el SMS del mismo
 * evento. Ninguno de estos eventos tiene todavía un disparador real (el
 * worker de F4 solo dispara SMS hoy) — los campos son provisionales hasta
 * que exista ese disparador de correo.
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
  cartera_pago_vencido: [
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
