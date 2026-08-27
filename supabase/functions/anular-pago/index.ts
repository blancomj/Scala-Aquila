// RC-2 — anula un pago (reversa append-only, ver
// 20260903130000_anulacion_pago.sql). pagos/pago_aplicaciones no tienen
// política INSERT para `authenticated` — el rol se verifica aquí antes de
// usar ctx.supabaseAdmin, mismo criterio que registrar-pago/rechazar-novedad.
import { withSupabase } from '@supabase/server'
import { z } from 'zod'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse, parsearErrorRpc } from '../_shared/http.ts'
import { logEvent } from '../_shared/logger.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 30
const RATE_LIMIT_VENTANA = '1 hour'

const payloadSchema = z.object({
  pago_id: z.string().uuid(),
  motivo: z.string().trim().min(1),
})

export default {
  fetch: withSupabase<Database>({ auth: 'user' }, async (req, ctx) => {
    const correlationId = crypto.randomUUID()
    const actorId = ctx.userClaims?.id ?? null
    if (!actorId) {
      return errorResponse(401, 'UNAUTHENTICATED', 'Sesión inválida.', undefined, correlationId)
    }

    if (req.method !== 'POST') {
      return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Solo POST.', undefined, correlationId)
    }

    let payload: unknown
    try {
      payload = await req.json()
    } catch {
      return errorResponse(
        400,
        'INVALID_PAYLOAD',
        'El cuerpo debe ser JSON válido.',
        undefined,
        correlationId,
      )
    }

    const parseo = payloadSchema.safeParse(payload)
    if (!parseo.success) {
      return errorResponse(
        400,
        'INVALID_PAYLOAD',
        parseo.error.issues[0]?.message ?? 'Payload inválido.',
        { issues: parseo.error.issues },
        correlationId,
      )
    }
    const { pago_id: pagoId, motivo } = parseo.data

    const bloqueo = await enforceRateLimit(
      ctx.supabase,
      `anular_pago:${actorId}`,
      RATE_LIMIT_MAX_HITS,
      RATE_LIMIT_VENTANA,
      correlationId,
    )
    if (bloqueo) return bloqueo

    // Lectura RLS-scoped: solo resuelve el pago si el usuario es miembro del
    // tenant dueño — nunca se confía en un tenant_id enviado por el cliente.
    const { data: pago, error: errorPago } = await ctx.supabase
      .from('pagos')
      .select('id, tenant_id, pago_original_id')
      .eq('id', pagoId)
      .maybeSingle()
    if (errorPago) {
      return errorResponse(500, 'INTERNAL_ERROR', errorPago.message, undefined, correlationId)
    }
    if (!pago) {
      return errorResponse(404, 'PAGO_NO_ENCONTRADO', 'El pago no existe.', undefined, correlationId)
    }
    if (pago.pago_original_id !== null) {
      return errorResponse(
        409,
        'ANULACION_NO_REVERSABLE',
        'Ese registro ya es en sí mismo la anulación de otro pago — no se anula una anulación.',
        undefined,
        correlationId,
      )
    }

    // Administrador ⊇ auxiliar (has_role, 20260830100000) — mismo criterio
    // que registrar-pago: registrar y anular un pago son la misma clase de
    // operación privilegiada.
    const { data: esAgent, error: errorRol } = await ctx.supabase.rpc('has_role', {
      p_tenant: pago.tenant_id,
      p_roles: ['auxiliar'],
    })
    if (errorRol) {
      return errorResponse(500, 'INTERNAL_ERROR', errorRol.message, undefined, correlationId)
    }
    if (!esAgent) {
      return errorResponse(
        403,
        'FORBIDDEN',
        'Solo un auxiliar o administrador de esta copropiedad puede anular un pago.',
        undefined,
        correlationId,
      )
    }

    // Único uso de service_role: pagos/pago_aplicaciones no tienen política
    // de INSERT para `authenticated` (ver cabecera). El rol ya se verificó
    // arriba, así que este bypass de RLS es intencional y acotado.
    const { data: reversaId, error: errorRpc } = await ctx.supabaseAdmin.rpc('fn_anular_pago', {
      p_pago_id: pagoId,
      p_motivo: motivo,
      p_actor_id: actorId,
    })
    if (errorRpc) {
      const { code, message } = parsearErrorRpc(errorRpc.message)
      const status =
        code === 'PAGO_NO_ENCONTRADO'
          ? 404
          : code === 'PAGO_YA_ANULADO' || code === 'ANULACION_NO_REVERSABLE'
            ? 409
            : code === 'PAGO_ANULACION_SIN_MOTIVO'
              ? 400
              : 500
      return errorResponse(status, code, message, undefined, correlationId)
    }

    logEvent({
      level: 'info',
      action: 'anular_pago.completada',
      correlationId,
      actorId,
      tenantId: pago.tenant_id,
      meta: { pagoId, reversaId },
    })

    return jsonResponse({ reversa_id: reversaId }, 200, correlationId)
  }),
}
