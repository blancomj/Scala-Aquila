// Conceptos avanzados Fase 4 — apaga una novedad permanente, o una
// prorrateable con saldo pendiente (al menos una cuota sin generar): deja de
// generar cargos/cuotas futuros (fn_generar_cargos_novedades_periodo), sin
// tocar los ya generados (append-only). Exige una observación (mismo criterio
// que rechazar-novedad). Mismo patrón exacto que aprobar-novedad: novedades
// no tiene política UPDATE para `authenticated`, así que el rol se verifica
// aquí explícitamente antes de usar ctx.supabaseAdmin.
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
      `inhabilitar_novedad:${actorId}`,
      RATE_LIMIT_MAX_HITS,
      RATE_LIMIT_VENTANA,
      correlationId,
    )
    if (bloqueo) return bloqueo

    // Lectura RLS-scoped: solo ve la novedad si es miembro de ese tenant
    // (novedades_select_agent_auditor) — nunca se confía en un tenant_id
    // enviado por el cliente.
    const { data: novedad, error: errorNovedad } = await ctx.supabase
      .from('novedades')
      .select('id, tenant_id')
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
      p_roles: ['auxiliar'],
    })
    if (errorRol) {
      return errorResponse(500, 'INTERNAL_ERROR', errorRol.message, undefined, correlationId)
    }
    if (!esAgent) {
      return errorResponse(
        403,
        'FORBIDDEN',
        'Solo un auxiliar puede inhabilitar novedades.',
        undefined,
        correlationId,
      )
    }

    const { data: inhabilitada, error: errorRpc } = await ctx.supabaseAdmin
      .rpc('fn_inhabilitar_novedad', { p_novedad_id: novedadId, p_actor_id: actorId, p_motivo: motivo })
      .single()
    if (errorRpc) {
      const { code, message } = parsearErrorRpc(errorRpc.message)
      const status = code === 'NOVEDAD_NO_ENCONTRADA' ? 404 : 409
      logEvent({
        level: 'warn',
        action: 'inhabilitar_novedad.rpc_error',
        correlationId,
        actorId,
        meta: { code },
      })
      return errorResponse(status, code, message, undefined, correlationId)
    }

    logEvent({
      level: 'info',
      action: 'inhabilitar_novedad.completada',
      correlationId,
      actorId,
      tenantId: novedad.tenant_id,
      meta: { novedadId },
    })

    return jsonResponse(inhabilitada, 200, correlationId)
  }),
}
