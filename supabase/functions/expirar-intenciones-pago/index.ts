// Job de expiración de intenciones de pago — Fase 2 §7. Cron, sin JWT,
// mismo patrón que enviar-estados-cuenta-pendientes: CRON_SECRET compartido
// en el header x-cron-secret, no hay usuario humano detrás.
//
// "PSE queda pendiente y nunca confirma → job diario que consulta
// transacciones pendientes y expira intenciones" (Docs/evaluacion/05 §G).
// LA REGLA DE ORO sigue aplicando aquí: si la consulta a la API revela que
// una intención SÍ se aprobó (el webhook nunca llegó), este job la
// materializa por el mismo camino canónico que webhook-pasarela — nunca
// inserta en `pagos` por su cuenta.
import { createClient } from '@supabase/supabase-js'
import { money } from '../../../packages/financial-kernel/dist/index.js'
import { ADAPTADORES, moneyDesdeCentavos } from '../../../packages/payment-gateways/dist/index.js'
import {
  clavePeriodo,
  imputarPago,
  obtenerCargosAbiertos,
  obtenerPoliticaImputacion,
} from '../../../packages/liquidation-engine/dist/index.js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse } from '../_shared/http.ts'
import { logEvent } from '../_shared/logger.ts'

const LIMITE_POR_CORRIDA = 50

interface AplicacionLocal {
  readonly cargoId: string
  readonly monto: { readonly amount: { toString(): string } }
}

Deno.serve(async (req) => {
  const correlationId = crypto.randomUUID()
  const secreto = Deno.env.get('CRON_SECRET')
  if (!secreto || req.headers.get('x-cron-secret') !== secreto) {
    return errorResponse(403, 'FORBIDDEN', 'No autorizado.', undefined, correlationId)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return errorResponse(500, 'INTERNAL_ERROR', 'Configuración incompleta.', undefined, correlationId)
  }
  const admin = createClient<Database>(supabaseUrl, serviceKey)

  const { data: candidatas, error } = await admin
    .from('intenciones_pago')
    .select('id, tenant_id, inmueble_id, proveedor, referencia, monto, estado, transaction_id')
    .in('estado', ['creada', 'pendiente'])
    .lt('expira_at', new Date().toISOString())
    .order('expira_at', { ascending: true })
    .limit(LIMITE_POR_CORRIDA)
  if (error) {
    return errorResponse(500, 'INTERNAL_ERROR', error.message, undefined, correlationId)
  }

  let expiradas = 0
  let materializadas = 0
  const resultados: { id: string; resultado: string }[] = []

  for (const intencion of candidatas ?? []) {
    try {
      // Sin transaction_id no hay nada que verificar contra el proveedor —
      // el checkout nunca llegó a iniciarse (falló crearIntencion o el
      // residente jamás abrió el enlace). Se expira directo.
      if (!intencion.transaction_id) {
        await admin
          .from('intenciones_pago')
          .update({ estado: 'expirada' })
          .eq('id', intencion.id)
          .eq('estado', intencion.estado)
        expiradas += 1
        resultados.push({ id: intencion.id, resultado: 'expirada_sin_transaccion' })
        continue
      }

      const { data: config } = await admin
        .from('pasarela_config')
        .select('id, modo')
        .eq('tenant_id', intencion.tenant_id)
        .eq('proveedor', intencion.proveedor)
        .maybeSingle()
      if (!config) {
        resultados.push({ id: intencion.id, resultado: 'sin_configuracion_omitida' })
        continue
      }

      const { data: credencialesFilas } = await admin.rpc('fn_leer_credenciales_pasarela', {
        p_config_id: config.id,
        p_tenant_id: intencion.tenant_id,
      })
      const credenciales: Record<string, string> = {}
      for (const fila of credencialesFilas ?? []) credenciales[fila.nombre] = fila.valor

      const adaptador = ADAPTADORES[intencion.proveedor]
      const estadoReal = await adaptador.consultarTransaccion(intencion.transaction_id, {
        modo: config.modo,
        credenciales,
      })

      if (estadoReal.estado !== 'aprobada') {
        await admin
          .from('intenciones_pago')
          .update({ estado: 'expirada' })
          .eq('id', intencion.id)
          .eq('estado', intencion.estado)
        expiradas += 1
        resultados.push({ id: intencion.id, resultado: 'expirada' })
        continue
      }

      // Se aprobó y el webhook nunca llegó — se materializa aquí, por el
      // mismo camino que webhook-pasarela (§6.3), nunca uno propio.
      const { data: tenant } = await admin.from('tenants').select('moneda').eq('id', intencion.tenant_id).single()
      if (!tenant) {
        resultados.push({ id: intencion.id, resultado: 'tenant_no_encontrado' })
        continue
      }
      const montoConfirmado = moneyDesdeCentavos(estadoReal.montoCentavos, tenant.moneda)
      const montoEsperado = money(intencion.monto, tenant.moneda)
      const revisionMotivo =
        montoConfirmado.amount.toString() === montoEsperado.amount.toString()
          ? null
          : `Monto confirmado (${montoConfirmado.amount.toString()}) distinto del esperado `
            + `(${montoEsperado.amount.toString()}) — detectado por el job de expiración.`

      const { data: formaPago } = await admin
        .from('lista_tipos')
        .select('id')
        .eq('tipo', 'FORMA_PAGO')
        .eq('codigo', estadoReal.metodo ?? 'transferencia_bancaria')
        .eq('activo', true)
        .or(`tenant_id.is.null,tenant_id.eq.${intencion.tenant_id}`)
        .maybeSingle()
      if (!formaPago) {
        resultados.push({ id: intencion.id, resultado: 'forma_pago_no_resuelta' })
        continue
      }

      const cargosAbiertos = await obtenerCargosAbiertos(admin, {
        tenantId: intencion.tenant_id,
        inmuebleId: intencion.inmueble_id,
        moneda: tenant.moneda,
      })
      const politicaImputacion = await obtenerPoliticaImputacion(admin, { tenantId: intencion.tenant_id })
      const hoy = new Date()
      const plan = imputarPago(
        montoConfirmado,
        cargosAbiertos,
        politicaImputacion.orden,
        politicaImputacion.estrategia,
        clavePeriodo({ id: '', anio: hoy.getUTCFullYear(), mes: hoy.getUTCMonth() + 1 }),
      )

      const { data: pagoId, error: errorRegistrar } = await admin.rpc('fn_registrar_pago_pasarela', {
        p_intencion_id: intencion.id,
        p_transaction_id: estadoReal.transactionId,
        p_monto: Number(montoConfirmado.amount.toString()),
        p_forma_pago_id: formaPago.id,
        p_fecha_pago: hoy.toISOString().slice(0, 10),
        p_aplicaciones: (plan.aplicaciones as AplicacionLocal[]).map((a) => ({
          cargo_id: a.cargoId,
          monto: Number(a.monto.amount.toString()),
        })),
        p_revision_motivo: revisionMotivo,
      })
      if (errorRegistrar) {
        resultados.push({ id: intencion.id, resultado: `error_registrar: ${errorRegistrar.message}` })
        continue
      }

      await admin.from('audit_log').insert({
        tenant_id: intencion.tenant_id,
        action: 'pasarela.pago_confirmado_por_job_expiracion',
        entity_type: 'pagos',
        entity_id: pagoId,
        metadata: { intencion_id: intencion.id, transaction_id: estadoReal.transactionId },
      })
      materializadas += 1
      resultados.push({ id: intencion.id, resultado: 'materializada' })
    } catch (excepcion) {
      const mensaje = excepcion instanceof Error ? excepcion.message : 'desconocido'
      logEvent({
        level: 'error',
        action: 'expirar_intenciones_pago.fila_fallida',
        correlationId,
        tenantId: intencion.tenant_id,
        message: mensaje,
        meta: { intencionId: intencion.id },
      })
      resultados.push({ id: intencion.id, resultado: `error: ${mensaje}` })
    }
  }

  logEvent({
    level: 'info',
    action: 'expirar_intenciones_pago.completada',
    correlationId,
    meta: { candidatas: (candidatas ?? []).length, expiradas, materializadas },
  })

  return jsonResponse({ corrida: correlationId, expiradas, materializadas, resultados }, 200, correlationId)
})
