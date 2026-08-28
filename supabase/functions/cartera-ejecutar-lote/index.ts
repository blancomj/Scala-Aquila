// CAR §18.4 — worker por LOTES de acciones de cobranza. Es el paso 1 de
// WORKER_ACCIONES_COBRANZA: decidir a quién le toca hoy. Los pasos 2 a 7
// los hace _shared/despacho_cobranza.ts, compartido con el worker
// individual.
//
// Por qué existe separado del job de cálculo (cartera-recalcular): las
// notificaciones fallan y hay que reintentar, el cálculo debe poder correrse
// sin enviar nada, y el volumen de envío tiene límites de proveedor. Son
// tres razones para no mezclarlos, y el rector las fija en §18.4.
//
// MODO SIMULACIÓN, y es el DEFECTO a propósito. Este endpoint gasta dinero
// real: cada acción despachada es un SMS facturado. Que haya que pedir
// 'ejecucion' de forma explícita es la diferencia entre una corrida de
// prueba y una factura inesperada. La simulación recorre las mismas
// validaciones y renderiza los mismos mensajes; solo se salta el envío.
//
// SECUENCIAL, no paralelo: el proveedor tiene límites de tasa y el orden de
// los envíos es parte de la evidencia. Un lote que dispara cincuenta SMS a
// la vez se gana un 429 del proveedor y deja media cartera sin notificar,
// que es peor que tardar unos segundos más.
import { createClient } from '@supabase/supabase-js'
import { withSupabase } from '@supabase/server'
import { z } from 'zod'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { despacharAccionCobranza } from '../_shared/despacho_cobranza.ts'
import { errorResponse, jsonResponse } from '../_shared/http.ts'
import { logEvent } from '../_shared/logger.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 20
const RATE_LIMIT_VENTANA = '1 hour'

/** Tope duro por corrida. Un lote que se desboca cuesta dinero real. */
const LIMITE_MAXIMO = 200
const LIMITE_DEFECTO = 50

const payloadSchema = z.object({
  tenant_id: z.string().uuid(),
  // REC-CAR-008: fecha de corte explícita, nunca la del sistema. Se
  // despacha lo programado HASTA esa fecha.
  fecha_corte: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha_corte debe ser YYYY-MM-DD'),
  modo: z.enum(['simulacion', 'ejecucion']).default('simulacion'),
  limite: z.number().int().positive().max(LIMITE_MAXIMO).default(LIMITE_DEFECTO),
  alcance_inmuebles: z.array(z.string().uuid()).optional(),
})

interface LineaResultado {
  accionId: string
  inmuebleId: string
  resultado: 'despachada' | 'fallida' | 'simulada' | 'omitida'
  motivo?: string
  contenido?: string
  destinatarioContacto?: string
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
    const { tenant_id: tenantId, fecha_corte: fechaCorte, modo, limite, alcance_inmuebles: alcance } = parseo.data

    const bloqueo = await enforceRateLimit(
      ctx.supabase,
      `cartera_ejecutar_lote:${actorId}`,
      RATE_LIMIT_MAX_HITS,
      RATE_LIMIT_VENTANA,
      correlationId,
    )
    if (bloqueo) return bloqueo

    // Ejecutar de verdad es de administrador; simular basta con auxiliar.
    // Quien puede gastar el presupuesto de mensajería no es cualquiera.
    const rolesExigidos = modo === 'ejecucion' ? ['administrador'] : ['auxiliar']
    const { data: tieneRol, error: errorRol } = await ctx.supabase.rpc('has_role', {
      p_tenant: tenantId,
      p_roles: rolesExigidos,
    })
    if (errorRol) {
      return errorResponse(500, 'INTERNAL_ERROR', errorRol.message, undefined, correlationId)
    }
    if (!tieneRol) {
      return errorResponse(
        403,
        'FORBIDDEN',
        modo === 'ejecucion'
          ? 'Ejecutar un lote de cobranza requiere rol administrador.'
          : 'Se requiere rol auxiliar en esta copropiedad.',
        undefined,
        correlationId,
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) {
      return errorResponse(500, 'INTERNAL_ERROR', 'Configuración incompleta.', undefined, correlationId)
    }
    const admin = createClient<Database>(supabaseUrl, serviceKey)

    // §18.4 paso 1 — lo programado hasta la fecha de corte y todavía sin
    // despachar. El orden por fecha_programada hace que la deuda más
    // antigua salga primero cuando el límite corta el lote.
    let consulta = admin
      .from('acciones_cobranza')
      .select('id, inmueble_id')
      .eq('tenant_id', tenantId)
      .eq('canal', 'sms')
      .in('estado', ['programada', 'aprobada'])
      .lte('fecha_programada', fechaCorte)
      .order('fecha_programada', { ascending: true })
      .order('id', { ascending: true })
      .limit(limite)
    if (alcance && alcance.length > 0) {
      consulta = consulta.in('inmueble_id', alcance)
    }

    const { data: pendientes, error: errorPendientes } = await consulta
    if (errorPendientes) {
      return errorResponse(500, 'INTERNAL_ERROR', errorPendientes.message, undefined, correlationId)
    }

    const lineas: LineaResultado[] = []
    let despachadas = 0
    let fallidas = 0
    let simuladas = 0
    let omitidas = 0

    for (const pendiente of pendientes) {
      const resultado = await despacharAccionCobranza(admin, {
        tenantId,
        accionId: pendiente.id,
        actorId,
        modo,
      })

      if (resultado.tipo === 'no_ejecutable') {
        omitidas += 1
        lineas.push({
          accionId: pendiente.id,
          inmuebleId: pendiente.inmueble_id,
          resultado: 'omitida',
          motivo: `${resultado.codigo}: ${resultado.mensaje}`,
        })
        continue
      }

      if (resultado.tipo === 'simulada') {
        simuladas += 1
        lineas.push({
          accionId: pendiente.id,
          inmuebleId: pendiente.inmueble_id,
          resultado: 'simulada',
          contenido: resultado.contenido,
          destinatarioContacto: resultado.destinatarioContacto,
        })
        continue
      }

      if (resultado.estado === 'ejecutada') {
        despachadas += 1
      } else {
        fallidas += 1
      }
      lineas.push({
        accionId: pendiente.id,
        inmuebleId: pendiente.inmueble_id,
        resultado: resultado.estado === 'ejecutada' ? 'despachada' : 'fallida',
        motivo: resultado.errorMessage ?? undefined,
      })
    }

    logEvent({
      level: 'info',
      action: 'cartera_ejecutar_lote.completado',
      correlationId,
      actorId,
      tenantId,
      meta: { fechaCorte, modo, candidatas: pendientes.length, despachadas, fallidas, simuladas, omitidas },
    })

    return jsonResponse(
      {
        modo,
        fechaCorte,
        candidatas: pendientes.length,
        despachadas,
        fallidas,
        simuladas,
        omitidas,
        // El lote se corta en `limite`: si vino lleno, quedan más
        // esperando y el llamador debe volver a invocar.
        hayMas: pendientes.length === limite,
        lineas,
      },
      200,
      correlationId,
    )
  }),
}
