// Webhook de pasarela de pago — Fase 2 §6. Endpoint PÚBLICO, sin JWT: lo
// llama el proveedor (Wompi hoy), no un usuario. Ruta:
// /functions/v1/webhook-pasarela/{proveedor}/{webhook_token} — el token
// (D-31 punto 4) IDENTIFICA al tenant sin autenticarlo; la firma es lo único
// que autoriza.
//
// LA REGLA DE ORO (§1, §E.5 del doc propietario): esta función nunca hace un
// INSERT propio en `pagos`. Solo fn_registrar_pago_pasarela (idempotente,
// 20260904130000/150000) puede materializar un pago desde una intención.
//
// REQUISITOS INNEGOCIABLES (§6.2):
//   1. Validación criptográfica de la firma — si falla, se descarta.
//   2. Rate-limit por IP.
//   3. VERIFICACIÓN DOBLE contra la API — nunca se confía en el cuerpo del
//      webhook por sí solo; gana la consulta a la API si diverge.
//   4. Respuesta 2xx rápida.
//   5. Cada evento queda en audit_log, incluso los descartados.
//   6. Procesamiento idempotente (lo garantiza fn_registrar_pago_pasarela).
import { createClient } from '@supabase/supabase-js'
import {
  esIgual,
  money,
} from '../../../packages/financial-kernel/dist/index.js'
import {
  ADAPTADORES,
  moneyDesdeCentavos,
} from '../../../packages/payment-gateways/dist/index.js'
import type { PasarelaProveedor } from '../../../packages/payment-gateways/dist/index.js'
import {
  clavePeriodo,
  imputarPago,
  obtenerCargosAbiertos,
  obtenerPoliticaImputacion,
} from '../../../packages/liquidation-engine/dist/index.js'
import { esTelefonoValido, renderSmsTemplate } from '../../../packages/shared/src/sms.ts'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse } from '../_shared/http.ts'
import { logEvent } from '../_shared/logger.ts'
import { sendSms } from '../_shared/sms_provider.ts'

const PROVEEDORES_VALIDOS: readonly PasarelaProveedor[] = ['wompi', 'payu', 'epayco', 'bold']
const EVENT_TYPE_PAGO_CONFIRMADO = 'cartera_pago_confirmado'

function ipDelRequest(req: Request): string {
  const reenviada = req.headers.get('x-forwarded-for')
  const primera = reenviada?.split(',')[0]?.trim()
  return primera && primera.length > 0 ? primera : 'desconocida'
}

function formatearMoneda(valor: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(valor)
}

/** Mejor esfuerzo, nunca bloquea la respuesta — mismo criterio que
 *  registrar-pago/index.ts::notificarPagoConfirmado (duplicado a propósito,
 *  no factorizado: es el patrón establecido del repo para este tipo de
 *  notificación best-effort). */
async function notificarPagoConfirmado(
  admin: ReturnType<typeof createClient<Database>>,
  params: { tenantId: string; inmuebleId: string; inmuebleCodigo: string; monto: number },
  correlationId: string,
): Promise<void> {
  try {
    const { data: pagador } = await admin
      .from('inmueble_persona_rol')
      .select('tercero:terceros(telefono, nombre_completo)')
      .eq('tenant_id', params.tenantId)
      .eq('inmueble_id', params.inmuebleId)
      .eq('es_pagador', true)
      .eq('recibe_notificaciones', true)
      .is('vigente_hasta', null)
      .maybeSingle()
    const telefono = pagador?.tercero?.telefono
    if (!telefono || !esTelefonoValido(telefono)) return

    const { data: plantilla } = await admin
      .from('plantillas_sms')
      .select('cuerpo')
      .eq('tenant_id', params.tenantId)
      .eq('event_type', EVENT_TYPE_PAGO_CONFIRMADO)
      .eq('activo', true)
      .maybeSingle()
    if (!plantilla) return

    const texto = renderSmsTemplate(plantilla.cuerpo, {
      nombreResidente: pagador?.tercero?.nombre_completo ?? '',
      inmueble: params.inmuebleCodigo,
      montoPagado: formatearMoneda(params.monto),
      fechaPago: new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long' }).format(new Date()),
    })
    await sendSms({ to: telefono, body: texto, reference: params.inmuebleId })
  } catch (excepcion) {
    logEvent({
      level: 'warn',
      action: 'webhook_pasarela.sms_confirmacion_fallida',
      correlationId,
      tenantId: params.tenantId,
      message: excepcion instanceof Error ? excepcion.message : 'desconocido',
    })
  }
}

Deno.serve(async (req) => {
  const correlationId = crypto.randomUUID()
  if (req.method !== 'POST') {
    return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Solo POST.', undefined, correlationId)
  }

  // /functions/v1/webhook-pasarela/{proveedor}/{token} — se toman los DOS
  // últimos segmentos, tolerante al prefijo real que use el gateway.
  const segmentos = new URL(req.url).pathname.split('/').filter(Boolean)
  const token = segmentos.at(-1)
  const proveedorRaw = segmentos.at(-2)
  if (!token || !proveedorRaw || !PROVEEDORES_VALIDOS.includes(proveedorRaw as PasarelaProveedor)) {
    return errorResponse(404, 'PASARELA_WEBHOOK_TOKEN_INVALIDO', 'Ruta de webhook inválida.', undefined, correlationId)
  }
  const proveedor = proveedorRaw as PasarelaProveedor

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return errorResponse(500, 'INTERNAL_ERROR', 'Configuración incompleta.', undefined, correlationId)
  }
  const admin = createClient<Database>(supabaseUrl, serviceKey)

  const ip = ipDelRequest(req)
  const { data: permitidoIp, error: errorRateLimit } = await admin.rpc('check_rate_limit', {
    p_bucket: `webhook_pasarela_ip:${ip}`,
    p_max_hits: 240,
    p_window: '1 hour',
  })
  if (errorRateLimit) {
    logEvent({ level: 'error', action: 'rate_limit.check_failed', correlationId, message: errorRateLimit.message })
  } else if (permitidoIp === false) {
    return errorResponse(429, 'RATE_LIMITED', 'Demasiados eventos desde esta dirección.', undefined, correlationId)
  }

  let cuerpoTexto: string
  try {
    cuerpoTexto = await req.text()
  } catch {
    return errorResponse(400, 'INVALID_PAYLOAD', 'No se pudo leer el cuerpo.', undefined, correlationId)
  }
  let payload: unknown
  try {
    payload = JSON.parse(cuerpoTexto)
  } catch {
    return errorResponse(400, 'INVALID_PAYLOAD', 'El cuerpo debe ser JSON válido.', undefined, correlationId)
  }

  const { data: config, error: errorConfig } = await admin
    .from('pasarela_config')
    .select('id, tenant_id, proveedor, modo')
    .eq('webhook_token', token)
    .maybeSingle()
  if (errorConfig) {
    return errorResponse(500, 'INTERNAL_ERROR', errorConfig.message, undefined, correlationId)
  }
  if (!config || config.proveedor !== proveedor) {
    // No hay tenant que auditar de forma fiable (el token no resolvió a
    // ninguno) — se audita igual, con tenant_id null: toda puerta anónima
    // deja rastro (D-27), incluso cuando el rastro es "alguien probó un
    // token que no existe".
    await admin.from('audit_log').insert({
      tenant_id: null,
      action: 'pasarela.webhook_token_invalido',
      entity_type: 'pasarela_config',
      metadata: { proveedor },
      ip,
    })
    return errorResponse(404, 'PASARELA_WEBHOOK_TOKEN_INVALIDO', 'Token de webhook no reconocido.', undefined, correlationId)
  }

  const adaptador = ADAPTADORES[config.proveedor]

  const { data: credencialesFilas, error: errorCred } = await admin.rpc('fn_leer_credenciales_pasarela', {
    p_config_id: config.id,
    p_tenant_id: config.tenant_id,
  })
  if (errorCred) {
    return errorResponse(500, 'INTERNAL_ERROR', 'No se pudieron leer las credenciales de la pasarela.', undefined, correlationId)
  }
  const credenciales: Record<string, string> = {}
  for (const fila of credencialesFilas ?? []) credenciales[fila.nombre] = fila.valor

  const checksumRecibido = (payload as { signature?: { checksum?: unknown } } | null)?.signature?.checksum
  const eventsSecret = credenciales.events_secret
  const firmaValida =
    typeof checksumRecibido === 'string' && !!eventsSecret
      ? adaptador.validarFirmaWebhook(payload, checksumRecibido, eventsSecret)
      : false

  if (!firmaValida) {
    await admin.from('audit_log').insert({
      tenant_id: config.tenant_id,
      action: 'pasarela.webhook_firma_invalida',
      entity_type: 'pasarela_config',
      entity_id: config.id,
      metadata: { proveedor },
      ip,
    })
    logEvent({
      level: 'error',
      action: 'webhook_pasarela.firma_invalida',
      correlationId,
      tenantId: config.tenant_id,
      meta: { proveedor },
    })
    return errorResponse(400, 'PASARELA_WEBHOOK_FIRMA_INVALIDA', 'Firma inválida.', undefined, correlationId)
  }

  let evento
  try {
    evento = adaptador.parsearWebhook(payload)
  } catch (excepcion) {
    const mensaje = excepcion instanceof Error ? excepcion.message : 'Evento no reconocido.'
    await admin.from('audit_log').insert({
      tenant_id: config.tenant_id,
      action: 'pasarela.webhook_evento_no_reconocido',
      entity_type: 'pasarela_config',
      entity_id: config.id,
      metadata: { proveedor, mensaje },
      ip,
    })
    return errorResponse(400, 'INVALID_PAYLOAD', mensaje, undefined, correlationId)
  }

  // ── VERIFICACIÓN DOBLE (§6.2): la API, no el cuerpo del webhook, es la
  //    fuente de verdad. Si difieren, gana la consulta.
  let estadoReal
  try {
    estadoReal = await adaptador.consultarTransaccion(evento.transactionId, {
      modo: config.modo,
      credenciales,
    })
  } catch (excepcion) {
    const mensaje = excepcion instanceof Error ? excepcion.message : 'No se pudo verificar la transacción.'
    logEvent({
      level: 'error',
      action: 'webhook_pasarela.verificacion_fallida',
      correlationId,
      tenantId: config.tenant_id,
      message: mensaje,
      meta: { transactionId: evento.transactionId },
    })
    return errorResponse(502, 'INTERNAL_ERROR', mensaje, undefined, correlationId)
  }

  const divergeDelWebhook = estadoReal.estado !== evento.estado || estadoReal.montoCentavos !== evento.montoCentavos

  await admin.from('audit_log').insert({
    tenant_id: config.tenant_id,
    action: 'pasarela.webhook_recibido',
    entity_type: 'intenciones_pago',
    metadata: {
      proveedor,
      transaction_id: evento.transactionId,
      referencia: evento.referencia,
      estado_webhook: evento.estado,
      estado_verificado: estadoReal.estado,
      diverge_del_webhook: divergeDelWebhook,
    },
    ip,
  })

  if (estadoReal.estado === 'pendiente') {
    return jsonResponse({ estado: 'pendiente' }, 200, correlationId)
  }

  const { data: intencion, error: errorIntencion } = await admin
    .from('intenciones_pago')
    .select('id, estado, monto, inmueble_id, pago_id')
    .eq('tenant_id', config.tenant_id)
    .eq('referencia', evento.referencia)
    .maybeSingle()
  if (errorIntencion) {
    return errorResponse(500, 'INTERNAL_ERROR', errorIntencion.message, undefined, correlationId)
  }
  if (!intencion) {
    logEvent({
      level: 'error',
      action: 'webhook_pasarela.intencion_no_encontrada',
      correlationId,
      tenantId: config.tenant_id,
      meta: { referencia: evento.referencia, transactionId: evento.transactionId },
    })
    return errorResponse(404, 'PASARELA_INTENCION_NO_ENCONTRADA', 'No existe una intención con esa referencia.', undefined, correlationId)
  }

  if (estadoReal.estado === 'rechazada' || estadoReal.estado === 'anulada') {
    if (intencion.pago_id) {
      // Ya había un pago materializado: esto es un REEMBOLSO, no un rechazo
      // de intención — §6.4, fn_anular_pago es la única vía de reversa.
      const { error: errorAnular } = await admin.rpc('fn_anular_pago', {
        p_pago_id: intencion.pago_id,
        p_motivo: `Reembolso reportado por ${adaptador.nombreComercial} (webhook, transacción ${evento.transactionId}).`,
        p_actor_id: null,
      })
      if (errorAnular) {
        return errorResponse(500, 'INTERNAL_ERROR', errorAnular.message, undefined, correlationId)
      }
      return jsonResponse({ estado: 'reembolsado' }, 200, correlationId)
    }
    if (intencion.estado === 'creada' || intencion.estado === 'pendiente') {
      await admin
        .from('intenciones_pago')
        .update({ estado: 'rechazada' })
        .eq('id', intencion.id)
        .eq('estado', intencion.estado)
    }
    return jsonResponse({ estado: 'rechazada' }, 200, correlationId)
  }

  // ── estadoReal.estado === 'aprobada' ────────────────────────────────────
  const { data: tenant, error: errorTenant } = await admin
    .from('tenants')
    .select('moneda')
    .eq('id', config.tenant_id)
    .single()
  if (errorTenant || !tenant) {
    return errorResponse(500, 'INTERNAL_ERROR', errorTenant?.message ?? 'Tenant no encontrado.', undefined, correlationId)
  }

  const montoConfirmado = moneyDesdeCentavos(estadoReal.montoCentavos, tenant.moneda)
  const montoEsperado = money(intencion.monto, tenant.moneda)
  // §4.1: nunca se ajusta en silencio — si diverge, se registra Y se marca.
  const revisionMotivo = esIgual(montoConfirmado, montoEsperado)
    ? null
    : `Monto confirmado (${montoConfirmado.amount.toString()}) distinto del esperado `
      + `(${montoEsperado.amount.toString()}) — revisar antes de conciliar.`

  const { data: formaPago } = await admin
    .from('lista_tipos')
    .select('id')
    .eq('tipo', 'FORMA_PAGO')
    .eq('codigo', estadoReal.metodo ?? 'transferencia_bancaria')
    .eq('activo', true)
    .or(`tenant_id.is.null,tenant_id.eq.${config.tenant_id}`)
    .maybeSingle()
  if (!formaPago) {
    return errorResponse(
      500,
      'INTERNAL_ERROR',
      `No se pudo resolver la forma de pago para el método "${String(estadoReal.metodo)}".`,
      undefined,
      correlationId,
    )
  }

  let cargosAbiertos
  let politicaImputacion
  try {
    cargosAbiertos = await obtenerCargosAbiertos(admin, {
      tenantId: config.tenant_id,
      inmuebleId: intencion.inmueble_id,
      moneda: tenant.moneda,
    })
    politicaImputacion = await obtenerPoliticaImputacion(admin, { tenantId: config.tenant_id })
  } catch (excepcion) {
    const mensaje = excepcion instanceof Error ? excepcion.message : 'No se pudo leer el ledger.'
    return errorResponse(422, 'CUENTA_CORRIENTE_INCOMPLETA', mensaje, undefined, correlationId)
  }

  const hoy = new Date()
  const fechaPago = hoy.toISOString().slice(0, 10)
  const periodoActual = clavePeriodo({ id: '', anio: hoy.getUTCFullYear(), mes: hoy.getUTCMonth() + 1 })

  let plan
  try {
    plan = imputarPago(
      montoConfirmado,
      cargosAbiertos,
      politicaImputacion.orden,
      politicaImputacion.estrategia,
      periodoActual,
    )
  } catch (excepcion) {
    const mensaje = excepcion instanceof Error ? excepcion.message : 'No se pudo calcular la imputación.'
    return errorResponse(422, 'IMPUTACION_INVALIDA', mensaje, undefined, correlationId)
  }

  interface AplicacionLocal {
    readonly cargoId: string
    readonly monto: { readonly amount: { toString(): string } }
  }

  const { data: pagoId, error: errorRegistrar } = await admin.rpc('fn_registrar_pago_pasarela', {
    p_intencion_id: intencion.id,
    p_transaction_id: estadoReal.transactionId,
    p_monto: Number(montoConfirmado.amount.toString()),
    p_forma_pago_id: formaPago.id,
    p_fecha_pago: fechaPago,
    p_aplicaciones: (plan.aplicaciones as AplicacionLocal[]).map((a) => ({
      cargo_id: a.cargoId,
      monto: Number(a.monto.amount.toString()),
    })),
    p_revision_motivo: revisionMotivo,
  })
  if (errorRegistrar) {
    return errorResponse(500, 'INTERNAL_ERROR', errorRegistrar.message, undefined, correlationId)
  }

  await admin.from('audit_log').insert({
    tenant_id: config.tenant_id,
    actor_id: null,
    action: 'pasarela.pago_confirmado',
    entity_type: 'pagos',
    entity_id: pagoId,
    metadata: {
      proveedor,
      intencion_id: intencion.id,
      transaction_id: estadoReal.transactionId,
      diverge_monto: revisionMotivo !== null,
    },
  })

  logEvent({
    level: 'info',
    action: 'webhook_pasarela.pago_confirmado',
    correlationId,
    tenantId: config.tenant_id,
    meta: { pagoId, intencionId: intencion.id, proveedor },
  })

  const { data: inmueble } = await admin.from('inmuebles').select('codigo').eq('id', intencion.inmueble_id).single()
  if (inmueble) {
    await notificarPagoConfirmado(
      admin,
      {
        tenantId: config.tenant_id,
        inmuebleId: intencion.inmueble_id,
        inmuebleCodigo: inmueble.codigo,
        monto: Number(montoConfirmado.amount.toString()),
      },
      correlationId,
    )
  }

  return jsonResponse({ estado: 'procesado', pago_id: pagoId }, 200, correlationId)
})
