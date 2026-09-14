// Fase 5 de la conciliación bancaria CONTABLE (banco↔libro) — D-113/D-115/D-116/D-117.
// Calcula el cruce (motor puro, conciliacion-bancaria-cruce.ts) y deja la conciliación en
// borrador, con sus partidas no cruzadas ya clasificadas. Certificar es un paso aparte
// (certificar-conciliacion-bancaria) — esta función nunca certifica sola.
//
// conciliacion_bancaria/conciliacion_bancaria_partida no tienen política de INSERT para
// `authenticated` (20260935060000) — el rol se verifica aquí explícitamente antes de usar
// ctx.supabaseAdmin, mismo criterio que conciliar-linea/index.ts.
import { withSupabase } from '@supabase/server'
import { z } from 'zod'
import {
  ConciliacionBancariaYaExisteError,
  CuentaBancariaSinCuentaContableError,
  generarConciliacionBancaria,
} from '../../../packages/liquidation-engine/dist/conciliacion-bancaria-supabase.js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse } from '../_shared/http.ts'
import { logEvent } from '../_shared/logger.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 20
const RATE_LIMIT_VENTANA = '1 hour'

const payloadSchema = z.object({
  tenant_id: z.string().uuid(),
  cuenta_bancaria_id: z.string().uuid(),
  periodo_id: z.string().uuid(),
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
      `generar_conciliacion_bancaria:${actorId}`,
      RATE_LIMIT_MAX_HITS,
      RATE_LIMIT_VENTANA,
      correlationId,
    )
    if (bloqueo) return bloqueo

    // Preparar exige auxiliar (o superior) — mismo umbral que conciliar-linea/importar-extracto.
    // Certificar (Edge Function aparte) exige administrador — D-CB-4.
    const { data: esAuxiliar, error: errorRol } = await ctx.supabase.rpc('has_role', {
      p_tenant: datos.tenant_id,
      p_roles: ['auxiliar'],
    })
    if (errorRol) {
      return errorResponse(500, 'INTERNAL_ERROR', errorRol.message, undefined, correlationId)
    }
    if (!esAuxiliar) {
      return errorResponse(
        403,
        'FORBIDDEN',
        'Solo un auxiliar o administrador puede generar una conciliación bancaria.',
        undefined,
        correlationId,
      )
    }

    try {
      const resumen = await generarConciliacionBancaria(ctx.supabaseAdmin, {
        tenantId: datos.tenant_id,
        cuentaBancariaId: datos.cuenta_bancaria_id,
        periodoId: datos.periodo_id,
        actorId,
      })

      await ctx.supabaseAdmin.from('audit_log').insert({
        tenant_id: datos.tenant_id,
        actor_id: actorId,
        action: 'conciliacion_bancaria.generada',
        entity_type: 'conciliacion_bancaria',
        entity_id: resumen.conciliacionId,
        metadata: {
          cuenta_bancaria_id: datos.cuenta_bancaria_id,
          periodo_id: datos.periodo_id,
          partidas_no_cruzadas: resumen.partidasNoCruzadas,
          partidas_cruzadas: resumen.partidasCruzadas,
        },
      })

      logEvent({
        level: 'info',
        action: 'generar_conciliacion_bancaria.completado',
        correlationId,
        actorId,
        tenantId: datos.tenant_id,
        meta: { ...resumen },
      })

      return jsonResponse(resumen, 200, correlationId)
    } catch (excepcion) {
      if (excepcion instanceof CuentaBancariaSinCuentaContableError) {
        return errorResponse(422, 'CUENTA_BANCARIA_SIN_CUENTA_CONTABLE', excepcion.message, undefined, correlationId)
      }
      if (excepcion instanceof ConciliacionBancariaYaExisteError) {
        return errorResponse(409, 'CONCILIACION_BANCARIA_YA_EXISTE', excepcion.message, undefined, correlationId)
      }
      const mensaje = excepcion instanceof Error ? excepcion.message : 'No se pudo generar la conciliación.'
      logEvent({
        level: 'error',
        action: 'generar_conciliacion_bancaria.fallido',
        correlationId,
        actorId,
        tenantId: datos.tenant_id,
        message: mensaje,
      })
      return errorResponse(500, 'INTERNAL_ERROR', mensaje, undefined, correlationId)
    }
  }),
}
