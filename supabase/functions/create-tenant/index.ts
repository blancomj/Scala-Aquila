// PROMPT_MAESTRO_FASE1.md §8 — contrato: valida JWT → valida payload (Zod) →
// verifica permiso → ejecuta → registra en audit_log → responde.
//
// D-18/D-19: la parte "ejecuta" delega en la RPC `create_tenant()`
// (supabase/migrations/20260814120000_tenancy_rpc.sql), que ya hace el
// insert atómico de tenant + membership(agent) + active_tenant_id y su
// propio registro en audit_log ('tenant.created', 'membership.created').
// Esta función es la capa de validación/contrato que pide AD-05, usando el
// cliente del propio usuario (ctx.supabase, RLS aplica) — no hace falta
// service_role porque la RPC ya es SECURITY DEFINER y controla todo lo que
// inserta.
import { withSupabase } from '@supabase/server'
import { z } from 'zod'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse, parsearErrorRpc } from '../_shared/http.ts'
import { logEvent } from '../_shared/logger.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 10
const RATE_LIMIT_VENTANA = '1 hour'

const payloadSchema = z.object({
  name: z.string().trim().min(1, 'El nombre no puede estar vacío.'),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])$/,
      'El slug debe ser minúsculas, números y guiones (3-50 caracteres).',
    ),
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
      logEvent({
        level: 'warn',
        action: 'create_tenant.invalid_payload',
        correlationId,
        actorId,
        meta: { issues: parseo.error.issues },
      })
      return errorResponse(
        400,
        'SLUG_INVALID',
        parseo.error.issues[0]?.message ?? 'Payload inválido.',
        { issues: parseo.error.issues },
        correlationId,
      )
    }

    const { name, slug } = parseo.data

    const bloqueo = await enforceRateLimit(
      ctx.supabase,
      `create_tenant:${actorId}`,
      RATE_LIMIT_MAX_HITS,
      RATE_LIMIT_VENTANA,
      correlationId,
    )
    if (bloqueo) return bloqueo

    // create_tenant() devuelve una fila compuesta (isSetofReturn: false), no
    // un arreglo — sin .single(), que espera envolver/desenvolver un array.
    const { data: tenant, error: errorCrear } = await ctx.supabase.rpc('create_tenant', {
      p_name: name,
      p_slug: slug,
    })

    if (errorCrear) {
      const { code, message } = parsearErrorRpc(errorCrear.message)
      logEvent({
        level: 'warn',
        action: 'create_tenant.rpc_error',
        correlationId,
        actorId,
        meta: { code, slug },
      })
      const status = code === 'SLUG_TAKEN' || code === 'SLUG_INVALID' ? 409 : 400
      return errorResponse(status, code, message, undefined, correlationId)
    }
    if (!tenant) {
      logEvent({ level: 'error', action: 'create_tenant.no_row', correlationId, actorId })
      return errorResponse(
        500,
        'INTERNAL_ERROR',
        'create_tenant no devolvió una fila.',
        undefined,
        correlationId,
      )
    }

    const { data: membership, error: errorMembership } = await ctx.supabase
      .from('memberships')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('user_id', actorId ?? '')
      .single()

    if (errorMembership) {
      // El tenant y la membership ya se crearon (RPC exitosa); esto es solo
      // el fetch de confirmación fallando — no se revierte nada.
      logEvent({
        level: 'error',
        action: 'create_tenant.membership_fetch_failed',
        correlationId,
        actorId,
        tenantId: tenant.id,
        message: errorMembership.message,
      })
      return errorResponse(
        500,
        'MEMBERSHIP_FETCH_FAILED',
        errorMembership.message,
        undefined,
        correlationId,
      )
    }

    return jsonResponse({ tenant, membership }, 200, correlationId)
  }),
}
