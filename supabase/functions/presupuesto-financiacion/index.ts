// Docs/Motor presupuestal/AQUILA_SAAS_E16_...md §9, §14 — capa de
// exposición de fuente_financiacion (GAP-19). Delgado a propósito: toda la
// validación de negocio (inmutabilidad, FI-003 fondo insuficiente, tope
// contra el presupuesto) vive en la RPC/triggers de Postgres
// (20260814200000, 20260814210000) — esta función solo autentica, valida
// forma de payload, aplica rate limit y traduce el error de dominio a HTTP.
import { withSupabase } from '@supabase/server'
import { z } from 'zod'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse, parsearErrorRpc } from '../_shared/http.ts'
import { logEvent } from '../_shared/logger.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 30
const RATE_LIMIT_VENTANA = '1 hour'

const payloadSchema = z.object({
  presupuesto_id: z.string().uuid(),
  tipo_id: z.number().int().positive(),
  valor_disponible: z.number().nonnegative(),
  valor_aplicado: z.number().nonnegative().default(0),
  descripcion: z.string().trim().min(1).optional(),
  fundamento_normativo_id: z.number().int().positive().optional(),
  presupuesto_cuenta_id: z.string().uuid().optional(),
})

export default {
  fetch: withSupabase<Database>({ auth: 'user' }, async (req, ctx) => {
    const correlationId = crypto.randomUUID()
    const actorId = ctx.userClaims?.id ?? null

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
      logEvent({
        level: 'warn',
        action: 'presupuesto_financiacion.invalid_payload',
        correlationId,
        actorId,
        meta: { issues: parseo.error.issues },
      })
      return errorResponse(
        400,
        'INVALID_PAYLOAD',
        parseo.error.issues[0]?.message ?? 'Payload inválido.',
        { issues: parseo.error.issues },
        correlationId,
      )
    }
    if (parseo.data.valor_aplicado > parseo.data.valor_disponible) {
      return errorResponse(
        400,
        'INVALID_PAYLOAD',
        'valor_aplicado no puede superar valor_disponible.',
        undefined,
        correlationId,
      )
    }

    const bloqueo = await enforceRateLimit(
      ctx.supabase,
      `presupuesto_financiacion:${actorId}`,
      RATE_LIMIT_MAX_HITS,
      RATE_LIMIT_VENTANA,
      correlationId,
    )
    if (bloqueo) return bloqueo

    const { data: fuente, error: errorRpc } = await ctx.supabase
      .rpc('fn_registrar_fuente_financiacion', {
        p_presupuesto_id: parseo.data.presupuesto_id,
        p_tipo_id: parseo.data.tipo_id,
        p_valor_disponible: parseo.data.valor_disponible,
        p_valor_aplicado: parseo.data.valor_aplicado,
        p_descripcion: parseo.data.descripcion ?? null,
        p_fundamento_normativo_id: parseo.data.fundamento_normativo_id ?? null,
        p_presupuesto_cuenta_id: parseo.data.presupuesto_cuenta_id ?? null,
      })
      .single()

    if (errorRpc) {
      const { code, message } = parsearErrorRpc(errorRpc.message)
      logEvent({
        level: 'warn',
        action: 'presupuesto_financiacion.rpc_error',
        correlationId,
        actorId,
        meta: { code },
      })
      const status =
        code === 'PRESUPUESTO_NO_ENCONTRADO'
          ? 404
          : code === 'IMMUTABLE_BUDGET'
            ? 409
            : code === 'FONDO_IMPREVISTOS_NO_EXISTE' || code === 'FONDO_INSUFICIENTE'
              ? 422
              : code === 'CUENTA_INEXISTENTE' ||
                  code === 'CUENTA_TENANT_INCONSISTENTE' ||
                  code === 'CUENTA_NATURALEZA_INVALIDA'
                ? 422
                : 409
      return errorResponse(status, code, message, undefined, correlationId)
    }
    if (!fuente) {
      logEvent({
        level: 'error',
        action: 'presupuesto_financiacion.no_row',
        correlationId,
        actorId,
      })
      return errorResponse(
        500,
        'INTERNAL_ERROR',
        'fn_registrar_fuente_financiacion no devolvió una fila.',
        undefined,
        correlationId,
      )
    }

    return jsonResponse(fuente, 200, correlationId)
  }),
}
