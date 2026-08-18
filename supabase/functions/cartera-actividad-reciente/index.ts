// Dashboard de Cartera (frontend, 2026-08-17) — "Actividad reciente en
// cartera". Compone fn_actividad_reciente_cartera (20260823170000): feed
// de las últimas gestiones REGISTRADAS (alta de pago/promesa/acuerdo/
// caso jurídico, no su ciclo de vida completo) — mismo criterio que el
// resto de piezas del dashboard (REC-CAR-004, no reimplementa el join).
import { withSupabase } from '@supabase/server'
import { z } from 'zod'
// dist/index.js (compilado), no src/index.ts — mismo motivo que el
// resto de Edge Functions de cartera.
import { obtenerActividadRecienteCartera } from '../../../packages/liquidation-engine/dist/index.js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse } from '../_shared/http.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 60
const RATE_LIMIT_VENTANA = '1 hour'
const LIMITE_DEFAULT = 15
const LIMITE_MAX = 50

// Espejo local — dist/index.js pierde los exports type-only al compilar
// y a veces ensancha un Money anidado dentro de un array (mismo patrón
// que InmuebleCarteraResumenLocal en cartera-dashboard/index.ts).
interface MoneyLocal {
  readonly amount: { toString(): string }
}
interface EventoActividadCarteraLocal {
  readonly tipo: string
  readonly fecha: string
  readonly inmuebleId: string
  readonly codigo: string
  readonly monto: MoneyLocal
}

const payloadSchema = z.object({
  tenant_id: z.string().uuid(),
  limite: z.number().int().min(1).max(LIMITE_MAX).optional().default(LIMITE_DEFAULT),
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
    const { tenant_id: tenantId, limite } = parseo.data

    const bloqueo = await enforceRateLimit(
      ctx.supabase,
      `cartera_actividad_reciente:${actorId}`,
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
    // MoneyLocal/EventoActividadCarteraLocal arriba — el valor en tiempo
    // de ejecución es el real.
    const eventos = (await obtenerActividadRecienteCartera(ctx.supabase, {
      tenantId,
      moneda: tenant.moneda,
      limite,
    })) as unknown as EventoActividadCarteraLocal[]

    return jsonResponse(
      {
        eventos: eventos.map((e) => ({
          tipo: e.tipo,
          fecha: e.fecha,
          inmuebleId: e.inmuebleId,
          codigo: e.codigo,
          monto: e.monto.amount.toString(),
        })),
      },
      200,
      correlationId,
    )
  }),
}
