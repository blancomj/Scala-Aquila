/**
 * Compositor de correo flotante — registro de campos y validación.
 *
 * Usa el mismo motor de placeholders que email.ts (sintaxis `{{ params.campo }}`),
 * pero con un registro propio de campos (no depende de event_type).
 *
 * La validación reutiliza validateTemplateBodyAgainstRegistry() de email.ts
 * — misma lógica, registro distinto.
 */

import {
  type EmailFieldDef,
  validateTemplateBodyAgainstRegistry,
} from './email.js'
import { COMPOSITOR_FIELD_REGISTRY } from './compositor-registry.js'

export { COMPOSITOR_FIELD_REGISTRY }

// ── Registro de campos del compositor ─────────────────────────────────

// ── Validación ────────────────────────────────────────────────────────

/**
 * Valida asunto + cuerpo del compositor contra COMPOSITOR_FIELD_REGISTRY.
 * Lanza EmailValidationError si hay campos desconocidos, prefijo faltante,
 * o contenido demasiado corto.
 */
export function validateCompositorBody(subject: string, htmlContent: string): void {
  validateTemplateBodyAgainstRegistry(
    [...COMPOSITOR_FIELD_REGISTRY] as EmailFieldDef[],
    subject,
    htmlContent,
    'COMPOSITOR',
  )
}

// ── Renderizado de vista previa ───────────────────────────────────────

/**
 * Renderiza una plantilla del compositor con datos reales del destinatario
 * (vista previa sin llamada de red). Reutiliza renderEmailTemplate de email.ts.
 */
export function renderCompositorPreview(
  subject: string,
  htmlContent: string,
  params: Record<string, string>,
): { subject: string; html: string } {
  const PARAM_PATTERN = /\{\{\s*params\.(\w+)\s*\}\}/g
  const render = (text: string) => text.replace(PARAM_PATTERN, (_match, key: string) => params[key] ?? _match)
  return { subject: render(subject), html: render(htmlContent) }
}
