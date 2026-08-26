// E5 — expone imputarPago()/registrarPago() (packages/liquidation-engine)
// al agent: registra un pago y lo aplica contra el ledger de cuenta
// corriente según la estrategia de la política vigente (AD-36).
//
// pagos/pago_aplicaciones no tienen política INSERT para `authenticated`
// (20260816100000, mismo criterio que liquidaciones) — el rol se verifica
// aquí explícitamente antes de usar ctx.supabaseAdmin, igual que
// liquidar-periodo/index.ts.
import { withSupabase } from '@supabase/server'
import { z } from 'zod'
import { money } from '@aquila/financial-kernel'
// dist/index.js (compilado), no src/index.ts — mismo motivo que
// liquidar-periodo/index.ts: Deno no resuelve especificadores .js que en
// realidad apuntan a hermanos .ts (convención NodeNext del build de Node).
import {
  clavePeriodo,
  imputarPago,
  obtenerCargosAbiertos,
  obtenerPoliticaImputacion,
  registrarPago,
} from '../../../packages/liquidation-engine/dist/index.js'
import { esTelefonoValido, renderSmsTemplate } from '../../../packages/shared/src/sms.ts'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse } from '../_shared/http.ts'
import { logEvent } from '../_shared/logger.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'
import { sendSms } from '../_shared/sms_provider.ts'

const EVENT_TYPE_PAGO_CONFIRMADO = 'cartera_pago_confirmado'

function formatearMoneda(valor: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(valor)
}

function formatearFecha(fechaIso: string): string {
  // fechaIso es YYYY-MM-DD (ya validado por zod) — se parsea como fecha
  // local, no UTC, para que no se corra un día según la zona del runtime.
  const [anio, mes, dia] = fechaIso.split('-').map(Number)
  return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long' }).format(
    new Date(anio as number, (mes as number) - 1, dia),
  )
}

/**
 * SMS de confirmación de pago — mejor esfuerzo, nunca bloquea la respuesta:
 * el pago ya quedó registrado antes de llegar aquí, así que un fallo en la
 * notificación (sin pagador marcado, sin plantilla activa, Brevo caído) se
 * loguea y ya. `es_pagador`/`recibe_notificaciones` (20260820100000) son la
 * única resolución "destinatario de un inmueble" sin ambigüedad que existe
 * hoy en el esquema — el catálogo PERSONA_PREDIO no tiene un rol
 * "residente" genérico, así que no se inventa uno aquí.
 */
async function notificarPagoConfirmado(
  cliente: Parameters<typeof obtenerCargosAbiertos>[0],
  params: {
    tenantId: string
    inmuebleId: string
    inmuebleCodigo: string
    monto: number
    fechaPago: string
  },
  correlationId: string,
): Promise<void> {
  try {
    const { data: pagador, error: errorPagador } = await cliente
      .from('inmueble_persona_rol')
      .select('tercero:terceros(telefono, nombre_completo)')
      .eq('tenant_id', params.tenantId)
      .eq('inmueble_id', params.inmuebleId)
      .eq('es_pagador', true)
      .eq('recibe_notificaciones', true)
      .is('vigente_hasta', null)
      .maybeSingle()
    if (errorPagador || !pagador?.tercero) return

    const telefono = pagador.tercero.telefono
    if (!telefono || !esTelefonoValido(telefono)) return

    const { data: plantilla, error: errorPlantilla } = await cliente
      .from('plantillas_sms')
      .select('cuerpo')
      .eq('tenant_id', params.tenantId)
      .eq('event_type', EVENT_TYPE_PAGO_CONFIRMADO)
      .eq('activo', true)
      .maybeSingle()
    if (errorPlantilla || !plantilla) return

    const texto = renderSmsTemplate(plantilla.cuerpo, {
      nombreResidente: pagador.tercero.nombre_completo ?? '',
      inmueble: params.inmuebleCodigo,
      montoPagado: formatearMoneda(params.monto),
      fechaPago: formatearFecha(params.fechaPago),
    })

    const resultado = await sendSms({ to: telefono, body: texto, reference: params.inmuebleId })
    logEvent({
      level: resultado.success ? 'info' : 'warn',
      action: 'registrar_pago.sms_confirmacion',
      correlationId,
      tenantId: params.tenantId,
      meta: { inmuebleId: params.inmuebleId, enviado: resultado.success },
      message: resultado.success ? undefined : resultado.errorMessage,
    })
  } catch (excepcion) {
    logEvent({
      level: 'warn',
      action: 'registrar_pago.sms_confirmacion_fallida',
      correlationId,
      tenantId: params.tenantId,
      message: excepcion instanceof Error ? excepcion.message : 'Error inesperado.',
    })
  }
}

const RATE_LIMIT_MAX_HITS = 30
const RATE_LIMIT_VENTANA = '1 hour'

const payloadSchema = z.object({
  inmueble_id: z.string().uuid(),
  monto: z.number().positive(),
  fecha_pago: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha_pago debe ser YYYY-MM-DD.'),
  referencia: z.string().trim().min(1).optional(),
})

// Espejo local de AplicacionPago (packages/liquidation-engine/src/cuenta-corriente.ts)
// — dist/index.js pierde los exports type-only al compilar a JS.
interface AplicacionLocal {
  readonly cargoId: string
  readonly monto: { readonly amount: { toString(): string } }
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
    const datos = parseo.data

    const bloqueo = await enforceRateLimit(
      ctx.supabase,
      `registrar_pago:${actorId}`,
      RATE_LIMIT_MAX_HITS,
      RATE_LIMIT_VENTANA,
      correlationId,
    )
    if (bloqueo) return bloqueo

    // Lectura RLS-scoped: solo resuelve el inmueble si el usuario es miembro
    // de ese tenant — nunca se confía en un tenant_id enviado por el cliente.
    const { data: inmueble, error: errorInmueble } = await ctx.supabase
      .from('inmuebles')
      .select('id, tenant_id, codigo')
      .eq('id', datos.inmueble_id)
      .maybeSingle()
    if (errorInmueble) {
      return errorResponse(500, 'INTERNAL_ERROR', errorInmueble.message, undefined, correlationId)
    }
    if (!inmueble) {
      return errorResponse(
        404,
        'INMUEBLE_NO_ENCONTRADO',
        'El inmueble no existe o no es accesible.',
        undefined,
        correlationId,
      )
    }

    const { data: esAgent, error: errorRol } = await ctx.supabase.rpc('has_role', {
      p_tenant: inmueble.tenant_id,
      p_roles: ['auxiliar'],
    })
    if (errorRol) {
      return errorResponse(500, 'INTERNAL_ERROR', errorRol.message, undefined, correlationId)
    }
    if (!esAgent) {
      return errorResponse(
        403,
        'FORBIDDEN',
        'Solo un agent puede registrar pagos.',
        undefined,
        correlationId,
      )
    }

    const { data: tenant, error: errorTenant } = await ctx.supabase
      .from('tenants')
      .select('moneda')
      .eq('id', inmueble.tenant_id)
      .single()
    if (errorTenant) {
      return errorResponse(500, 'INTERNAL_ERROR', errorTenant.message, undefined, correlationId)
    }

    let cargosAbiertos
    let politicaImputacion
    try {
      cargosAbiertos = await obtenerCargosAbiertos(ctx.supabase, {
        tenantId: inmueble.tenant_id,
        inmuebleId: datos.inmueble_id,
        moneda: tenant.moneda,
      })
      politicaImputacion = await obtenerPoliticaImputacion(ctx.supabase, {
        tenantId: inmueble.tenant_id,
      })
    } catch (excepcion) {
      const mensaje = excepcion instanceof Error ? excepcion.message : 'No se pudo leer el ledger.'
      logEvent({
        level: 'warn',
        action: 'registrar_pago.cuenta_corriente_incompleta',
        correlationId,
        actorId,
        message: mensaje,
      })
      return errorResponse(422, 'CUENTA_CORRIENTE_INCOMPLETA', mensaje, undefined, correlationId)
    }

    // "periodo actual" = el periodo del propio pago (AD-36) — no requiere que
    // el cliente indique un periodo_id aparte.
    const [anioStr, mesStr] = datos.fecha_pago.split('-')
    const periodoActualClave = clavePeriodo({ id: '', anio: Number(anioStr), mes: Number(mesStr) })

    let plan
    try {
      plan = imputarPago(
        money(datos.monto, tenant.moneda),
        cargosAbiertos,
        politicaImputacion.orden,
        politicaImputacion.estrategia,
        periodoActualClave,
      )
    } catch (excepcion) {
      const mensaje =
        excepcion instanceof Error ? excepcion.message : 'No se pudo calcular la imputación.'
      logEvent({
        level: 'error',
        action: 'registrar_pago.imputacion_invalida',
        correlationId,
        actorId,
        message: mensaje,
      })
      return errorResponse(422, 'IMPUTACION_INVALIDA', mensaje, undefined, correlationId)
    }

    // Único uso de service_role: pagos/pago_aplicaciones no tienen política
    // de INSERT para `authenticated` (ver cabecera). El rol ya se verificó
    // arriba, así que este bypass de RLS es intencional y acotado.
    let pagoId: string
    try {
      pagoId = await registrarPago(
        ctx.supabaseAdmin,
        {
          tenantId: inmueble.tenant_id,
          inmuebleId: datos.inmueble_id,
          monto: money(datos.monto, tenant.moneda),
          fechaPago: datos.fecha_pago,
          referencia: datos.referencia,
          registradoPor: actorId,
        },
        plan,
      )
    } catch (excepcion) {
      const mensaje = excepcion instanceof Error ? excepcion.message : 'No se pudo registrar.'
      logEvent({
        level: 'error',
        action: 'registrar_pago.guardado_fallido',
        correlationId,
        actorId,
        message: mensaje,
      })
      return errorResponse(500, 'INTERNAL_ERROR', mensaje, undefined, correlationId)
    }

    logEvent({
      level: 'info',
      action: 'registrar_pago.completada',
      correlationId,
      actorId,
      tenantId: inmueble.tenant_id,
      meta: { pagoId, aplicaciones: plan.aplicaciones.length },
    })

    await notificarPagoConfirmado(
      ctx.supabase,
      {
        tenantId: inmueble.tenant_id,
        inmuebleId: datos.inmueble_id,
        inmuebleCodigo: inmueble.codigo,
        monto: datos.monto,
        fechaPago: datos.fecha_pago,
      },
      correlationId,
    )

    return jsonResponse(
      {
        pago_id: pagoId,
        aplicado: plan.aplicado.amount.toString(),
        no_aplicado: plan.noAplicado.amount.toString(),
        aplicaciones: plan.aplicaciones.map((a: AplicacionLocal) => ({
          cargo_id: a.cargoId,
          monto: a.monto.amount.toString(),
        })),
      },
      200,
      correlationId,
    )
  }),
}
