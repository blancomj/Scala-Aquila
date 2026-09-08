// GOB-9 §3.1 — envío generalizado de UNA comunicación de cualquier módulo
// que no sea cartera (cartera sigue en ejecutar-accion-cobranza/
// cartera-ejecutar-lote sin cambios, cero regresión). Cáscara HTTP sobre
// _shared/comunicacion_generalizada.ts, mismo criterio de
// ejecutar-accion-cobranza/index.ts: valida método, payload, rate limit y
// rol, y delega el envío.
import { createClient } from '@supabase/supabase-js'
import { withSupabase } from '@supabase/server'
import { z } from 'zod'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { enviarComunicacionGeneralizada } from '../_shared/comunicacion_generalizada.ts'
import { errorResponse, jsonResponse } from '../_shared/http.ts'
import { logEvent } from '../_shared/logger.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 200
const RATE_LIMIT_VENTANA = '1 hour'

const payloadSchema = z.object({
  tenant_id: z.string().uuid(),
  origen_modulo: z.string().min(1),
  origen_entidad: z.string().min(1),
  origen_id: z.string().uuid(),
  origen_evento: z.string().min(1),
  canal: z.enum(['sms', 'email']),
  event_type: z.string().min(1),
  destinatario_tercero_id: z.string().uuid(),
  destinatario_contacto: z.string().min(1),
  campos: z.record(z.string()).default({}),
  modo: z.enum(['simulacion', 'ejecucion']).default('ejecucion'),
})

function statusDeCodigo(codigo: string): number {
  if (codigo === 'INTERNAL_ERROR') return 500
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
    const datos = parseo.data

    const bloqueo = await enforceRateLimit(
      ctx.supabase,
      `enviar_comunicacion:${actorId}`,
      RATE_LIMIT_MAX_HITS,
      RATE_LIMIT_VENTANA,
      correlationId,
    )
    if (bloqueo) return bloqueo

    const { data: tieneRol, error: errorRol } = await ctx.supabase.rpc('has_role', {
      p_tenant: datos.tenant_id,
      p_roles: ['auxiliar'],
    })
    if (errorRol) return errorResponse(500, 'INTERNAL_ERROR', errorRol.message, undefined, correlationId)
    if (!tieneRol) {
      return errorResponse(403, 'FORBIDDEN', 'Se requiere rol auxiliar en esta copropiedad.', undefined, correlationId)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) {
      return errorResponse(500, 'INTERNAL_ERROR', 'Configuración incompleta.', undefined, correlationId)
    }
    const admin = createClient<Database>(supabaseUrl, serviceKey)

    const resultado = await enviarComunicacionGeneralizada(admin, {
      tenantId: datos.tenant_id,
      origen: {
        modulo: datos.origen_modulo,
        entidad: datos.origen_entidad,
        id: datos.origen_id,
        evento: datos.origen_evento,
      },
      canal: datos.canal,
      eventType: datos.event_type,
      destinatarioTerceroId: datos.destinatario_tercero_id,
      destinatarioContacto: datos.destinatario_contacto,
      campos: datos.campos,
      actorId,
      modo: datos.modo,
    })

    if (resultado.tipo === 'no_ejecutable') {
      return errorResponse(statusDeCodigo(resultado.codigo), resultado.codigo, resultado.mensaje, undefined, correlationId)
    }

    logEvent({
      level: resultado.tipo === 'enviada' && !resultado.exito ? 'error' : 'info',
      action: 'enviar_comunicacion.completada',
      correlationId,
      actorId,
      tenantId: datos.tenant_id,
      meta: { origen: datos.origen_modulo, entidad: datos.origen_entidad, id: datos.origen_id, resultado },
    })

    return jsonResponse(resultado, 200, correlationId)
  }),
}
