// E6 — editar nombre/teléfono/estado de OTRO miembro del tenant.
//
// guard_privileged_columns (SEC-06, 20260813190400_triggers.sql) bloquea
// cualquier UPDATE de profiles.status salvo que auth.uid() sea null — vale
// incluso dentro de un RPC SECURITY DEFINER llamado con el JWT del usuario,
// porque auth.uid() lee un GUC de sesión, no el modo definer/invoker. Por
// eso el flujo acá tiene DOS pasos con DOS clientes distintos:
//   1. ctx.supabase (JWT del actor) — valida con has_role() que el actor es
//      agent/administrador del tenant dueño de la membership. auth.uid() no
//      es null acá, así que este paso no podría tocar profiles.status.
//   2. ctx.supabaseAdmin (service_role) — recién acá se invoca
//      admin_actualizar_perfil_miembro, que corre con auth.uid() = null y
//      por eso el trigger la deja pasar. Esa función no vuelve a chequear el
//      rol (no puede, auth.uid() es null) — confía en que el paso 1 ya lo
//      validó, y por eso está revocada para cualquiera que no sea service_role.
import { withSupabase } from '@supabase/server'
import { z } from 'zod'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse, parsearErrorRpc } from '../_shared/http.ts'
import { logEvent } from '../_shared/logger.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 30
const RATE_LIMIT_VENTANA = '1 hour'

const payloadSchema = z.object({
  membership_id: z.string().uuid(),
  full_name: z.string().trim().min(1, 'El nombre no puede estar vacío.'),
  phone: z.string().trim(),
  status: z.enum(['active', 'suspended']),
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
        { issues: parseo.error.issues },
        correlationId,
      )
    }
    const { membership_id: membershipId, full_name: fullName, phone, status } = parseo.data

    const bloqueo = await enforceRateLimit(
      ctx.supabase,
      `update_member_profile:${actorId}`,
      RATE_LIMIT_MAX_HITS,
      RATE_LIMIT_VENTANA,
      correlationId,
    )
    if (bloqueo) return bloqueo

    // RLS ya scopea esta lectura a memberships que el actor puede ver
    // (misma copropiedad) — si no la ve, tenantId sale null y el has_role
    // de abajo falla igual.
    const { data: membership, error: errorMembership } = await ctx.supabase
      .from('memberships')
      .select('tenant_id')
      .eq('id', membershipId)
      .maybeSingle()
    if (errorMembership || !membership) {
      return errorResponse(
        404,
        'MEMBERSHIP_NOT_FOUND',
        'Membresía no encontrada.',
        undefined,
        correlationId,
      )
    }

    const { data: autorizado, error: errorHasRole } = await ctx.supabase.rpc('has_role', {
      p_tenant: membership.tenant_id,
      p_roles: ['auxiliar'],
    })
    if (errorHasRole || !autorizado) {
      logEvent({
        level: 'warn',
        action: 'update_member_profile.forbidden',
        correlationId,
        actorId,
        tenantId: membership.tenant_id,
      })
      return errorResponse(
        403,
        'FORBIDDEN',
        'Se requiere rol agent en la copropiedad.',
        undefined,
        correlationId,
      )
    }

    const { data: profile, error: errorActualizar } = await ctx.supabaseAdmin.rpc(
      'admin_actualizar_perfil_miembro',
      {
        p_membership_id: membershipId,
        p_actor_id: actorId,
        p_full_name: fullName,
        p_phone: phone,
        p_status: status,
      },
    )

    if (errorActualizar) {
      const { code, message } = parsearErrorRpc(errorActualizar.message)
      logEvent({
        level: 'warn',
        action: 'update_member_profile.rpc_error',
        correlationId,
        actorId,
        tenantId: membership.tenant_id,
        meta: { code },
      })
      const httpStatus =
        code === 'MEMBERSHIP_NOT_FOUND' ? 404 : code === 'SELF_MODIFY' ? 400 : 409
      return errorResponse(httpStatus, code, message, undefined, correlationId)
    }
    if (!profile) {
      logEvent({
        level: 'error',
        action: 'update_member_profile.no_row',
        correlationId,
        actorId,
        tenantId: membership.tenant_id,
      })
      return errorResponse(
        500,
        'INTERNAL_ERROR',
        'admin_actualizar_perfil_miembro no devolvió una fila.',
        undefined,
        correlationId,
      )
    }

    return jsonResponse(
      {
        id: profile.id,
        full_name: profile.full_name,
        phone: profile.phone,
        status: profile.status,
      },
      200,
      correlationId,
    )
  }),
}
