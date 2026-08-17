/**
 * Configuración de mensajería SMS transaccional — fuente única de verdad,
 * consumida tanto por el frontend (Nuxt, vía @aquila/shared) como por las
 * Edge Functions (Deno, import directo de este archivo por ruta relativa,
 * mismo patrón que database.generated.ts). Deliberadamente UN SOLO
 * archivo, sin imports relativos internos: Deno resuelve imports .ts a
 * .ts sin problema, pero el resto del paquete usa imports con extensión
 * .js (convención NodeNext de tsc) que Deno no reescribe — partir este
 * módulo en varios archivos que se importan entre sí rompería la carga
 * directa desde las Edge Functions (verificado localmente con `deno run`).
 *
 * Catálogo inicial del motor de cartera (recordatorio/mora/confirmación de
 * pago, acuerdo de pago). Ninguno de estos eventos tiene todavía un
 * disparador real en el código (el disparo de negocio queda fuera de
 * alcance de este módulo) — los campos se diseñaron a partir de las tablas
 * de dominio ya existentes (terceros, inmuebles, cuenta corriente) y son
 * provisionales hasta que exista ese disparador; ajustar este archivo no
 * afecta a nada más.
 */

// ── Registro de eventos ────────────────────────────────────────────────

export interface SmsFieldDef {
  field: string
  sample: string
}

export const SMS_FIELD_REGISTRY: Record<string, SmsFieldDef[]> = {
  cartera_recordatorio_pago: [
    { field: 'nombreResidente', sample: 'Ana María Gómez' },
    { field: 'inmueble', sample: 'Apto 302' },
    { field: 'saldoPendiente', sample: '$450.000' },
    { field: 'fechaVencimiento', sample: '5 de septiembre' },
  ],
  cartera_pago_vencido: [
    { field: 'nombreResidente', sample: 'Ana María Gómez' },
    { field: 'inmueble', sample: 'Apto 302' },
    { field: 'diasMora', sample: '12' },
    { field: 'saldoPendiente', sample: '$450.000' },
  ],
  cartera_pago_confirmado: [
    { field: 'nombreResidente', sample: 'Ana María Gómez' },
    { field: 'inmueble', sample: 'Apto 302' },
    { field: 'montoPagado', sample: '$450.000' },
    { field: 'fechaPago', sample: '3 de septiembre' },
  ],
  cartera_acuerdo_pago_creado: [
    { field: 'nombreResidente', sample: 'Ana María Gómez' },
    { field: 'inmueble', sample: 'Apto 302' },
    { field: 'cuotaMensual', sample: '$150.000' },
    { field: 'numeroCuotas', sample: '3' },
  ],
}

/** Eventos que el panel expone con editor e interruptor. */
export const SMS_ACTIVE_EVENT_TYPES: readonly string[] = [
  'cartera_recordatorio_pago',
  'cartera_pago_vencido',
  'cartera_pago_confirmado',
  'cartera_acuerdo_pago_creado',
]

/**
 * event_type → tipo de destinatario. No existe concepto de huésped/host en
 * este dominio: el destinatario real es un tercero (terceros.telefono)
 * vinculado al inmueble (residente) o a la copropiedad (administrador).
 */
export type SmsRecipientType = 'residente' | 'administrador_copropiedad'

export const SMS_EVENT_RECIPIENTS: Record<string, SmsRecipientType> = {
  cartera_recordatorio_pago: 'residente',
  cartera_pago_vencido: 'residente',
  cartera_pago_confirmado: 'residente',
  cartera_acuerdo_pago_creado: 'residente',
}

/** No hay sistema de i18n en el repo — mismo patrón que ESTADO_LABEL en pages/configuracion. */
export const SMS_EVENT_LABELS: Record<string, string> = {
  cartera_recordatorio_pago: 'Recordatorio de pago',
  cartera_pago_vencido: 'Pago vencido',
  cartera_pago_confirmado: 'Pago confirmado',
  cartera_acuerdo_pago_creado: 'Acuerdo de pago creado',
}

export const SMS_RECIPIENT_LABELS: Record<SmsRecipientType, string> = {
  residente: 'Residente',
  administrador_copropiedad: 'Administrador de la copropiedad',
}

// ── Renderizado ─────────────────────────────────────────────────────────

/**
 * Sintaxis de variable: una sola llave `{campo}`. Un campo sin valor deja
 * el marcador visible en vez de un hueco — en un SMS corto, un hueco es un
 * error silencioso; el marcador visible se ve y se corrige.
 */
export function renderSmsTemplate(body: string, params: Record<string, string>): string {
  return body.replace(/\{(\w+)\}/g, (match, key: string) => params[key] ?? match)
}

export function extraerCamposPlantilla(body: string): string[] {
  return [...body.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string)
}

// ── Segmentos ───────────────────────────────────────────────────────────

/**
 * Un solo carácter fuera de GSM-7 (una tilde, una "ñ") baja el límite de
 * 160 a 70 caracteres por segmento y duplica el costo del envío — de ahí
 * que el contador se calcule en vivo, con la misma función que alimentaría
 * el envío real.
 */
export interface SmsSegmentInfo {
  encoding: 'GSM-7' | 'UCS-2'
  segments: number
}

const GSM7_RE = /^[A-Za-z0-9 \-.,!?@'"():;/\n]*$/

export function calculateSmsSegments(body: string): SmsSegmentInfo {
  const isGsm7 = GSM7_RE.test(body)
  const limit = isGsm7 ? 160 : 70
  return { encoding: isGsm7 ? 'GSM-7' : 'UCS-2', segments: Math.max(1, Math.ceil(body.length / limit)) }
}

// ── Teléfono ────────────────────────────────────────────────────────────

/**
 * Exige el "+" del formato E.164: un número local de 10 dígitos tiene la
 * misma forma que un E.164 válido de otro país. Sin este requisito, el
 * error más frecuente (olvidar el indicativo) pasa de largo y falla recién
 * contra el proveedor, sin explicar nada.
 */
export const PHONE_RE = /^\+[1-9]\d{7,14}$/

export function esTelefonoValido(phone: string): boolean {
  return PHONE_RE.test(phone)
}

// ── Validación ──────────────────────────────────────────────────────────

/**
 * Validación compartida entre "guardar" y "probar" — una sola función, en
 * este orden exacto: evento conocido → longitud → campos desconocidos. El
 * tercer punto es el que evita el error más caro: copiar el texto de un
 * evento y pegarlo en otro — sin él, el marcador sobrante se envía
 * literal, al cliente, cobrado.
 */
const LONGITUD_MAXIMA = 480

export class SmsValidationError extends Error {
  code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

export function validateSmsTemplateBody(eventType: string, body: string): void {
  const campos = SMS_FIELD_REGISTRY[eventType]
  if (!campos) {
    throw new SmsValidationError('SMS_UNKNOWN_EVENT', `Evento desconocido: ${eventType}`)
  }

  if (body.length > LONGITUD_MAXIMA) {
    throw new SmsValidationError(
      'SMS_BODY_TOO_LONG',
      `El texto excede el máximo de ${String(LONGITUD_MAXIMA)} caracteres por ${String(body.length - LONGITUD_MAXIMA)}.`,
    )
  }

  const camposValidos = new Set(campos.map((c) => c.field))
  const desconocidos = [...new Set(extraerCamposPlantilla(body))].filter(
    (campo) => !camposValidos.has(campo),
  )
  if (desconocidos.length > 0) {
    throw new SmsValidationError(
      'SMS_UNKNOWN_FIELDS',
      `Campos desconocidos para este evento: ${desconocidos.join(', ')}`,
    )
  }
}
