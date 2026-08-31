// Acciones de la cola manual de conciliación (§6.4): aplicar_a_inmueble,
// crear_saldo_a_favor, descartar. Patrón exacto de registrar-pago/index.ts.
//
// LA REGLA DE ORO (§E.5): aplicar_a_inmueble y crear_saldo_a_favor pasan por
// registrarPago() (aplicarLineaAInmueble/crearSaldoAFavorDesdeLinea, en
// liquidation-engine) — el mismo camino canónico. Esta función no inserta en
// `pagos` por su cuenta.
//
// Las tres acciones quedan en audit_log: una decisión de conciliación es una
// decisión sobre dinero ajeno (§6.4) — se audita directo con
// ctx.supabaseAdmin (service_role salta RLS, audit_log no tiene política de
// INSERT para authenticated, igual que en toda la plataforma).
import { withSupabase } from '@supabase/server'
import { z } from 'zod'
// Módulo concreto, NUNCA el barrel dist/index.js: conciliacion-supabase.js
// (y conciliacion-matching.js, del que depende) ya no viven en el barrel
// a propósito (ver cabecera de packages/liquidation-engine/src/index.ts,
// CAR_08 §4) — esta función sí necesita "@aquila/payment-gateways" (ya
// mapeado en su deno.json), así que importa directo.
import {
  aplicarLineaAInmueble,
  crearSaldoAFavorDesdeLinea,
  descartarLinea,
  LineaYaResueltaError,
} from '../../../packages/liquidation-engine/dist/conciliacion-supabase.js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse } from '../_shared/http.ts'
import { logEvent } from '../_shared/logger.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 60
const RATE_LIMIT_VENTANA = '1 hour'

const payloadSchema = z.discriminatedUnion('accion', [
  z.object({
    accion: z.literal('aplicar_a_inmueble'),
    tenant_id: z.string().uuid(),
    linea_id: z.string().uuid(),
    inmueble_id: z.string().uuid(),
  }),
  z.object({
    accion: z.literal('crear_saldo_a_favor'),
    tenant_id: z.string().uuid(),
    linea_id: z.string().uuid(),
    inmueble_id: z.string().uuid(),
  }),
  z.object({
    accion: z.literal('descartar'),
    tenant_id: z.string().uuid(),
    linea_id: z.string().uuid(),
    motivo: z.string(),
  }),
])

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
      `conciliar_linea:${actorId}`,
      RATE_LIMIT_MAX_HITS,
      RATE_LIMIT_VENTANA,
      correlationId,
    )
    if (bloqueo) return bloqueo

    const { data: esAgent, error: errorRol } = await ctx.supabase.rpc('has_role', {
      p_tenant: datos.tenant_id,
      p_roles: ['auxiliar'],
    })
    if (errorRol) {
      return errorResponse(500, 'INTERNAL_ERROR', errorRol.message, undefined, correlationId)
    }
    if (!esAgent) {
      return errorResponse(
        403,
        'FORBIDDEN',
        'Solo un auxiliar o administrador puede resolver una línea de conciliación.',
        undefined,
        correlationId,
      )
    }

    try {
      if (datos.accion === 'descartar') {
        const motivo = datos.motivo.trim()
        if (motivo.length < 3) {
          return errorResponse(
            400,
            'CONCILIACION_DESCARTE_SIN_MOTIVO',
            'Descartar una línea exige un motivo de al menos 3 caracteres.',
            undefined,
            correlationId,
          )
        }
        await descartarLinea(ctx.supabaseAdmin, {
          tenantId: datos.tenant_id,
          lineaId: datos.linea_id,
          motivo,
          actorId,
        })
        await ctx.supabaseAdmin.from('audit_log').insert({
          tenant_id: datos.tenant_id,
          actor_id: actorId,
          action: 'conciliacion.descartada',
          entity_type: 'extracto_linea',
          entity_id: datos.linea_id,
          metadata: { motivo },
        })
        logEvent({
          level: 'info',
          action: 'conciliar_linea.descartada',
          correlationId,
          actorId,
          tenantId: datos.tenant_id,
          meta: { lineaId: datos.linea_id },
        })
        return jsonResponse({ linea_id: datos.linea_id, estado: 'descartada' }, 200, correlationId)
      }

      const pagoId =
        datos.accion === 'aplicar_a_inmueble'
          ? await aplicarLineaAInmueble(ctx.supabaseAdmin, {
              tenantId: datos.tenant_id,
              lineaId: datos.linea_id,
              inmuebleId: datos.inmueble_id,
              actorId,
            })
          : await crearSaldoAFavorDesdeLinea(ctx.supabaseAdmin, {
              tenantId: datos.tenant_id,
              lineaId: datos.linea_id,
              inmuebleId: datos.inmueble_id,
              actorId,
            })

      await ctx.supabaseAdmin.from('audit_log').insert({
        tenant_id: datos.tenant_id,
        actor_id: actorId,
        action: datos.accion === 'aplicar_a_inmueble' ? 'conciliacion.aplicada' : 'conciliacion.saldo_a_favor',
        entity_type: 'extracto_linea',
        entity_id: datos.linea_id,
        metadata: { inmueble_id: datos.inmueble_id, pago_id: pagoId },
      })

      logEvent({
        level: 'info',
        action: 'conciliar_linea.resuelta',
        correlationId,
        actorId,
        tenantId: datos.tenant_id,
        meta: { lineaId: datos.linea_id, accion: datos.accion, pagoId },
      })

      return jsonResponse(
        { linea_id: datos.linea_id, pago_id: pagoId, estado: 'conciliada_manual' },
        200,
        correlationId,
      )
    } catch (excepcion) {
      if (excepcion instanceof LineaYaResueltaError) {
        return errorResponse(
          409,
          'CONCILIACION_LINEA_YA_RESUELTA',
          excepcion.message,
          undefined,
          correlationId,
        )
      }
      const mensaje = excepcion instanceof Error ? excepcion.message : 'No se pudo resolver la línea.'
      logEvent({
        level: 'error',
        action: 'conciliar_linea.fallido',
        correlationId,
        actorId,
        tenantId: datos.tenant_id,
        message: mensaje,
      })
      return errorResponse(500, 'INTERNAL_ERROR', mensaje, undefined, correlationId)
    }
  }),
}
