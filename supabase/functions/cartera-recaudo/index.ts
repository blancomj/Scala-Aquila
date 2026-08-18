// Dashboard de Cartera (frontend, 2026-08-17) — "Recaudo del mes".
// Reutiliza obtenerRawIndicadoresGestion() (fn_indicadores_gestion,
// 20260823110000) directamente — a propósito NO pasa por cartera-
// indicadores, que gatea TODA la respuesta en que exista snapshot en
// fecha_desde Y fecha_hasta para Roll/Cure Rate (422 si falta uno).
// fn_indicadores_gestion no toca posiciones_cartera_snapshot en
// absoluto — acoplarla a ese gate habría sido innecesariamente frágil
// para un dashboard que siempre debe cargar (REC-CAR-004: se reutiliza
// el lector existente, no se reimplementa el cálculo, pero tampoco se
// hereda una dependencia que no aplica).
import { withSupabase } from '@supabase/server'
import { z } from 'zod'
// dist/index.js (compilado), no src/index.ts — mismo motivo que el
// resto de Edge Functions de cartera.
import { obtenerRawIndicadoresGestion } from '../../../packages/liquidation-engine/dist/index.js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse } from '../_shared/http.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 60
const RATE_LIMIT_VENTANA = '1 hour'

const payloadSchema = z
  .object({
    tenant_id: z.string().uuid(),
    fecha_desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha_desde debe ser YYYY-MM-DD.'),
    fecha_hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha_hasta debe ser YYYY-MM-DD.'),
  })
  .refine((p) => p.fecha_desde < p.fecha_hasta, {
    message: 'fecha_desde debe ser anterior a fecha_hasta.',
    path: ['fecha_desde'],
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
    const { tenant_id: tenantId, fecha_desde: fechaDesde, fecha_hasta: fechaHasta } = parseo.data

    const bloqueo = await enforceRateLimit(
      ctx.supabase,
      `cartera_recaudo:${actorId}`,
      RATE_LIMIT_MAX_HITS,
      RATE_LIMIT_VENTANA,
      correlationId,
    )
    if (bloqueo) return bloqueo

    const { data: esMiembro, error: errorMembresia } = await ctx.supabase.rpc('is_member', { p_tenant: tenantId })
    if (errorMembresia) {
      return errorResponse(500, 'INTERNAL_ERROR', errorMembresia.message, undefined, correlationId)
    }
    if (!esMiembro) {
      return errorResponse(403, 'FORBIDDEN', 'No eres miembro de este tenant.', undefined, correlationId)
    }

    const { data: tenant, error: errorTenant } = await ctx.supabase
      .from('tenants')
      .select('moneda')
      .eq('id', tenantId)
      .maybeSingle()
    if (errorTenant) {
      return errorResponse(500, 'INTERNAL_ERROR', errorTenant.message, undefined, correlationId)
    }
    if (!tenant) {
      return errorResponse(404, 'TENANT_NO_ENCONTRADO', 'El tenant no existe o no es accesible.', undefined, correlationId)
    }

    const raw = await obtenerRawIndicadoresGestion(ctx.supabase, {
      tenantId,
      fechaDesde,
      fechaHasta,
      moneda: tenant.moneda,
    })

    return jsonResponse(
      {
        fechaDesde,
        fechaHasta,
        montoRecaudado: raw.montoRecuperadoPeriodo.amount.toString(),
      },
      200,
      correlationId,
    )
  }),
}
