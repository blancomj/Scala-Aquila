// CAR F1 — expone fn_posicion_cartera() + clasificarCartera() (packages/
// liquidation-engine) al agent/auditor: posición de cartera por inmueble a
// una fecha de corte explícita (AD-32/REC-CAR-008 — nunca Date.now()
// implícito), con clasificación versionada adjunta.
//
// REC-CAR-004: la agregación de deuda vive en fn_posicion_cartera (SQL) y
// la clasificación en clasificarCartera() (TS puro) — esta función solo
// las compone, no reimplementa ninguna de las dos.
//
// PH-C26 / I-C14: sin política de clasificación vigente, la respuesta es
// 422 POLITICA_CLASIFICACION_NO_VIGENTE — nunca se clasifica con un
// default inventado ni se omite la clasificación en silencio.
import { withSupabase } from '@supabase/server'
import { z } from 'zod'
// dist/index.js (compilado), no src/index.ts — mismo motivo que
// calcular-intereses/index.ts.
import {
  clasificarCartera,
  obtenerPoliticaClasificacionVigente,
  TramoClasificacionNoEncontradoError,
} from '../../../packages/liquidation-engine/dist/index.js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse } from '../_shared/http.ts'
import { logEvent } from '../_shared/logger.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 60
const RATE_LIMIT_VENTANA = '1 hour'

const payloadSchema = z.object({
  tenant_id: z.string().uuid(),
  fecha_corte: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha_corte debe ser YYYY-MM-DD.'),
  inmueble_id: z.string().uuid().optional(),
})

// Espejos locales — dist/index.js pierde los exports type-only al compilar
// (mismo patrón que CargoAbiertoLocal en calcular-intereses/index.ts).
type NivelRiesgoLocal = 'ninguno' | 'bajo' | 'medio' | 'alto' | 'critico'
type EtapaCobranzaLocal = 'preventiva' | 'administrativa' | 'prejuridica' | 'juridica' | 'judicial'
interface TramoClasificacionLocal {
  readonly codigo: string
  readonly diasMin: number
  readonly diasMax: number | null
  readonly nivelRiesgo: NivelRiesgoLocal
  readonly etapaCobranza: EtapaCobranzaLocal
  readonly prioridad: number
}
interface PoliticaClasificacionLocal {
  readonly id: string
  readonly version: number
  readonly tramos: readonly TramoClasificacionLocal[]
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
    const { tenant_id: tenantId, fecha_corte: fechaCorte, inmueble_id: inmuebleId } = parseo.data

    const bloqueo = await enforceRateLimit(
      ctx.supabase,
      `cartera_posicion:${actorId}`,
      RATE_LIMIT_MAX_HITS,
      RATE_LIMIT_VENTANA,
      correlationId,
    )
    if (bloqueo) return bloqueo

    const { data: esMiembro, error: errorMembresia } = await ctx.supabase.rpc('is_member', {
      p_tenant: tenantId,
    })
    if (errorMembresia) {
      return errorResponse(500, 'INTERNAL_ERROR', errorMembresia.message, undefined, correlationId)
    }
    if (!esMiembro) {
      return errorResponse(
        403,
        'FORBIDDEN',
        'No eres miembro de este tenant.',
        undefined,
        correlationId,
      )
    }

    let politica: PoliticaClasificacionLocal
    try {
      politica = await obtenerPoliticaClasificacionVigente(ctx.supabase, { tenantId })
    } catch (excepcion) {
      const mensaje =
        excepcion instanceof Error ? excepcion.message : 'No se pudo leer la política.'
      logEvent({
        level: 'warn',
        action: 'cartera_posicion.politica_no_vigente',
        correlationId,
        actorId,
        tenantId,
        message: mensaje,
      })
      return errorResponse(
        422,
        'POLITICA_CLASIFICACION_NO_VIGENTE',
        'El tenant no tiene una política de clasificación de cartera vigente (CAR §8, PRQ-CAR-002).',
        undefined,
        correlationId,
      )
    }

    const { data: filas, error: errorPosicion } = await ctx.supabase.rpc('fn_posicion_cartera', {
      p_tenant_id: tenantId,
      p_fecha_corte: fechaCorte,
      p_inmueble_id: inmuebleId ?? undefined,
    })
    if (errorPosicion) {
      return errorResponse(500, 'INTERNAL_ERROR', errorPosicion.message, undefined, correlationId)
    }

    let posiciones
    try {
      posiciones = filas.map((f) => {
        const diasMoraMaximo = f.dias_mora_maximo ?? 0
        const clasificacion = clasificarCartera(diasMoraMaximo, politica)
        return {
          inmueble_id: f.inmueble_id,
          fecha_corte: fechaCorte,
          deuda_total: String(f.deuda_total),
          deuda_capital: String(f.deuda_capital),
          deuda_interes: String(f.deuda_interes),
          deuda_otros: String(f.deuda_otros),
          saldo_credito: String(f.saldo_credito),
          cargo_vencido_mas_antiguo_id: f.cargo_vencido_mas_antiguo_id,
          fecha_vencimiento_mas_antigua: f.fecha_vencimiento_mas_antigua,
          dias_mora_maximo: diasMoraMaximo,
          cantidad_cargos_vencidos: f.cantidad_cargos_vencidos,
          clasificacion_codigo: clasificacion.codigo,
          nivel_riesgo: clasificacion.nivelRiesgo,
          etapa_cobranza: clasificacion.etapaCobranza,
          politica_id: clasificacion.politicaId,
          politica_version: clasificacion.politicaVersion,
        }
      })
    } catch (excepcion) {
      // TramoClasificacionNoEncontradoError: la política vigente pasó el guard
      // SQL al activarse pero, por alguna corrupción posterior, no cubre estos
      // días — no debería ocurrir en la práctica (CAR §8.3), pero no se oculta.
      if (excepcion instanceof TramoClasificacionNoEncontradoError) {
        return errorResponse(
          422,
          'TRAMO_CLASIFICACION_NO_ENCONTRADO',
          excepcion.message,
          undefined,
          correlationId,
        )
      }
      throw excepcion
    }

    return jsonResponse({ posiciones }, 200, correlationId)
  }),
}
