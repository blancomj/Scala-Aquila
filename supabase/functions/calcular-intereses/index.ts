// E6 — expone calcularInteresMora() (packages/liquidation-engine) al agent:
// calcula interés de mora sobre el capital vencido de todos los inmuebles
// activos de un tenant, anclado a una fecha_referencia explícita del
// payload (AD-32 — nunca Date.now() implícito).
//
// Idempotente entre corridas: obtenerUltimaFechaInteresPorCapital usa el
// interés ya generado como piso de fechaVencimiento, así que una segunda
// corrida sobre el mismo rango solo devenga los días nuevos desde la
// última (ver su docstring en cuenta-corriente-supabase.ts).
//
// cargos no tiene política INSERT para `authenticated` (20260816100000) —
// el rol se verifica aquí antes de usar ctx.supabaseAdmin, igual que
// liquidar-periodo/registrar-pago.
import { withSupabase } from '@supabase/server'
import { z } from 'zod'
// dist/index.js (compilado), no src/index.ts — mismo motivo que
// liquidar-periodo/index.ts.
import {
  calcularInteresMora,
  obtenerCargosAbiertos,
  obtenerUltimaFechaInteresPorCapital,
  registrarCargoInteres,
} from '../../../packages/liquidation-engine/dist/index.js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse } from '../_shared/http.ts'
import { logEvent } from '../_shared/logger.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 10
const RATE_LIMIT_VENTANA = '1 hour'

const payloadSchema = z.object({
  tenant_id: z.string().uuid(),
  fecha_referencia: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha_referencia debe ser YYYY-MM-DD.'),
})

// Espejos locales — dist/index.js pierde los exports type-only al compilar.
interface CargoAbiertoLocal {
  readonly id: string
  readonly categoria: 'capital' | 'interes' | 'otro'
  readonly fechaVencimiento: string
}
interface CargoInteresGeneradoLocal {
  readonly cargoCapitalOrigenId: string
  readonly monto: { readonly amount: { toString(): string } }
  readonly diasMora: number
  readonly topeAplicado: boolean
}

function mapearModoRedondeo(modo: 'half_up' | 'half_even' | 'down' | 'up') {
  switch (modo) {
    case 'half_up':
      return 'HALF_UP' as const
    case 'half_even':
      return 'HALF_EVEN' as const
    case 'down':
      return 'DOWN' as const
    case 'up':
      return 'UP' as const
  }
}

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
      `calcular_intereses:${actorId}`,
      RATE_LIMIT_MAX_HITS,
      RATE_LIMIT_VENTANA,
      correlationId,
    )
    if (bloqueo) return bloqueo

    const { data: esAgent, error: errorRol } = await ctx.supabase.rpc('has_role', {
      p_tenant: tenantId,
      p_roles: ['auxiliar'],
    })
    if (errorRol) {
      return errorResponse(500, 'INTERNAL_ERROR', errorRol.message, undefined, correlationId)
    }
    if (!esAgent) {
      return errorResponse(
        403,
        'FORBIDDEN',
        'Solo un auxiliar puede calcular intereses.',
        undefined,
        correlationId,
      )
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
      return errorResponse(
        404,
        'TENANT_NO_ENCONTRADO',
        'El tenant no existe o no es accesible.',
        undefined,
        correlationId,
      )
    }

    const { data: politica, error: errorPolitica } = await ctx.supabase
      .from('politicas_financieras')
      .select(
        'interes_tasa_mensual, interes_tope_mensual, interes_dias_gracia, interes_day_count, interes_descuento_orden, redondeo_modo, redondeo_escala',
      )
      .eq('tenant_id', tenantId)
      .eq('estado', 'vigente')
      .maybeSingle()
    if (errorPolitica) {
      return errorResponse(500, 'INTERNAL_ERROR', errorPolitica.message, undefined, correlationId)
    }
    if (!politica) {
      return errorResponse(
        422,
        'POLITICA_NO_VIGENTE',
        'El tenant no tiene una política financiera vigente.',
        undefined,
        correlationId,
      )
    }
    if (politica.interes_tasa_mensual === null || politica.interes_tope_mensual === null) {
      return errorResponse(
        422,
        'POLITICA_MORA_NO_CONFIGURADA',
        'La política vigente no tiene interés de mora configurado (interes_tasa_mensual/interes_tope_mensual).',
        undefined,
        correlationId,
      )
    }

    const { data: inmuebles, error: errorInmuebles } = await ctx.supabase
      .from('inmuebles')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('estado', 'activo')
    if (errorInmuebles) {
      return errorResponse(500, 'INTERNAL_ERROR', errorInmuebles.message, undefined, correlationId)
    }

    const redondeo = {
      modo: mapearModoRedondeo(politica.redondeo_modo),
      escala: politica.redondeo_escala,
    }
    const politicaMora = {
      tasaMensual: String(politica.interes_tasa_mensual),
      topeMensual: String(politica.interes_tope_mensual),
      diasGracia: politica.interes_dias_gracia,
      dayCount: politica.interes_day_count,
      descuentoOrden: politica.interes_descuento_orden,
    }

    const resumen: { inmueble_id: string; monto_generado: string; tope_aplicado: boolean }[] = []
    const todosLosGenerados: CargoInteresGeneradoLocal[] = []

    for (const inmueble of inmuebles) {
      let cargosAbiertos: readonly CargoAbiertoLocal[]
      try {
        cargosAbiertos = await obtenerCargosAbiertos(ctx.supabase, {
          tenantId,
          inmuebleId: inmueble.id,
          moneda: tenant.moneda,
        })
      } catch (excepcion) {
        const mensaje =
          excepcion instanceof Error ? excepcion.message : 'No se pudo leer el ledger.'
        logEvent({
          level: 'warn',
          action: 'calcular_intereses.cuenta_corriente_incompleta',
          correlationId,
          actorId,
          message: mensaje,
        })
        return errorResponse(422, 'CUENTA_CORRIENTE_INCOMPLETA', mensaje, undefined, correlationId)
      }

      const cargosCapital = cargosAbiertos.filter((c) => c.categoria === 'capital')
      if (cargosCapital.length === 0) continue

      const ultimaFecha = await obtenerUltimaFechaInteresPorCapital(
        ctx.supabase,
        cargosCapital.map((c) => c.id),
      )
      const cargosCapitalAjustados = cargosCapital.map((c) => {
        const ultima = ultimaFecha.get(c.id)
        return ultima && ultima > c.fechaVencimiento ? { ...c, fechaVencimiento: ultima } : c
      })
      // REQ-NOVEDAD-003 (D-23): calcularInteresMora() necesita ver también los
      // cargos categoria='otro' (DISCOUNT) del inmueble para poder aplicar
      // interes_descuento_orden — solo el capital lleva el ajuste de idempotencia.
      const cargosAjustados = [
        ...cargosCapitalAjustados,
        ...cargosAbiertos.filter((c) => c.categoria !== 'capital'),
      ]

      let generados: readonly CargoInteresGeneradoLocal[]
      try {
        generados = calcularInteresMora(cargosAjustados, fechaReferencia, politicaMora, redondeo)
      } catch (excepcion) {
        const mensaje =
          excepcion instanceof Error ? excepcion.message : 'No se pudo calcular el interés.'
        return errorResponse(422, 'INTERES_INVALIDO', mensaje, undefined, correlationId)
      }
      if (generados.length === 0) continue

      todosLosGenerados.push(...generados)
      const montoGenerado = generados.reduce((acc, g) => acc + Number(g.monto.amount.toString()), 0)
      resumen.push({
        inmueble_id: inmueble.id,
        monto_generado: String(montoGenerado),
        tope_aplicado: generados.some((g) => g.topeAplicado),
      })
    }

    if (todosLosGenerados.length > 0) {
      try {
        await registrarCargoInteres(ctx.supabaseAdmin, tenantId, todosLosGenerados)
      } catch (excepcion) {
        const mensaje =
          excepcion instanceof Error ? excepcion.message : 'No se pudo registrar el interés.'
        logEvent({
          level: 'error',
          action: 'calcular_intereses.guardado_fallido',
          correlationId,
          actorId,
          message: mensaje,
        })
        return errorResponse(500, 'INTERNAL_ERROR', mensaje, undefined, correlationId)
      }
    }

    logEvent({
      level: 'info',
      action: 'calcular_intereses.completada',
      correlationId,
      actorId,
      tenantId,
      meta: { inmuebles: resumen.length, cargos: todosLosGenerados.length },
    })

    return jsonResponse(resumen, 200, correlationId)
  }),
}
