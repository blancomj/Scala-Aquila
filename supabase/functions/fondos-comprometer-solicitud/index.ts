// GAP-22, BLOQUE final — comprometer una solicitud de uso ya aprobada
// (Modelo §20, D-37): crea el fondo_compromisos vinculado. Mismo
// razonamiento que fondos-aprobar-solicitud: guard_fondo_solicitud_uso_
// transicion ya exige rol auxiliar y no-autoejecución (quien aprobó no
// puede comprometer su propia decisión) vía trigger sobre el UPDATE
// directo que la RLS ya permite — esta función solo agrega rate limit,
// error estructurado y logging sobre el propio ctx.supabase (RLS) del
// usuario.
import { withSupabase } from '@supabase/server'
import { z } from 'zod'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse, parsearErrorRpc } from '../_shared/http.ts'
import { logEvent } from '../_shared/logger.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 30
const RATE_LIMIT_VENTANA = '1 hour'

const payloadSchema = z.object({ solicitud_id: z.string().uuid() })

// guard_fondo_solicitud_uso_transicion (20260929150000) es la única fuente
// de verdad de estas reglas — este mapa solo traduce sus códigos a un
// status HTTP razonable, nunca reimplementa la condición.
const ESTADO_HTTP_POR_CODIGO: Record<string, number> = {
  SOLICITUD_ESTADO_TERMINAL: 409,
  SOLICITUD_TRANSICION_INVALIDA: 409,
  SOLICITUD_ROL_INSUFICIENTE: 403,
  SOLICITUD_AUTOEJECUCION: 403,
}

type FondoSolicitudUsoRow = Database['public']['Tables']['fondo_solicitudes_uso']['Row']

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
    const { solicitud_id: solicitudId } = parseo.data

    const bloqueo = await enforceRateLimit(
      ctx.supabase,
      `fondos_comprometer_solicitud:${actorId}`,
      RATE_LIMIT_MAX_HITS,
      RATE_LIMIT_VENTANA,
      correlationId,
    )
    if (bloqueo) return bloqueo

    // Lectura RLS-scoped: solo ve la solicitud si es miembro de ese tenant —
    // nunca se confía en un tenant_id enviado por el cliente.
    const { data: solicitud, error: errorSolicitud } = await ctx.supabase
      .from('fondo_solicitudes_uso')
      .select('id, tenant_id, fondo_id, estado')
      .eq('id', solicitudId)
      .maybeSingle()
    if (errorSolicitud) {
      return errorResponse(500, 'INTERNAL_ERROR', errorSolicitud.message, undefined, correlationId)
    }
    if (!solicitud) {
      return errorResponse(
        404,
        'SOLICITUD_NO_ENCONTRADA',
        'La solicitud no existe o no es accesible.',
        undefined,
        correlationId,
      )
    }

    const { data: comprometida, error: errorUpdate } = await ctx.supabase
      .from('fondo_solicitudes_uso')
      .update({ estado: 'comprometida' })
      .eq('id', solicitudId)
      .select('*')
      .single<FondoSolicitudUsoRow>()
    if (errorUpdate) {
      const { code, message } = parsearErrorRpc(errorUpdate.message)
      const status = ESTADO_HTTP_POR_CODIGO[code] ?? 500
      logEvent({
        level: 'warn',
        action: 'fondos_comprometer_solicitud.rechazada',
        correlationId,
        actorId,
        tenantId: solicitud.tenant_id,
        meta: { solicitudId, code },
      })
      return errorResponse(status, code, message, undefined, correlationId)
    }

    logEvent({
      level: 'info',
      action: 'fondos_comprometer_solicitud.completada',
      correlationId,
      actorId,
      tenantId: solicitud.tenant_id,
      meta: { solicitudId, fondoId: solicitud.fondo_id, compromisoId: comprometida.compromiso_id },
    })

    return jsonResponse(comprometida, 200, correlationId)
  }),
}
