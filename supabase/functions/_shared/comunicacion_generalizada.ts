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

/** Forma mínima que comparten EnvioEmailResult (email_cobranza_provider.ts) y SendSmsResult
 * (sms_provider.ts) — lo único que registrarEnvioComunicacion necesita del resultado del envío. */
export interface ResultadoEnvioProveedor {
  readonly success: boolean
  readonly providerMessageId?: string
  readonly errorMessage?: string
}

export interface RegistrarEnvioParams {
  readonly tenantId: string
  readonly origen: OrigenComunicacion
  readonly canal: 'sms' | 'email'
  readonly destinatarioTerceroId: string | null
  readonly destinatarioContacto: string
  readonly plantillaCodigo: string
  readonly plantillaVersion: number
  readonly asunto: string | null
  readonly contenidoRenderizado: string
  readonly resultadoEnvio: ResultadoEnvioProveedor
  readonly actorId: string | null
  /** COM-1 §"es_automatico por emisor" — cada llamador declara a propósito si el envío lo
   * disparó una persona o un cron/batch sin intervención humana en el momento. */
  readonly esAutomatico: boolean
}

export interface ResultadoRegistroEnvio {
  readonly envioId: string | null
  readonly evidenciaError: string | null
}

/** Subconjunto estructural mínimo de ClienteAdmin que registrarEnvioComunicacion necesita — mismo
 * criterio que AdminMinimo en envio_estado_cuenta.ts: así envio_estado_cuenta.ts/envio_recibo_caja.ts
 * pueden llamar esta función sin acoplarse al tipo Database completo, solo ampliando su propio
 * AdminMinimo con estas dos firmas de from(). El ClienteAdmin real (createClient<Database>) también
 * la satisface estructuralmente sin cambios. */
export interface AdminEnvios {
  from(table: 'acciones_cobranza_envios'): {
    insert(fila: Record<string, unknown>): {
      select(campos: 'id'): {
        single(): PromiseLike<{
          data: { id: string } | null
          error: { message: string; code?: string } | null
        }>
      }
    }
  }
  from(table: 'acciones_cobranza_acuses'): {
    insert(fila: Record<string, unknown>): PromiseLike<{ error: { message: string } | null }>
  }
}

/**
 * Registra en acciones_cobranza_envios + acciones_cobranza_acuses el hecho material de un envío
 * ya despachado (o fallido) por el proveedor — extraído de enviarComunicacionGeneralizada (COM-1)
 * para que también lo usen los emisores de correo que hasta ahora solo dejaban rastro en
 * audit_log (compositor, estado de cuenta, recibo de caja): sin esta fila el webhook de Brevo no
 * tiene envio_id contra el cual resolver un acuse.
 *
 * Nunca lanza: el correo/SMS ya salió (o falló, y eso también se registra) antes de llamar aquí —
 * un fallo de auditoría no debe repetir ni revertir el envío real.
 */
export async function registrarEnvioComunicacion(
  admin: AdminEnvios,
  params: RegistrarEnvioParams,
): Promise<ResultadoRegistroEnvio> {
  const materialHash =
    params.asunto === null ? params.contenidoRenderizado : `${params.asunto}\n\n${params.contenidoRenderizado}`
  const contenidoHash = await calcularContenidoHash(materialHash)

  const filaEnvio = {
    tenant_id: params.tenantId,
    accion_id: null,
    origen_modulo: params.origen.modulo,
    origen_entidad: params.origen.entidad,
    origen_id: params.origen.id,
    origen_evento: params.origen.evento,
    intento_numero: 1,
    canal: params.canal,
    destinatario_tercero_id: params.destinatarioTerceroId,
    destinatario_contacto: params.destinatarioContacto,
    plantilla_codigo: params.plantillaCodigo,
    plantilla_version: params.plantillaVersion,
    asunto: params.asunto,
    contenido_renderizado: params.contenidoRenderizado,
    contenido_hash: contenidoHash,
    proveedor: 'brevo',
    referencia_externa: params.resultadoEnvio.providerMessageId ?? null,
    enviado_por: params.actorId,
    es_automatico: params.esAutomatico,
  }

  let { data: envio, error: errorEnvio } = await admin
    .from('acciones_cobranza_envios')
    .insert(filaEnvio)
    .select('id')
    .single()

  // Choque contra acciones_cobranza_envios_origen_unico (23505): un reenvío deliberado del mismo
  // origen/evento merece su propia fila — se reintenta una vez con el evento desambiguado en vez
  // de perder la evidencia de que este segundo envío ocurrió.
  if (errorEnvio && errorEnvio.code === '23505') {
    const reintento = await admin
      .from('acciones_cobranza_envios')
      .insert({ ...filaEnvio, origen_evento: `${params.origen.evento}:${String(Date.now())}` })
      .select('id')
      .single()
    envio = reintento.data
    errorEnvio = reintento.error
  }

  if (errorEnvio || !envio) {
    return { envioId: null, evidenciaError: errorEnvio?.message ?? 'INTERNAL_ERROR: sin fila de envío.' }
  }

  const { error: errorAcuse } = await admin.from('acciones_cobranza_acuses').insert({
    tenant_id: params.tenantId,
    envio_id: envio.id,
    estado: params.resultadoEnvio.success ? 'encolado' : 'fallido',
    ocurrido_at: new Date().toISOString(),
    origen: 'proveedor',
    motivo: params.resultadoEnvio.success ? null : (params.resultadoEnvio.errorMessage ?? null),
  })

  return { envioId: envio.id, evidenciaError: errorAcuse?.message ?? null }
}

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

  // es_automatico: true — el único invocador hoy de enviarComunicacionGeneralizada es el cron de
  // vencimientos de gobierno (enviar-comunicacion no tiene disparo manual desde UI, COM-1).
  const registro = await registrarEnvioComunicacion(admin, {
    tenantId: opciones.tenantId,
    origen: opciones.origen,
    canal: opciones.canal,
    destinatarioTerceroId: opciones.destinatarioTerceroId,
    destinatarioContacto: opciones.destinatarioContacto,
    plantillaCodigo: opciones.eventType,
    plantillaVersion,
    asunto,
    contenidoRenderizado: contenido,
    resultadoEnvio,
    actorId: opciones.actorId,
    esAutomatico: true,
  })

  return {
    tipo: 'enviada',
    exito: resultadoEnvio.success,
    envioId: registro.envioId,
    evidenciaError: registro.evidenciaError,
    errorMessage: resultadoEnvio.errorMessage ?? null,
  }
}
