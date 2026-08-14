// E7 · GAP-12 (PROMPT_MAESTRO_FASE1.md §15.1) — rate limiting en Postgres,
// no Upstash. `enforceRateLimit` se llama al inicio de cada Edge Function,
// antes de cualquier efecto secundario (antes del envío por Brevo en
// invite-user) — un request bloqueado nunca llega a disparar ese efecto.
//
// Tipo estructural mínimo en vez de importar el tipo exacto de
// ctx.supabase (@supabase/server no expone un nombre de tipo documentado
// para él) — cualquier cliente con `.rpc()` compatible sirve.
import { errorResponse } from './http.ts'
import { logEvent } from './logger.ts'

interface ClienteConRpc {
  rpc(
    fn: 'check_rate_limit',
    args: { p_bucket: string; p_max_hits: number; p_window: string },
  ): PromiseLike<{ data: boolean | null; error: { message: string } | null }>
}

export async function enforceRateLimit(
  cliente: ClienteConRpc,
  bucket: string,
  maxHits: number,
  ventana: string,
  correlationId: string,
): Promise<Response | null> {
  const { data: permitido, error } = await cliente.rpc('check_rate_limit', {
    p_bucket: bucket,
    p_max_hits: maxHits,
    p_window: ventana,
  })

  if (error) {
    logEvent({
      level: 'error',
      action: 'rate_limit.check_failed',
      correlationId,
      message: error.message,
      meta: { bucket },
    })
    return errorResponse(500, 'INTERNAL_ERROR', `check_rate_limit: ${error.message}`, undefined, correlationId)
  }
  if (!permitido) {
    logEvent({ level: 'warn', action: 'security.rate_limited', correlationId, meta: { bucket, max_hits: maxHits } })
    return errorResponse(
      429,
      'RATE_LIMITED',
      'Demasiados intentos. Vuelve a intentarlo más tarde.',
      undefined,
      correlationId,
    )
  }
  return null
}
