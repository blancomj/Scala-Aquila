// CAR F9 — Dashboard e indicadores (§23.1/§23.2). Compone fn_dashboard_
// cartera (20260823100000/20260823160000) + calcularDashboardCartera()
// (packages/liquidation-engine) para exponer las 9 tarjetas principales,
// la distribución por antigüedad (8 tramos fijos), la distribución por
// etapa de cobranza (5 etapas reales de cartera_etapas/F6) y el Top N
// por inmueble (pieza del frontend, 2026-08-17) a una fecha de corte
// explícita (AD-32 — nunca Date.now() implícito). Ninguna de las 3
// piezas nuevas del frontend exigió una función SQL nueva aparte de
// agregar `codigo` a fn_dashboard_cartera: todas se calculan en TS sobre
// las MISMAS filas que ya trae la función (REC-CAR-004, no se vuelve a
// consultar la base de datos por cada pieza).
//
// REC-CAR-004: la agregación por inmueble vive en fn_dashboard_cartera
// (SQL) y el armado de tarjetas/antigüedad/etapa/top-N en
// calcularDashboardCartera()/calcularTopInmueblesCartera() (TS puro) —
// esta función solo las compone, no reimplementa ninguna.
//
// Rol mínimo: cualquier miembro del tenant (is_member) — mismo criterio
// que cartera-posicion: es una lectura, no una decisión de negocio, no
// exige un rol específico ni administrador.
import { withSupabase } from '@supabase/server'
import { z } from 'zod'
// dist/index.js (compilado), no src/index.ts — mismo motivo que
// cartera-posicion/index.ts.
import {
  calcularDashboardCartera,
  calcularTopInmueblesCartera,
  obtenerFilasDashboardCartera,
} from '../../../packages/liquidation-engine/dist/index.js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse } from '../_shared/http.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 60
const RATE_LIMIT_VENTANA = '1 hour'
const TOP_N_DEFAULT = 10
const TOP_N_MAX = 50

// Espejo local — dist/index.js pierde los exports type-only al compilar
// (mismo patrón que RollRateTramoLocal en cartera-indicadores/index.ts).
interface MoneyLocal {
  readonly amount: { toString(): string }
}
interface InmuebleCarteraResumenLocal {
  readonly inmuebleId: string
  readonly codigo: string
  readonly deudaVencida: MoneyLocal
  readonly diasMoraMaximo: number
}

const payloadSchema = z.object({
  tenant_id: z.string().uuid(),
  fecha_corte: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha_corte debe ser YYYY-MM-DD.'),
  top_n: z.number().int().min(1).max(TOP_N_MAX).optional().default(TOP_N_DEFAULT),
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
    const { tenant_id: tenantId, fecha_corte: fechaCorte, top_n: topN } = parseo.data

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
    // Cast justificado: mismo problema de resolución de tipos que motiva
    // MoneyLocal/RollRateTramoLocal arriba — el valor en tiempo de
    // ejecución es el real.
    const topInmuebles = calcularTopInmueblesCartera(filas, topN) as unknown as InmuebleCarteraResumenLocal[]

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
        topInmuebles: topInmuebles.map((i) => ({
          inmuebleId: i.inmuebleId,
          codigo: i.codigo,
          deudaVencida: i.deudaVencida.amount.toString(),
          diasMoraMaximo: i.diasMoraMaximo,
        })),
      },
      200,
      correlationId,
    )
  }),
}
