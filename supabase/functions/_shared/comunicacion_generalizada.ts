// GOB-9 §3.1 — envío generalizado de una comunicación, para cualquier
// módulo que NO sea cartera (que sigue usando despacho_cobranza.ts sin
// cambios — cero regresión, prueba 1). Comparte con despacho_cobranza.ts
// el render de plantillas, el hash de contenido y los proveedores; lo que
// cambia es de dónde sale el destinatario/plantilla (parámetros directos,
// no acciones_cobranza/estrategias_cobranza) y cómo se ancla la evidencia
// (origen_modulo/entidad/id/evento en vez de accion_id — GOB-9,
// 20260931950000).
//
// Caso especialmente sensible (spec §3.1): la notificación de
// requerimiento/sanción de GOB-6 exige el mismo rigor probatorio que un
// acuse de cobranza — por eso esta función registra evidencia con la
// MISMA forma (acciones_cobranza_envios + un acuse inicial 'encolado'/
// 'fallido'), no con un registro más liviano.
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { esTelefonoValido, renderSmsTemplate } from '../../../packages/shared/src/sms.ts'
import { esEmailValido, renderEmailTemplate } from '../../../packages/shared/src/email.ts'
import { calcularContenidoHash } from './despacho_cobranza.ts'
import { enviarEmailCobranza } from './email_cobranza_provider.ts'
import { sendSms } from './sms_provider.ts'

export type ClienteAdmin = ReturnType<typeof createClient<Database>>

export interface OrigenComunicacion {
  readonly modulo: string
  readonly entidad: string
  readonly id: string
  readonly evento: string
}

export type ResultadoComunicacion =
  | {
      readonly tipo: 'enviada'
      readonly exito: boolean
      readonly envioId: string | null
      readonly evidenciaError: string | null
      readonly errorMessage: string | null
    }
  | {
      readonly tipo: 'simulada'
      readonly contenido: string
      readonly asunto: string | null
      readonly contacto: string
    }
  | { readonly tipo: 'no_ejecutable'; readonly codigo: string; readonly mensaje: string }

/**
 * Envía (o simula) una comunicación generalizada. A diferencia de
 * despacharAccionCobranza, no resuelve destinatario/plantilla desde
 * acciones_cobranza — el llamador ya sabe a quién y con qué evento
 * (los campos de la plantilla vienen resueltos en `campos`, no desde un
 * FIELD_REGISTRY: cada módulo consumidor conoce sus propios campos).
 */
export async function enviarComunicacionGeneralizada(
  admin: ClienteAdmin,
  opciones: {
    readonly tenantId: string
    readonly origen: OrigenComunicacion
    readonly canal: 'sms' | 'email'
    readonly eventType: string
    readonly destinatarioTerceroId: string
    readonly destinatarioContacto: string
    readonly campos: Record<string, string>
    readonly actorId: string | null
    readonly modo: 'simulacion' | 'ejecucion'
  },
): Promise<ResultadoComunicacion> {
  if (opciones.canal === 'sms' && !esTelefonoValido(opciones.destinatarioContacto)) {
    return { tipo: 'no_ejecutable', codigo: 'DESTINATARIO_SIN_TELEFONO', mensaje: 'Teléfono inválido.' }
  }
  if (opciones.canal === 'email' && !esEmailValido(opciones.destinatarioContacto)) {
    return { tipo: 'no_ejecutable', codigo: 'DESTINATARIO_SIN_EMAIL', mensaje: 'Correo inválido.' }
  }

  let asunto: string | null = null
  let contenido: string
  let plantillaVersion: number

  if (opciones.canal === 'sms') {
    const { data: plantilla, error } = await admin
      .from('plantillas_sms')
      .select('cuerpo, version')
      .eq('tenant_id', opciones.tenantId)
      .eq('event_type', opciones.eventType)
      .eq('activo', true)
      .maybeSingle()
    if (error) return { tipo: 'no_ejecutable', codigo: 'INTERNAL_ERROR', mensaje: error.message }
    if (!plantilla) {
      return {
        tipo: 'no_ejecutable',
        codigo: 'PLANTILLA_NO_ENCONTRADA',
        mensaje: `No hay una plantilla de SMS activa para el evento '${opciones.eventType}'.`,
      }
    }
    contenido = renderSmsTemplate(plantilla.cuerpo, opciones.campos)
    plantillaVersion = plantilla.version
  } else {
    const { data: plantilla, error } = await admin
      .from('email_templates')
      .select('subject, html_content, version')
      .eq('tenant_id', opciones.tenantId)
      .eq('event_type', opciones.eventType)
      .maybeSingle()
    if (error) return { tipo: 'no_ejecutable', codigo: 'INTERNAL_ERROR', mensaje: error.message }
    if (!plantilla || plantilla.html_content.trim().length === 0) {
      return {
        tipo: 'no_ejecutable',
        codigo: 'PLANTILLA_NO_ENCONTRADA',
        mensaje: `No hay una plantilla de correo redactada para el evento '${opciones.eventType}'.`,
      }
    }
    contenido = renderEmailTemplate(plantilla.html_content, opciones.campos)
    asunto = renderEmailTemplate(plantilla.subject, opciones.campos)
    plantillaVersion = plantilla.version
  }

  if (opciones.modo === 'simulacion') {
    return { tipo: 'simulada', contenido, asunto, contacto: opciones.destinatarioContacto }
  }

  const resultadoEnvio =
    opciones.canal === 'email'
      ? await enviarEmailCobranza({
          to: opciones.destinatarioContacto,
          destinatarioNombre: null,
          subject: asunto ?? '',
          html: contenido,
          reference: opciones.origen.id,
          tags: [opciones.origen.modulo, opciones.origen.evento],
        })
      : await sendSms({ to: opciones.destinatarioContacto, body: contenido, reference: opciones.origen.id })

  const materialHash = asunto === null ? contenido : `${asunto}\n\n${contenido}`
  const contenidoHash = await calcularContenidoHash(materialHash)

  const { data: envio, error: errorEnvio } = await admin
    .from('acciones_cobranza_envios')
    .insert({
      tenant_id: opciones.tenantId,
      accion_id: null,
      origen_modulo: opciones.origen.modulo,
      origen_entidad: opciones.origen.entidad,
      origen_id: opciones.origen.id,
      origen_evento: opciones.origen.evento,
      intento_numero: 1,
      canal: opciones.canal,
      destinatario_tercero_id: opciones.destinatarioTerceroId,
      destinatario_contacto: opciones.destinatarioContacto,
      plantilla_codigo: opciones.eventType,
      plantilla_version: plantillaVersion,
      asunto,
      contenido_renderizado: contenido,
      contenido_hash: contenidoHash,
      proveedor: 'brevo',
      referencia_externa: resultadoEnvio.providerMessageId ?? null,
      enviado_por: opciones.actorId,
    })
    .select('id')
    .single()

  if (errorEnvio) {
    return {
      tipo: 'enviada',
      exito: resultadoEnvio.success,
      envioId: null,
      evidenciaError: errorEnvio.message,
      errorMessage: resultadoEnvio.errorMessage ?? null,
    }
  }

  const { error: errorAcuse } = await admin.from('acciones_cobranza_acuses').insert({
    tenant_id: opciones.tenantId,
    envio_id: envio.id,
    estado: resultadoEnvio.success ? 'encolado' : 'fallido',
    ocurrido_at: new Date().toISOString(),
    origen: 'proveedor',
    motivo: resultadoEnvio.success ? null : resultadoEnvio.errorMessage,
  })

  return {
    tipo: 'enviada',
    exito: resultadoEnvio.success,
    envioId: envio.id,
    evidenciaError: errorAcuse?.message ?? null,
    errorMessage: resultadoEnvio.errorMessage ?? null,
  }
}
