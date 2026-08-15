// PROMPT_MAESTRO_FASE1.md §8, §9.2 — accept-invitation.
//
// Dos pasos, en dos sistemas distintos (no atómicos entre sí, es una
// limitación real de la arquitectura de Supabase, no una elección):
//   1. RPC accept_invitation() — transacción única en `public`: marca la
//      invitación aceptada, crea/reactiva la membership, fija
//      active_tenant_id, audita.
//   2. auth.admin.updateUserById(..., { email_confirm: true }) — AD-11,
//      marca el email verificado. Vive en `auth`, gestionado por el
//      servidor de Auth de Supabase, no por una transacción SQL propia;
//      requiere service_role (ctx.supabaseAdmin) — primer uso real de
//      service_role en este proyecto (los demás RPC son SECURITY DEFINER
//      pero corren con el JWT del usuario, no con la clave de servicio).
// Si el paso 2 falla después de que el paso 1 ya tuvo éxito, la membership
// ya quedó creada (lo importante) — el email simplemente no queda marcado
// como verificado, una inconsistencia menor y recuperable.
import { withSupabase } from '@supabase/server'
import { z } from 'zod'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse, parsearErrorRpc } from '../_shared/http.ts'
import { logEvent } from '../_shared/logger.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'
import { hashToken } from '../_shared/tokens.ts'

const RATE_LIMIT_MAX_HITS = 10
const RATE_LIMIT_VENTANA = '1 hour'

const payloadSchema = z.object({
  token: z.string().trim().min(1, 'Token requerido.'),
})

export default {
  fetch: withSupabase<Database>({ auth: 'user' }, async (req, ctx) => {
    const correlationId = crypto.randomUUID()
    const actorId = ctx.userClaims?.id ?? null

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
        undefined,
        correlationId,
      )
    }

    const bloqueo = await enforceRateLimit(
      ctx.supabase,
      `accept_invitation:${actorId}`,
      RATE_LIMIT_MAX_HITS,
      RATE_LIMIT_VENTANA,
      correlationId,
    )
    if (bloqueo) return bloqueo

    // Nunca se loguea el token en sí (§11.2) — ni siquiera su hash, para no
    // dar ninguna pista útil sobre el valor original.
    const tokenHash = await hashToken(parseo.data.token)

    const { data, error: errorAceptar } = await ctx.supabase
      .rpc('accept_invitation', { p_token_hash: tokenHash })
      .single()

    if (errorAceptar) {
      const { code, message } = parsearErrorRpc(errorAceptar.message)
      logEvent({
        level: 'warn',
        action: 'accept_invitation.rpc_error',
        correlationId,
        actorId,
        meta: { code },
      })
      const status = code === 'INV_NOT_FOUND' ? 404 : code === 'UNAUTHENTICATED' ? 401 : 409
      return errorResponse(status, code, message, undefined, correlationId)
    }
    if (!data) {
      logEvent({ level: 'error', action: 'accept_invitation.no_row', correlationId, actorId })
      return errorResponse(
        500,
        'INTERNAL_ERROR',
        'accept_invitation no devolvió una fila.',
        undefined,
        correlationId,
      )
    }

    if (actorId) {
      const { error: errorConfirmar } = await ctx.supabaseAdmin.auth.admin.updateUserById(actorId, {
        email_confirm: true,
      })
      if (errorConfirmar) {
        logEvent({
          level: 'error',
          action: 'accept_invitation.email_confirm_failed',
          correlationId,
          actorId,
          tenantId: data.out_tenant_id,
          message: errorConfirmar.message,
        })
      }
    }

    // accept_invitation() devuelve out_tenant_id/out_role (nombres de
    // columna de salida distintos a propósito — evitan colisión con
    // memberships.tenant_id/.role dentro de la función, ver
    // 20260814140100_accept_invitation_fix_ambiguous_column.sql). El
    // contrato de la Edge Function (§8) sigue siendo { tenant_id, role }.
    return jsonResponse({ tenant_id: data.out_tenant_id, role: data.out_role }, 200, correlationId)
  }),
}
