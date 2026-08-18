// Dashboard de Cartera (frontend, 2026-08-17) — "Alertas y pendientes".
// Compone fn_alertas_cartera (20260823160000): obligaciones >90 días a
// nivel de CARGO, promesas por vencer en 3 días, cuotas de acuerdo
// vencidas. El cuarto ítem del diseño de referencia ("Casos próximos a
// remisión jurídica") NO vive aquí — se deriva en el frontend de
// dashboard.porEtapa[prejuridica] (Edge Function cartera-dashboard), ya
// cargado para "Cartera por etapa de cobranza"; no se vuelve a
// consultar la base de datos (REC-CAR-004). El quinto ítem
// ("Notificaciones pendientes de envío") queda fuera de alcance por
// completo — no es dominio de cartera, decisión del usuario.
import { withSupabase } from '@supabase/server'
import { z } from 'zod'
// dist/index.js (compilado), no src/index.ts — mismo motivo que el
// resto de Edge Functions de cartera.
import { obtenerRawAlertasCartera } from '../../../packages/liquidation-engine/dist/index.js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse } from '../_shared/http.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 60
const RATE_LIMIT_VENTANA = '1 hour'

const payloadSchema = z.object({
  tenant_id: z.string().uuid(),
  fecha_referencia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha_referencia debe ser YYYY-MM-DD.'),
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
    const { tenant_id: tenantId, fecha_referencia: fechaReferencia } = parseo.data

    const bloqueo = await enforceRateLimit(
      ctx.supabase,
      `cartera_alertas:${actorId}`,
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

    const raw = await obtenerRawAlertasCartera(ctx.supabase, {
      tenantId,
      fechaReferencia,
      moneda: tenant.moneda,
    })

    return jsonResponse(
      {
        fechaReferencia,
        obligacionesMayor90Cantidad: raw.obligacionesMayor90Cantidad,
        obligacionesMayor90Monto: raw.obligacionesMayor90Monto.amount.toString(),
        promesasPorVencerCantidad: raw.promesasPorVencerCantidad,
        promesasPorVencerMonto: raw.promesasPorVencerMonto.amount.toString(),
        cuotasAcuerdoVencidasCantidad: raw.cuotasAcuerdoVencidasCantidad,
        cuotasAcuerdoVencidasMonto: raw.cuotasAcuerdoVencidasMonto.amount.toString(),
      },
      200,
      correlationId,
    )
  }),
}
