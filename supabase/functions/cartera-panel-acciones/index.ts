// CAR F9 (parte 5) — Panel de acciones (§23.5), última pieza de F9.
// Compone fn_panel_acciones_cartera (20260823140000) — 8 conteos de
// colas de trabajo. Decisión de alcance del usuario (2026-08-17): solo
// conteos (badges de dashboard), no las filas de cada cola — el
// detalle de cada item lo consulta el frontend directamente contra la
// tabla correspondiente (RLS ya lo permite). No hay ratio ni política
// de denominador-cero que aplicar (a diferencia de cartera-
// indicadores) — REC-CAR-004: esta función solo carga datos y expone
// el resultado del agregador, sin inventar un paso de cálculo que no
// hace falta.
import { withSupabase } from '@supabase/server'
import { z } from 'zod'
// dist/index.js (compilado), no src/index.ts — mismo motivo que
// cartera-posicion/index.ts y cartera-indicadores/index.ts.
import { obtenerPanelAccionesCartera } from '../../../packages/liquidation-engine/dist/index.js'
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
      `cartera_panel_acciones:${actorId}`,
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

    const panel = await obtenerPanelAccionesCartera(ctx.supabase, { tenantId, fechaReferencia })

    return jsonResponse(
      {
        fechaReferencia,
        accionesPendientesAprobacion: panel.accionesPendientesAprobacion,
        accionesProgramadasHoy: panel.accionesProgramadasHoy,
        accionesFallidas: panel.accionesFallidas,
        llamadasPendientes: panel.llamadasPendientes,
        promesasVencenHoy: panel.promesasVencenHoy,
        cuotasAcuerdoVencenSemana: panel.cuotasAcuerdoVencenSemana,
        casosJuridicosSinActuacion30d: panel.casosJuridicosSinActuacion30d,
        certificacionesPorVencer: panel.certificacionesPorVencer,
      },
      200,
      correlationId,
    )
  }),
}
