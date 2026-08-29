// CAR F4 — worker de ejecución de UNA acción de cobranza. Canales con
// despacho automático: SMS (2026-08-17) y correo (2026-08-29). WhatsApp y
// postal siguen fuera hasta que exista su proveedor.
//
// Desde 2026-08-28 esta función es una CÁSCARA HTTP: valida método, payload,
// rate limit y rol, y delega el despacho en _shared/despacho_cobranza.ts,
// que comparte con cartera-ejecutar-lote. La lógica vivía aquí dentro;
// duplicarla en el worker por lotes habría garantizado que las dos versiones
// se separaran con el tiempo, y la evidencia probatoria no admite dos
// respuestas a "qué fue lo que se envió".
//
// El despacho registra además la evidencia del envío (§34.3) y emite el
// evento de dominio (§18.4 paso 6). Sin lo primero, el sistema podía enviar
// mil SMS y no poder probar ninguno.
//
// No orquesta lotes: procesa una accion_id por invocación. Para la corrida
// diaria está cartera-ejecutar-lote.
import { createClient } from '@supabase/supabase-js'
import { withSupabase } from '@supabase/server'
import { z } from 'zod'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { despacharAccionCobranza } from '../_shared/despacho_cobranza.ts'
import { errorResponse, jsonResponse } from '../_shared/http.ts'
import { logEvent } from '../_shared/logger.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

// "Dinero real gastado por cada llamada" (mismo criterio que
// probar-plantilla-sms), pero este endpoint sí necesita soportar volumen de
// lote real (una copropiedad puede tener decenas de acciones vencidas el
// mismo día) — 200/hora.
const RATE_LIMIT_MAX_HITS = 200
const RATE_LIMIT_VENTANA = '1 hour'

const payloadSchema = z.object({
  tenant_id: z.string().uuid(),
  accion_id: z.string().uuid(),
})

/** Un requisito que falta no es un error del servidor. */
function statusDeCodigo(codigo: string): number {
  if (codigo === 'INTERNAL_ERROR') return 500
  if (codigo === 'ACCION_COBRANZA_NO_ENCONTRADA') return 404
  return 422
}

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
    const { tenant_id: tenantId, accion_id: accionId } = parseo.data

    const bloqueo = await enforceRateLimit(
      ctx.supabase,
      `ejecutar_accion_cobranza:${actorId}`,
      RATE_LIMIT_MAX_HITS,
      RATE_LIMIT_VENTANA,
      correlationId,
    )
    if (bloqueo) return bloqueo

    const { data: tieneRol, error: errorRol } = await ctx.supabase.rpc('has_role', {
      p_tenant: tenantId,
      p_roles: ['auxiliar'],
    })
    if (errorRol) {
      return errorResponse(500, 'INTERNAL_ERROR', errorRol.message, undefined, correlationId)
    }
    if (!tieneRol) {
      return errorResponse(403, 'FORBIDDEN', 'Se requiere rol auxiliar en esta copropiedad.', undefined, correlationId)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) {
      return errorResponse(500, 'INTERNAL_ERROR', 'Configuración incompleta.', undefined, correlationId)
    }
    const admin = createClient<Database>(supabaseUrl, serviceKey)

    const resultado = await despacharAccionCobranza(admin, {
      tenantId,
      accionId,
      actorId,
      modo: 'ejecucion',
    })

    if (resultado.tipo === 'no_ejecutable') {
      return errorResponse(
        statusDeCodigo(resultado.codigo),
        resultado.codigo,
        resultado.mensaje,
        undefined,
        correlationId,
      )
    }
    // 'simulada' no puede darse: arriba se pide modo 'ejecucion'.
    if (resultado.tipo !== 'despachada') {
      return errorResponse(500, 'INTERNAL_ERROR', 'Resultado de despacho inesperado.', undefined, correlationId)
    }

    if (resultado.evidenciaError) {
      logEvent({
        level: 'error',
        action: 'ejecutar_accion_cobranza.evidencia_no_registrada',
        correlationId,
        actorId,
        tenantId,
        message: resultado.evidenciaError,
        meta: { accionId, envioId: resultado.envioId },
      })
    }

    logEvent({
      level: resultado.estado === 'ejecutada' ? 'info' : 'error',
      action: 'ejecutar_accion_cobranza.completada',
      correlationId,
      actorId,
      tenantId,
      meta: {
        accionId,
        estado: resultado.estado,
        segmentsUsed: resultado.segmentsUsed,
      },
    })

    return jsonResponse(
      {
        success: resultado.estado === 'ejecutada',
        estado: resultado.estado,
        segmentsUsed: resultado.segmentsUsed,
        errorMessage: resultado.errorMessage,
        // §34: despachar y poder probarlo son dos cosas distintas, y el
        // llamador debe poder distinguirlas.
        envioId: resultado.envioId,
        evidenciaRegistrada: resultado.evidenciaRegistrada,
      },
      200,
      correlationId,
    )
  }),
}
