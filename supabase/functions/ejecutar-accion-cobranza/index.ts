// CAR F4 — worker de ejecución, alcance SOLO SMS (decisión explícita del
// usuario, 2026-08-17: email/whatsapp quedan fuera hasta generalizar sus
// respectivos proveedores). Toma UNA acciones_cobranza ya decidida
// (evaluarAccionesAplicables() + registrarAccionCobranza(), y aprobada si
// correspondía — 20260822280000) y la envía de verdad vía sendSms()
// (Brevo Transactional SMS, ya en uso real por probar-plantilla-sms).
//
// Alcance deliberadamente angosto: SOLO el event_type 'cartera_pago_vencido'
// (packages/shared/src/sms.ts) — es el único cuyos campos
// (nombreResidente/inmueble/diasMora/saldoPendiente) se derivan sin
// ambigüedad de las columnas "foto del momento" de acciones_cobranza
// (dias_mora_al_momento, deuda_total_al_momento). 'cartera_recordatorio_pago'
// necesita una fechaVencimiento que una acción de COBRANZA (que por
// definición ya está en mora) no tiene de forma unívoca — no se inventa un
// origen para ese campo aquí.
//
// No orquesta lotes: procesa una accion_id por invocación. La orquestación
// diaria (CAR §18.1 "modo simulación") es una pieza aparte, todavía sin
// construir.
import { withSupabase } from '@supabase/server'
import { z } from 'zod'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import {
  esTelefonoValido,
  renderSmsTemplate,
  SMS_FIELD_REGISTRY,
} from '../../../packages/shared/src/sms.ts'
import { errorResponse, jsonResponse } from '../_shared/http.ts'
import { logEvent } from '../_shared/logger.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'
import { sendSms } from '../_shared/sms_provider.ts'

// "Dinero real gastado por cada llamada" (mismo criterio que
// probar-plantilla-sms), pero este endpoint sí necesita soportar volumen de
// lote real (una copropiedad puede tener decenas de acciones vencidas el
// mismo día) — 200/hora hasta que exista una orquestación por lotes que
// sustituya la invocación una-por-una.
const RATE_LIMIT_MAX_HITS = 200
const RATE_LIMIT_VENTANA = '1 hour'

const EVENT_TYPE_SOPORTADO = 'cartera_pago_vencido'

const payloadSchema = z.object({
  tenant_id: z.string().uuid(),
  accion_id: z.string().uuid(),
})

function formatearMoneda(valor: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(valor)
}

async function calcularContenidoHash(texto: string): Promise<string> {
  const bytes = new TextEncoder().encode(texto)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
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
      p_roles: ['agent'],
    })
    if (errorRol) {
      return errorResponse(500, 'INTERNAL_ERROR', errorRol.message, undefined, correlationId)
    }
    if (!tieneRol) {
      return errorResponse(403, 'FORBIDDEN', 'Se requiere rol agent en esta copropiedad.', undefined, correlationId)
    }

    const { data: accion, error: errorAccion } = await ctx.supabase
      .from('acciones_cobranza')
      .select(
        'id, estado, canal, estrategia_id, dias_mora_al_momento, deuda_total_al_momento, destinatario_tercero_id, inmueble_id',
      )
      .eq('tenant_id', tenantId)
      .eq('id', accionId)
      .maybeSingle()
    if (errorAccion) {
      return errorResponse(500, 'INTERNAL_ERROR', errorAccion.message, undefined, correlationId)
    }
    if (!accion) {
      return errorResponse(404, 'ACCION_COBRANZA_NO_ENCONTRADA', `No existe la acción ${accionId}.`, undefined, correlationId)
    }

    if (accion.canal !== 'sms') {
      return errorResponse(
        422,
        'ACCION_COBRANZA_CANAL_NO_SOPORTADO',
        `Este worker solo ejecuta canal='sms' — la acción ${accionId} usa '${accion.canal}'.`,
        undefined,
        correlationId,
      )
    }
    if (accion.estado !== 'programada' && accion.estado !== 'aprobada') {
      return errorResponse(
        422,
        'ACCION_COBRANZA_ESTADO_NO_EJECUTABLE',
        `La acción ${accionId} está en estado '${accion.estado}', no en programada/aprobada.`,
        undefined,
        correlationId,
      )
    }

    if (!accion.estrategia_id) {
      return errorResponse(
        422,
        'ACCION_COBRANZA_SIN_PLANTILLA',
        `La acción ${accionId} no tiene estrategia asociada (creada_por='manual' sin plantilla_codigo).`,
        undefined,
        correlationId,
      )
    }
    const { data: estrategia, error: errorEstrategia } = await ctx.supabase
      .from('estrategias_cobranza')
      .select('plantilla_codigo')
      .eq('id', accion.estrategia_id)
      .maybeSingle()
    if (errorEstrategia) {
      return errorResponse(500, 'INTERNAL_ERROR', errorEstrategia.message, undefined, correlationId)
    }
    const eventType = estrategia?.plantilla_codigo ?? null
    if (!eventType) {
      return errorResponse(
        422,
        'ACCION_COBRANZA_SIN_PLANTILLA',
        `La estrategia ${accion.estrategia_id} no tiene plantilla_codigo configurado.`,
        undefined,
        correlationId,
      )
    }
    if (eventType !== EVENT_TYPE_SOPORTADO) {
      return errorResponse(
        422,
        'ACCION_COBRANZA_EVENTO_NO_SOPORTADO',
        `Este worker solo soporta el evento '${EVENT_TYPE_SOPORTADO}' — la estrategia usa '${eventType}'.`,
        undefined,
        correlationId,
      )
    }

    const { data: plantilla, error: errorPlantilla } = await ctx.supabase
      .from('plantillas_sms')
      .select('cuerpo')
      .eq('tenant_id', tenantId)
      .eq('event_type', eventType)
      .eq('activo', true)
      .maybeSingle()
    if (errorPlantilla) {
      return errorResponse(500, 'INTERNAL_ERROR', errorPlantilla.message, undefined, correlationId)
    }
    if (!plantilla) {
      return errorResponse(
        422,
        'SMS_TEMPLATE_NOT_FOUND',
        `No hay una plantilla activa para el evento '${eventType}' en este tenant.`,
        undefined,
        correlationId,
      )
    }

    const [{ data: tercero, error: errorTercero }, { data: inmueble, error: errorInmueble }] = await Promise.all([
      ctx.supabase
        .from('terceros')
        .select('telefono, nombre_completo')
        .eq('id', accion.destinatario_tercero_id)
        .maybeSingle(),
      ctx.supabase.from('inmuebles').select('codigo').eq('id', accion.inmueble_id).maybeSingle(),
    ])
    if (errorTercero) return errorResponse(500, 'INTERNAL_ERROR', errorTercero.message, undefined, correlationId)
    if (errorInmueble) return errorResponse(500, 'INTERNAL_ERROR', errorInmueble.message, undefined, correlationId)
    if (!tercero || !inmueble) {
      return errorResponse(500, 'INTERNAL_ERROR', 'Destinatario o inmueble inconsistente.', undefined, correlationId)
    }
    if (!tercero.telefono || !esTelefonoValido(tercero.telefono)) {
      return errorResponse(
        422,
        'ACCION_COBRANZA_DESTINATARIO_SIN_TELEFONO',
        `El tercero ${accion.destinatario_tercero_id} no tiene un teléfono válido registrado.`,
        undefined,
        correlationId,
      )
    }

    const campos = SMS_FIELD_REGISTRY[eventType] ?? []
    const params: Record<string, string> = {}
    for (const campo of campos) {
      if (campo.field === 'nombreResidente') params[campo.field] = tercero.nombre_completo ?? ''
      else if (campo.field === 'inmueble') params[campo.field] = inmueble.codigo
      else if (campo.field === 'diasMora') params[campo.field] = String(accion.dias_mora_al_momento)
      else if (campo.field === 'saldoPendiente') params[campo.field] = formatearMoneda(accion.deuda_total_al_momento)
    }
    const textoRenderizado = renderSmsTemplate(plantilla.cuerpo, params)

    const { error: errorEjecutando } = await ctx.supabase
      .from('acciones_cobranza')
      .update({ estado: 'ejecutando' })
      .eq('id', accionId)
    if (errorEjecutando) {
      return errorResponse(500, 'INTERNAL_ERROR', errorEjecutando.message, undefined, correlationId)
    }

    const resultadoEnvio = await sendSms({
      to: tercero.telefono,
      body: textoRenderizado,
      reference: accionId,
    })
    const contenidoHash = await calcularContenidoHash(textoRenderizado)

    const { error: errorFinal } = await ctx.supabase
      .from('acciones_cobranza')
      .update({
        estado: resultadoEnvio.success ? 'ejecutada' : 'fallida',
        fecha_ejecucion: new Date().toISOString(),
        contenido_hash: contenidoHash,
        referencia_externa: resultadoEnvio.providerMessageId ?? null,
        destinatario_contacto: tercero.telefono,
        notas: resultadoEnvio.success ? null : resultadoEnvio.errorMessage,
        ejecutada_por: actorId,
      })
      .eq('id', accionId)
    if (errorFinal) {
      return errorResponse(500, 'INTERNAL_ERROR', errorFinal.message, undefined, correlationId)
    }

    logEvent({
      level: resultadoEnvio.success ? 'info' : 'error',
      action: 'ejecutar_accion_cobranza.completada',
      correlationId,
      actorId,
      tenantId,
      meta: { accionId, eventType, success: resultadoEnvio.success, segmentsUsed: resultadoEnvio.segmentsUsed },
    })

    return jsonResponse(
      {
        success: resultadoEnvio.success,
        estado: resultadoEnvio.success ? 'ejecutada' : 'fallida',
        segmentsUsed: resultadoEnvio.segmentsUsed,
        errorMessage: resultadoEnvio.errorMessage,
      },
      200,
      correlationId,
    )
  }),
}
