// PROMPT_MAESTRO_FASE1.md §8, §9.2 — revoke-invitation: envoltorio delgado
// sobre revoke_invitation() (revoke_invitation ya valida el rol agent y el
// estado 'pending' — la Edge Function solo valida forma y traduce errores).
import { withSupabase } from '@supabase/server'
import { z } from 'zod'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, parsearErrorRpc } from '../_shared/http.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 30
const RATE_LIMIT_VENTANA = '1 hour'

const payloadSchema = z.object({
  invitation_id: z.string().uuid(),
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
      `revoke_invitation:${ctx.userClaims?.id}`,
      RATE_LIMIT_MAX_HITS,
      RATE_LIMIT_VENTANA,
    )
    if (bloqueo) return bloqueo

    const { error: errorRevocar } = await ctx.supabase.rpc('revoke_invitation', {
      p_invitation_id: parseo.data.invitation_id,
    })

    if (errorRevocar) {
      const { code, message } = parsearErrorRpc(errorRevocar.message)
      const status = code === 'INV_NOT_FOUND' ? 404 : code === 'FORBIDDEN' ? 403 : 409
      return errorResponse(status, code, message)
    }

    return Response.json({ ok: true })
  }),
}
