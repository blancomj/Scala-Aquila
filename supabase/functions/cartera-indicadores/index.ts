// CAR F9 (parte 2+3) — Indicadores de cartera (§23.3): Overdue Portfolio
// %, Roll Rate, Cure Rate, Recovery Rate, Collection Effectiveness,
// Promise/Agreement Fulfillment Rate. Compone lo ya construido:
// fn_dashboard_cartera (F9 parte 1) para el portafolio ACTUAL,
// posiciones_cartera_snapshot (F3, ya congelado) para comparar dos
// fechas de corte, y fn_indicadores_gestion (20260823110000) para los
// conteos/sumas crudos de gestión del período.
//
// REC-CAR-004: ningún cálculo se reimplementa — esta función solo carga
// datos y llama a los agregadores puros.
//
// Roll Rate y Cure Rate EXIGEN que JOB_CARTERA_DIARIA (F8, cartera-
// recalcular en modo ejecución) ya haya corrido para fecha_desde y
// fecha_hasta — sin snapshot no hay con qué comparar, y no se inventa un
// 0%/100% en su ausencia (422 SNAPSHOT_NO_DISPONIBLE). Overdue Portfolio
// % es distinto: se recalcula en vivo con fn_dashboard_cartera, así que
// SIEMPRE está disponible, corrida el job o no. Recovery Rate reutiliza
// la MISMA cartera vencida al inicio del período que ya se sumó para
// Cure Rate (Σ snapshotDesde.filas.deudaVencida) — no se vuelve a leer.
import { withSupabase } from '@supabase/server'
import { z } from 'zod'
// dist/index.js (compilado), no src/index.ts — mismo motivo que
// cartera-posicion/index.ts.
import {
  calcularCureRate,
  calcularDashboardCartera,
  calcularIndicadoresGestion,
  calcularOverduePortfolioPct,
  calcularRollRatePorTramo,
  obtenerFilasDashboardCartera,
  obtenerRawIndicadoresGestion,
  obtenerSnapshotIndicador,
  obtenerTramosDePolitica,
} from '../../../packages/liquidation-engine/dist/index.js'
import { money, sumar } from '@aquila/financial-kernel'

// Money es un export type-only de financial-kernel — mismo problema de
// resolución de tipos que RollRateTramoLocal (ver arriba). Se deriva
// estructuralmente del propio sumar() en vez de nombrar el tipo.
type MoneyReal = Parameters<typeof sumar>[0]
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse } from '../_shared/http.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 60
const RATE_LIMIT_VENTANA = '1 hour'

// Espejo local — dist/index.js pierde los exports type-only al compilar
// (mismo patrón que DecisionEscalamientoLocal en cartera-recalcular/index.ts).
// Solo se necesita el subconjunto de Money que se usa aquí (.amount.toString()).
interface MoneyLocal {
  readonly amount: { toString(): string }
}
interface RollRateTramoLocal {
  readonly tramoCodigo: string
  readonly tramoSiguienteCodigo: string | null
  readonly deudaEnTramoAnterior: MoneyLocal
  readonly deudaQueRoloAlSiguiente: MoneyLocal
  readonly rollRate: number | null
}

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
      `cartera_indicadores:${actorId}`,
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

    // Overdue Portfolio % — siempre disponible, se recalcula en vivo (no depende del job).
    const filasActuales = await obtenerFilasDashboardCartera(ctx.supabase, {
      tenantId,
      fechaCorte: fechaHasta,
      moneda: tenant.moneda,
    })
    const dashboardActual = calcularDashboardCartera(filasActuales, tenant.moneda)
    const overduePortfolioPct = calcularOverduePortfolioPct(
      dashboardActual.tarjetas.carteraVencida,
      dashboardActual.tarjetas.carteraTotal,
    )

    // Roll Rate / Cure Rate — exigen snapshot congelado (F8) en ambas fechas.
    const snapshotDesde = await obtenerSnapshotIndicador(ctx.supabase, { tenantId, fechaCorte: fechaDesde, moneda: tenant.moneda })
    if (snapshotDesde.filas.length === 0) {
      return errorResponse(
        422,
        'SNAPSHOT_NO_DISPONIBLE',
        `No hay snapshot de cartera para ${fechaDesde} (CAR §18/§23.3) — corre cartera-recalcular en modo ejecución para esa fecha primero.`,
        undefined,
        correlationId,
      )
    }
    const snapshotHasta = await obtenerSnapshotIndicador(ctx.supabase, { tenantId, fechaCorte: fechaHasta, moneda: tenant.moneda })
    if (snapshotHasta.filas.length === 0) {
      return errorResponse(
        422,
        'SNAPSHOT_NO_DISPONIBLE',
        `No hay snapshot de cartera para ${fechaHasta} (CAR §18/§23.3) — corre cartera-recalcular en modo ejecución para esa fecha primero.`,
        undefined,
        correlationId,
      )
    }

    const cureRate = calcularCureRate(snapshotDesde.filas, snapshotHasta.filas, tenant.moneda)

    // política_clasificacion_id nunca es null si hay filas — todas la referencian (columna not null).
    const politicaId = snapshotDesde.politicaId
    const tramosOrdenados = politicaId ? await obtenerTramosDePolitica(ctx.supabase, { politicaId }) : []
    // Cast justificado: mismo problema de resolución de tipos que motiva
    // RollRateTramoLocal (ver arriba) — el valor en tiempo de ejecución es el real.
    const rollRatePorTramo = calcularRollRatePorTramo(
      snapshotDesde.filas,
      snapshotHasta.filas,
      tramosOrdenados,
      tenant.moneda,
    ) as unknown as RollRateTramoLocal[]

    // Cartera vencida al inicio del período (denominador de Recovery Rate) —
    // misma cohorte que ya se sumó implícitamente para Cure Rate.
    const carteraVencidaInicioPeriodo = (
      snapshotDesde.filas as unknown as readonly { deudaVencida: MoneyReal }[]
    ).reduce((acc, fila) => sumar(acc, fila.deudaVencida), money(0, tenant.moneda))
    const rawGestion = await obtenerRawIndicadoresGestion(ctx.supabase, {
      tenantId,
      fechaDesde,
      fechaHasta,
      moneda: tenant.moneda,
    })
    const indicadoresGestion = calcularIndicadoresGestion(rawGestion, carteraVencidaInicioPeriodo)

    return jsonResponse(
      {
        fechaDesde,
        fechaHasta,
        overduePortfolioPct,
        cureRate,
        rollRatePorTramo: rollRatePorTramo.map((t) => ({
          tramoCodigo: t.tramoCodigo,
          tramoSiguienteCodigo: t.tramoSiguienteCodigo,
          deudaEnTramoAnterior: t.deudaEnTramoAnterior.amount.toString(),
          deudaQueRoloAlSiguiente: t.deudaQueRoloAlSiguiente.amount.toString(),
          rollRate: t.rollRate,
        })),
        recoveryRate: indicadoresGestion.recoveryRate,
        collectionEffectiveness: indicadoresGestion.collectionEffectiveness,
        promiseFulfillmentRate: indicadoresGestion.promiseFulfillmentRate,
        agreementFulfillmentRate: indicadoresGestion.agreementFulfillmentRate,
      },
      200,
      correlationId,
    )
  }),
}
