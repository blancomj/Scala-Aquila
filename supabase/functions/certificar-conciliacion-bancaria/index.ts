// Fase 5 de la conciliación bancaria CONTABLE — D-113/D-115/D-116/D-117.
// Único camino a conciliacion_bancaria.estado='certificada' (D-CB-3, terminal — no se reabre).
// D-CB-4: certificar exige rol administrador, distinto del auxiliar que prepara (generar-
// conciliacion-bancaria) — segregación de funciones, mismo espíritu que FIN-3
// (aprobar_lote/ejecutar_lote) y el art. 48 de cartera.
import { withSupabase } from '@supabase/server'
import { z } from 'zod'
import {
  certificarConciliacionBancaria,
  ConciliacionBancariaNoEncontradaError,
  ConciliacionBancariaYaCertificadaError,
} from '../../../packages/liquidation-engine/dist/conciliacion-bancaria-supabase.js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse } from '../_shared/http.ts'
import { logEvent } from '../_shared/logger.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 20
const RATE_LIMIT_VENTANA = '1 hour'

const payloadSchema = z.object({
  tenant_id: z.string().uuid(),
  conciliacion_id: z.string().uuid(),
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
      return errorResponse(400, 'INVALID_PAYLOAD', 'El cuerpo debe ser JSON válido.', undefined, correlationId)
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
    const datos = parseo.data

    const bloqueo = await enforceRateLimit(
      ctx.supabase,
      `certificar_conciliacion_bancaria:${actorId}`,
      RATE_LIMIT_MAX_HITS,
      RATE_LIMIT_VENTANA,
      correlationId,
    )
    if (bloqueo) return bloqueo

    const { data: esAdministrador, error: errorRol } = await ctx.supabase.rpc('has_role', {
      p_tenant: datos.tenant_id,
      p_roles: ['administrador'],
    })
    if (errorRol) {
      return errorResponse(500, 'INTERNAL_ERROR', errorRol.message, undefined, correlationId)
    }
    if (!esAdministrador) {
      return errorResponse(
        403,
        'FORBIDDEN',
        'Solo un administrador puede certificar una conciliación bancaria.',
        undefined,
        correlationId,
      )
    }

    try {
      const resultado = await certificarConciliacionBancaria(ctx.supabaseAdmin, {
        tenantId: datos.tenant_id,
        conciliacionId: datos.conciliacion_id,
        actorId,
      })

      await ctx.supabaseAdmin.from('audit_log').insert({
        tenant_id: datos.tenant_id,
        actor_id: actorId,
        action: 'conciliacion_bancaria.certificada',
        entity_type: 'conciliacion_bancaria',
        entity_id: resultado.conciliacionId,
        metadata: {},
      })

      logEvent({
        level: 'info',
        action: 'certificar_conciliacion_bancaria.completado',
        correlationId,
        actorId,
        tenantId: datos.tenant_id,
        meta: { ...resultado },
      })

      return jsonResponse(resultado, 200, correlationId)
    } catch (excepcion) {
      if (excepcion instanceof ConciliacionBancariaNoEncontradaError) {
        return errorResponse(404, 'CONCILIACION_BANCARIA_NO_ENCONTRADA', excepcion.message, undefined, correlationId)
      }
      if (excepcion instanceof ConciliacionBancariaYaCertificadaError) {
        return errorResponse(409, 'CONCILIACION_BANCARIA_YA_CERTIFICADA', excepcion.message, undefined, correlationId)
      }
      const mensaje = excepcion instanceof Error ? excepcion.message : 'No se pudo certificar la conciliación.'
      logEvent({
        level: 'error',
        action: 'certificar_conciliacion_bancaria.fallido',
        correlationId,
        actorId,
        tenantId: datos.tenant_id,
        message: mensaje,
      })
      return errorResponse(500, 'INTERNAL_ERROR', mensaje, undefined, correlationId)
    }
  }),
}
