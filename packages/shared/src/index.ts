export type { Database, Json } from './database.generated.js'
export { crearClienteAquila, type AquilaClient } from './client.js'
export { ERROR_CODES, type ErrorCode } from './error-codes.js'
export {
  SMS_FIELD_REGISTRY,
  SMS_ACTIVE_EVENT_TYPES,
  SMS_EVENT_RECIPIENTS,
  SMS_EVENT_LABELS,
  SMS_RECIPIENT_LABELS,
  type SmsFieldDef,
  type SmsRecipientType,
  renderSmsTemplate,
  extraerCamposPlantilla,
  calculateSmsSegments,
  type SmsSegmentInfo,
  PHONE_RE,
  esTelefonoValido,
  validateSmsTemplateBody,
  SmsValidationError,
} from './sms.js'
export { numeroEnteroALetras, montoEnLetras } from './numero-a-letras.js'
export {
  EMAIL_FIELD_REGISTRY,
  EMAIL_ACTIVE_EVENT_TYPES,
  EMAIL_EVENT_LABELS,
  type EmailFieldDef,
  renderEmailTemplate,
  extraerCamposPlantillaEmail,
  extraerCamposSinPrefijo,
  validateEmailTemplateBody,
  filtrarOverridesValidos,
  EmailValidationError,
  esEmailValido,
  htmlATextoPlano,
  CORREO_COBRANZA_POR_DEFECTO,
} from './email.js'
