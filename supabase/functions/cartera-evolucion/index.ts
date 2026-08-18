// CAR F9 (parte 6, frontend) — Evolución mensual de cartera vencida
// (dashboard). Compone fn_evolucion_cartera_vencida (20260823150000) — no
// forma parte de §23.1/§23.2/§23.3 original, es una pieza nueva pedida al
// construir el frontend (2026-08-17).
//
// REC-CAR-004: la lectura vive en obtenerEvolucionCarteraVencida()
// (packages/liquidation-engine) — esta función solo la compone.
import { withSupabase } from '@supabase/server'
import { z } from 'zod'
// dist/index.js (compilado), no src/index.ts — mismo motivo que el
// resto de Edge Functions de cartera.
import { obtenerEvolucionCarteraVencida } from '../../../packages/liquidation-engine/dist/index.js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse } from '../_shared/http.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 60
const RATE_LIMIT_VENTANA = '1 hour'

// Espejo local — dist/index.js pierde los exports type-only al compilar
// (mismo patrón que RollRateTramoLocal en cartera-indicadores/index.ts).
interface MoneyLocal {
  readonly amount: { toString(): string }
}
interface PuntoEvolucionLocal {
  readonly mes: string
  readonly fechaSnapshot: string | null
  readonly deudaVencida: MoneyLocal | null
}

const payloadSchema = z.object({
  tenant_id: z.string().uuid(),
  fecha_hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha_hasta debe ser YYYY-MM-DD.'),
  meses: z.number().int().min(1).max(24).optional().default(6),
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
    const { tenant_id: tenantId, fecha_hasta: fechaHasta, meses } = parseo.data

    const bloqueo = await enforceRateLimit(
      ctx.supabase,
      `cartera_evolucion:${actorId}`,
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

    // Cast justificado: mismo problema de resolución de tipos que motiva
    // MoneyLocal/RollRateTramoLocal en el resto de Edge Functions de
    // cartera — el valor en tiempo de ejecución es el real.
    const puntos = (await obtenerEvolucionCarteraVencida(ctx.supabase, {
      tenantId,
      fechaHasta,
      meses,
      moneda: tenant.moneda,
    })) as unknown as PuntoEvolucionLocal[]

    return jsonResponse(
      {
        puntos: puntos.map((p) => ({
          mes: p.mes,
          fechaSnapshot: p.fechaSnapshot,
          deudaVencida: p.deudaVencida ? p.deudaVencida.amount.toString() : null,
        })),
      },
      200,
      correlationId,
    )
  }),
}
