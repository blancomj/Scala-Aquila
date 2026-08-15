// E4 — rechaza una novedad pendiente (sin efecto financiero). Igual que
// aprobar-novedad, novedades no tiene política UPDATE para `authenticated`
// — el rol se verifica aquí antes de usar ctx.supabaseAdmin.
import { withSupabase } from '@supabase/server'
import { z } from 'zod'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse, parsearErrorRpc } from '../_shared/http.ts'
import { logEvent } from '../_shared/logger.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 30
const RATE_LIMIT_VENTANA = '1 hour'

const payloadSchema = z.object({
  novedad_id: z.string().uuid(),
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
    const { novedad_id: novedadId, motivo } = parseo.data

    const bloqueo = await enforceRateLimit(
      ctx.supabase,
      `rechazar_novedad:${actorId}`,
      RATE_LIMIT_MAX_HITS,
      RATE_LIMIT_VENTANA,
      correlationId,
    )
    if (bloqueo) return bloqueo

    const { data: novedad, error: errorNovedad } = await ctx.supabase
      .from('novedades')
      .select('id, tenant_id, estado')
      .eq('id', novedadId)
      .maybeSingle()
    if (errorNovedad) {
      return errorResponse(500, 'INTERNAL_ERROR', errorNovedad.message, undefined, correlationId)
    }
    if (!novedad) {
      return errorResponse(
        404,
        'NOVEDAD_NO_ENCONTRADA',
        'La novedad no existe o no es accesible.',
        undefined,
        correlationId,
      )
    }

    const { data: esAgent, error: errorRol } = await ctx.supabase.rpc('has_role', {
      p_tenant: novedad.tenant_id,
      p_roles: ['agent'],
    })
    if (errorRol) {
      return errorResponse(500, 'INTERNAL_ERROR', errorRol.message, undefined, correlationId)
    }
    if (!esAgent) {
      return errorResponse(
        403,
        'FORBIDDEN',
        'Solo un agent puede rechazar novedades.',
        undefined,
        correlationId,
      )
    }

    if (novedad.estado !== 'pendiente') {
      return errorResponse(
        409,
        'NOVEDAD_NO_PENDIENTE',
        `La novedad está en estado "${novedad.estado}", no "pendiente".`,
        undefined,
        correlationId,
      )
    }

    const { data: rechazada, error: errorRpc } = await ctx.supabaseAdmin
      .rpc('fn_rechazar_novedad', { p_novedad_id: novedadId, p_motivo: motivo })
      .single()
    if (errorRpc) {
      const { code, message } = parsearErrorRpc(errorRpc.message)
      const status = code === 'NOVEDAD_NO_ENCONTRADA' ? 404 : 409
      return errorResponse(status, code, message, undefined, correlationId)
    }

    logEvent({
      level: 'info',
      action: 'rechazar_novedad.completada',
      correlationId,
      actorId,
      tenantId: novedad.tenant_id,
      meta: { novedadId },
    })

    return jsonResponse(rechazada, 200, correlationId)
  }),
}
