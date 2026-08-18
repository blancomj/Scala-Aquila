// CAR F9 — Dashboard e indicadores (§23.1/§23.2). Compone fn_dashboard_
// cartera (20260823100000) + calcularDashboardCartera() (packages/
// liquidation-engine) para exponer las 9 tarjetas principales, la
// distribución por antigüedad (8 tramos fijos) y la distribución por
// etapa de cobranza (5 etapas reales de cartera_etapas/F6 — pieza del
// frontend, 2026-08-17) a una fecha de corte explícita (AD-32 — nunca
// Date.now() implícito). porEtapa no exigió una migración nueva: cada
// fila de fn_dashboard_cartera ya trae etapa_cobranza, solo hacía falta
// agruparla en TS (REC-CAR-004).
//
// REC-CAR-004: la agregación por inmueble vive en fn_dashboard_cartera
// (SQL) y el armado de tarjetas/antigüedad en calcularDashboardCartera()
// (TS puro) — esta función solo las compone, no reimplementa ninguna.
//
// Rol mínimo: cualquier miembro del tenant (is_member) — mismo criterio
// que cartera-posicion: es una lectura, no una decisión de negocio, no
// exige un rol específico ni administrador.
import { withSupabase } from '@supabase/server'
import { z } from 'zod'
// dist/index.js (compilado), no src/index.ts — mismo motivo que
// cartera-posicion/index.ts.
import { calcularDashboardCartera, obtenerFilasDashboardCartera } from '../../../packages/liquidation-engine/dist/index.js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse } from '../_shared/http.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 60
const RATE_LIMIT_VENTANA = '1 hour'

const payloadSchema = z.object({
  tenant_id: z.string().uuid(),
  fecha_corte: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha_corte debe ser YYYY-MM-DD.'),
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
    const { tenant_id: tenantId, fecha_corte: fechaCorte } = parseo.data

    const bloqueo = await enforceRateLimit(
      ctx.supabase,
      `cartera_dashboard:${actorId}`,
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

    const filas = await obtenerFilasDashboardCartera(ctx.supabase, {
      tenantId,
      fechaCorte,
      moneda: tenant.moneda,
    })
    const dashboard = calcularDashboardCartera(filas, tenant.moneda)

    return jsonResponse(
      {
        fechaCorte,
        tarjetas: {
          carteraTotal: dashboard.tarjetas.carteraTotal.amount.toString(),
          carteraVencida: dashboard.tarjetas.carteraVencida.amount.toString(),
          carteraCorriente: dashboard.tarjetas.carteraCorriente.amount.toString(),
          interesesCausados: dashboard.tarjetas.interesesCausados.amount.toString(),
          carteraMayor90: dashboard.tarjetas.carteraMayor90.amount.toString(),
          carteraMayor180: dashboard.tarjetas.carteraMayor180.amount.toString(),
          carteraPrejuridica: dashboard.tarjetas.carteraPrejuridica.amount.toString(),
          carteraJuridica: dashboard.tarjetas.carteraJuridica.amount.toString(),
          saldosAFavor: dashboard.tarjetas.saldosAFavor.amount.toString(),
        },
        antiguedad: dashboard.antiguedad.map((t) => ({
          codigo: t.codigo,
          diasMin: t.diasMin,
          diasMax: t.diasMax,
          cantidadInmuebles: t.cantidadInmuebles,
          monto: t.monto.amount.toString(),
          pctDelTotal: t.pctDelTotal,
        })),
        porEtapa: dashboard.porEtapa.map((e) => ({
          etapa: e.etapa,
          cantidadInmuebles: e.cantidadInmuebles,
          monto: e.monto.amount.toString(),
          pctDelTotal: e.pctDelTotal,
        })),
      },
      200,
      correlationId,
    )
  }),
}
