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
import { enforceRateLimit } from '../_shared/rate_limit.ts'
import { hashToken } from '../_shared/tokens.ts'

const RATE_LIMIT_MAX_HITS = 10
const RATE_LIMIT_VENTANA = '1 hour'

const payloadSchema = z.object({
  token: z.string().trim().min(1, 'Token requerido.'),
})

export default {
  fetch: withSupabase<Database>({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') {
      return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Solo POST.')
    }

    let payload: unknown
    try {
      payload = await req.json()
    } catch {
      return errorResponse(400, 'INVALID_PAYLOAD', 'El cuerpo debe ser JSON válido.')
    }

    const parseo = payloadSchema.safeParse(payload)
    if (!parseo.success) {
      return errorResponse(400, 'INVALID_PAYLOAD', parseo.error.issues[0]?.message ?? 'Payload inválido.')
    }

    const bloqueo = await enforceRateLimit(
      ctx.supabase,
      `accept_invitation:${ctx.userClaims?.id}`,
      RATE_LIMIT_MAX_HITS,
      RATE_LIMIT_VENTANA,
    )
    if (bloqueo) return bloqueo

    const tokenHash = await hashToken(parseo.data.token)

    const { data, error: errorAceptar } = await ctx.supabase
      .rpc('accept_invitation', { p_token_hash: tokenHash })
      .single()

    if (errorAceptar) {
      const { code, message } = parsearErrorRpc(errorAceptar.message)
      const status = code === 'INV_NOT_FOUND' ? 404 : code === 'UNAUTHENTICATED' ? 401 : 409
      return errorResponse(status, code, message)
    }
    if (!data) {
      return errorResponse(500, 'INTERNAL_ERROR', 'accept_invitation no devolvió una fila.')
    }

    const usuarioId = ctx.userClaims?.id
    if (usuarioId) {
      const { error: errorConfirmar } = await ctx.supabaseAdmin.auth.admin.updateUserById(usuarioId, {
        email_confirm: true,
      })
      if (errorConfirmar) {
        // eslint-disable-next-line no-console -- diagnóstico server-side, no bloquea la respuesta (ver comentario de arriba).
        console.error('[accept-invitation] no se pudo marcar email_confirm', errorConfirmar)
      }
    }

    // accept_invitation() devuelve out_tenant_id/out_role (nombres de
    // columna de salida distintos a propósito — evitan colisión con
    // memberships.tenant_id/.role dentro de la función, ver
    // 20260814140100_accept_invitation_fix_ambiguous_column.sql). El
    // contrato de la Edge Function (§8) sigue siendo { tenant_id, role }.
    return jsonResponse({ tenant_id: data.out_tenant_id, role: data.out_role })
  }),
}
