// E7 · observabilidad — logging estructurado JSON (PROMPT_MAESTRO_FASE1.md
// §11.2), mismo formato que supabase/functions/_shared/logger.ts.
//
// NUNCA en `meta`: password, JWT, refresh token, token de invitación,
// service_role key, query string de /invite (§11.2, letra explícita).
export type NivelLog = 'info' | 'warn' | 'error'

export interface EventoLog {
  level: NivelLog
  action: string
  correlationId: string
  tenantId?: string | null
  actorId?: string | null
  message?: string
  meta?: Record<string, unknown>
}

export function logEvent(evento: EventoLog): void {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), ...evento }))
}
