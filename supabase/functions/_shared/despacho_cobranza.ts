// CAR §18.4 — el despacho de UNA acción de cobranza, extraído aquí para
// que lo compartan el worker individual (ejecutar-accion-cobranza) y el
// worker por lotes (cartera-ejecutar-lote). Antes vivía dentro del handler
// HTTP del primero; duplicarlo en el segundo habría garantizado que los
// dos se separaran con el tiempo, y la evidencia probatoria no admite dos
// versiones de "qué fue lo que se envió".
//
// Cubre los pasos 2 a 7 de WORKER_ACCIONES_COBRANZA:
//   2. resolver destinatario y contacto vigente
//   3. renderizar plantilla → contenido_hash
//   4. enviar por el canal → referencia_externa + evidencia (§34.3)
//   5. estado = ejecutada | fallida  ('ejecutada' = DESPACHADA, REC-CAR-016)
//   6. evento COBRANZA_ACCION_EJECUTADA | COBRANZA_ACCION_FALLIDA
//   7. tope de reintentos: max_intentos de la estrategia
//
// El paso 1 —a quién le toca hoy— es del llamador: uno recibe la acción
// por parámetro, el otro la busca en lote.
//
// Alcance SMS, heredado del worker original (decisión de 2026-08-17):
// email y whatsapp entran cuando exista su despachador. El webhook de
// acuses ya sirve a los tres.
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { esTelefonoValido, renderSmsTemplate, SMS_FIELD_REGISTRY } from '../../../packages/shared/src/sms.ts'
import { sendSms } from './sms_provider.ts'

export type ClienteAdmin = ReturnType<typeof createClient<Database>>

export const EVENT_TYPE_SOPORTADO = 'cartera_pago_vencido'

export type ResultadoDespacho =
  | {
      readonly tipo: 'despachada'
      readonly estado: 'ejecutada' | 'fallida'
      readonly envioId: string | null
      readonly evidenciaRegistrada: boolean
      readonly evidenciaError: string | null
      readonly segmentsUsed: number
      readonly errorMessage: string | null
      readonly contenido: string
    }
  | {
      readonly tipo: 'simulada'
      readonly contenido: string
      readonly destinatarioContacto: string
      readonly intentoNumero: number
    }
  /** No se puede despachar y no es un fallo técnico: falta un requisito. */
  | { readonly tipo: 'no_ejecutable'; readonly codigo: string; readonly mensaje: string }

function formatearMoneda(valor: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(valor)
}

export async function calcularContenidoHash(texto: string): Promise<string> {
  const bytes = new TextEncoder().encode(texto)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * CAR §34.3 — el hecho material del envío y su primer acuse.
 *
 * El acuse inicial NO es 'entregado' aunque el proveedor haya aceptado el
 * mensaje: aceptar no es entregar (REC-CAR-016). Se registra 'encolado' y
 * es webhook-brevo el que después dirá si llegó. Un fallo del proveedor sí
 * se cierra aquí como 'fallido': de ese no va a llegar ningún acuse.
 */
async function registrarEvidenciaEnvio(
  admin: ClienteAdmin,
  datos: {
    tenantId: string
    accionId: string
    intentoNumero: number
    canal: Database['public']['Enums']['canal_cobranza_t']
    destinatarioTerceroId: string
    destinatarioContacto: string
    plantillaCodigo: string
    contenidoRenderizado: string
    contenidoHash: string
    referenciaExterna: string | null
    enviadoPor: string | null
    exito: boolean
    errorMensaje: string | null
  },
): Promise<{ envioId: string | null; error: string | null }> {
  const { data: envio, error: errorEnvio } = await admin
    .from('acciones_cobranza_envios')
    .insert({
      tenant_id: datos.tenantId,
      accion_id: datos.accionId,
      intento_numero: datos.intentoNumero,
      canal: datos.canal,
      destinatario_tercero_id: datos.destinatarioTerceroId,
      destinatario_contacto: datos.destinatarioContacto,
      plantilla_codigo: datos.plantillaCodigo,
      // 0 = plantilla sin versionado (PRQ-CAR-021 pendiente). Ver
      // 20260906130000: no se escribe 1 para disimular que no hay historial.
      plantilla_version: 0,
      contenido_renderizado: datos.contenidoRenderizado,
      contenido_hash: datos.contenidoHash,
      proveedor: 'brevo',
      referencia_externa: datos.referenciaExterna,
      enviado_por: datos.enviadoPor,
    })
    .select('id')
    .single()
  if (errorEnvio) return { envioId: null, error: errorEnvio.message }

  const { error: errorAcuse } = await admin.from('acciones_cobranza_acuses').insert({
    tenant_id: datos.tenantId,
    envio_id: envio.id,
    estado: datos.exito ? 'encolado' : 'fallido',
    ocurrido_at: new Date().toISOString(),
    origen: 'proveedor',
    motivo: datos.exito ? null : datos.errorMensaje,
  })
  if (errorAcuse) return { envioId: envio.id, error: errorAcuse.message }

  return { envioId: envio.id, error: null }
}

/**
 * §18.4 paso 6 — I-C13: toda transición debe poder explicarse. Mejor
 * esfuerzo: un evento que no se pudo escribir no invalida un SMS que ya
 * salió, así que no propaga el error.
 *
 * fecha_corte = fecha_programada de la acción, que ya está congelada
 * (§10.3): usar la fecha del sistema haría que reprocesar el mismo día
 * produjera un evento distinto.
 */
async function emitirEventoDespacho(
  admin: ClienteAdmin,
  datos: {
    tenantId: string
    accionId: string
    inmuebleId: string
    fechaCorte: string
    intentoNumero: number
    exito: boolean
    motivo: string
    actorId: string | null
  },
): Promise<void> {
  const tipo = datos.exito ? 'COBRANZA_ACCION_EJECUTADA' : 'COBRANZA_ACCION_FALLIDA'
  await admin.from('eventos_cartera').insert({
    tenant_id: datos.tenantId,
    tipo,
    inmueble_id: datos.inmuebleId,
    entidad_tipo: 'acciones_cobranza',
    entidad_id: datos.accionId,
    fecha_corte: datos.fechaCorte,
    estado_nuevo: { estado: datos.exito ? 'ejecutada' : 'fallida', intento: datos.intentoNumero },
    motivo: datos.motivo,
    origen: datos.actorId ? 'usuario' : 'job',
    actor_id: datos.actorId,
    // IDEM-03: reprocesar el mismo intento no duplica el evento.
    dedup_key: `${tipo}:${datos.accionId}:${String(datos.intentoNumero)}`,
  })
}

/**
 * Despacha una acción de cobranza. `modo: 'simulacion'` recorre TODAS las
 * validaciones y renderiza el mensaje, pero no envía ni escribe nada — es
 * lo que permite ver qué haría una corrida diaria sin gastar un solo SMS
 * (§18.1).
 */
export async function despacharAccionCobranza(
  admin: ClienteAdmin,
  opciones: {
    readonly tenantId: string
    readonly accionId: string
    readonly actorId: string | null
    readonly modo: 'simulacion' | 'ejecucion'
  },
): Promise<ResultadoDespacho> {
  const { data: accion, error: errorAccion } = await admin
    .from('acciones_cobranza')
    .select(
      'id, estado, canal, estrategia_id, fecha_programada, dias_mora_al_momento, deuda_total_al_momento, destinatario_tercero_id, inmueble_id',
    )
    .eq('tenant_id', opciones.tenantId)
    .eq('id', opciones.accionId)
    .maybeSingle()
  if (errorAccion) {
    return { tipo: 'no_ejecutable', codigo: 'INTERNAL_ERROR', mensaje: errorAccion.message }
  }
  if (!accion) {
    return {
      tipo: 'no_ejecutable',
      codigo: 'ACCION_COBRANZA_NO_ENCONTRADA',
      mensaje: `No existe la acción ${opciones.accionId}.`,
    }
  }

  if (accion.canal !== 'sms') {
    return {
      tipo: 'no_ejecutable',
      codigo: 'ACCION_COBRANZA_CANAL_NO_SOPORTADO',
      mensaje: `Este worker solo ejecuta canal='sms' — la acción ${accion.id} usa '${accion.canal}'.`,
    }
  }
  if (accion.estado !== 'programada' && accion.estado !== 'aprobada') {
    return {
      tipo: 'no_ejecutable',
      codigo: 'ACCION_COBRANZA_ESTADO_NO_EJECUTABLE',
      mensaje: `La acción ${accion.id} está en estado '${accion.estado}', no en programada/aprobada.`,
    }
  }
  if (!accion.estrategia_id) {
    return {
      tipo: 'no_ejecutable',
      codigo: 'ACCION_COBRANZA_SIN_PLANTILLA',
      mensaje: `La acción ${accion.id} no tiene estrategia asociada (creada_por='manual' sin plantilla_codigo).`,
    }
  }

  const { data: estrategia, error: errorEstrategia } = await admin
    .from('estrategias_cobranza')
    .select('plantilla_codigo, max_intentos')
    .eq('id', accion.estrategia_id)
    .maybeSingle()
  if (errorEstrategia) {
    return { tipo: 'no_ejecutable', codigo: 'INTERNAL_ERROR', mensaje: errorEstrategia.message }
  }
  const eventType = estrategia?.plantilla_codigo ?? null
  if (!eventType) {
    return {
      tipo: 'no_ejecutable',
      codigo: 'ACCION_COBRANZA_SIN_PLANTILLA',
      mensaje: `La estrategia ${accion.estrategia_id} no tiene plantilla_codigo configurado.`,
    }
  }
  if (eventType !== EVENT_TYPE_SOPORTADO) {
    return {
      tipo: 'no_ejecutable',
      codigo: 'ACCION_COBRANZA_EVENTO_NO_SOPORTADO',
      mensaje: `Este worker solo soporta el evento '${EVENT_TYPE_SOPORTADO}' — la estrategia usa '${eventType}'.`,
    }
  }

  // §18.4 paso 7 — el tope de reintentos se cuenta sobre los ENVÍOS
  // reales, no sobre un contador en la acción: es el único número que no
  // se puede desincronizar de lo que de verdad salió.
  const { count: enviosPrevios, error: errorConteo } = await admin
    .from('acciones_cobranza_envios')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', opciones.tenantId)
    .eq('accion_id', accion.id)
  if (errorConteo) {
    return { tipo: 'no_ejecutable', codigo: 'INTERNAL_ERROR', mensaje: errorConteo.message }
  }
  const intentoNumero = (enviosPrevios ?? 0) + 1
  const maxIntentos = estrategia?.max_intentos ?? 1
  if (intentoNumero > maxIntentos) {
    return {
      tipo: 'no_ejecutable',
      codigo: 'ACCION_COBRANZA_INTENTOS_AGOTADOS',
      mensaje: `La acción ${accion.id} ya agotó sus ${String(maxIntentos)} intentos (§18.4 paso 7).`,
    }
  }

  const { data: plantilla, error: errorPlantilla } = await admin
    .from('plantillas_sms')
    .select('cuerpo')
    .eq('tenant_id', opciones.tenantId)
    .eq('event_type', eventType)
    .eq('activo', true)
    .maybeSingle()
  if (errorPlantilla) {
    return { tipo: 'no_ejecutable', codigo: 'INTERNAL_ERROR', mensaje: errorPlantilla.message }
  }
  if (!plantilla) {
    return {
      tipo: 'no_ejecutable',
      codigo: 'SMS_TEMPLATE_NOT_FOUND',
      mensaje: `No hay una plantilla activa para el evento '${eventType}' en este tenant.`,
    }
  }

  const [{ data: tercero, error: errorTercero }, { data: inmueble, error: errorInmueble }] = await Promise.all([
    admin.from('terceros').select('telefono, nombre_completo').eq('id', accion.destinatario_tercero_id).maybeSingle(),
    admin.from('inmuebles').select('codigo').eq('id', accion.inmueble_id).maybeSingle(),
  ])
  if (errorTercero) return { tipo: 'no_ejecutable', codigo: 'INTERNAL_ERROR', mensaje: errorTercero.message }
  if (errorInmueble) return { tipo: 'no_ejecutable', codigo: 'INTERNAL_ERROR', mensaje: errorInmueble.message }
  if (!tercero || !inmueble) {
    return { tipo: 'no_ejecutable', codigo: 'INTERNAL_ERROR', mensaje: 'Destinatario o inmueble inconsistente.' }
  }
  if (!tercero.telefono || !esTelefonoValido(tercero.telefono)) {
    return {
      tipo: 'no_ejecutable',
      codigo: 'ACCION_COBRANZA_DESTINATARIO_SIN_TELEFONO',
      mensaje: `El tercero ${accion.destinatario_tercero_id} no tiene un teléfono válido registrado.`,
    }
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

  if (opciones.modo === 'simulacion') {
    return {
      tipo: 'simulada',
      contenido: textoRenderizado,
      destinatarioContacto: tercero.telefono,
      intentoNumero,
    }
  }

  await admin.from('acciones_cobranza').update({ estado: 'ejecutando' }).eq('id', accion.id)

  const resultadoEnvio = await sendSms({
    to: tercero.telefono,
    body: textoRenderizado,
    reference: accion.id,
  })
  const contenidoHash = await calcularContenidoHash(textoRenderizado)

  // La evidencia va ANTES de cerrar la acción: si esto falla, el SMS ya
  // salió y hay que saberlo ahora, no el día que un juez pida la prueba.
  const evidencia = await registrarEvidenciaEnvio(admin, {
    tenantId: opciones.tenantId,
    accionId: accion.id,
    intentoNumero,
    canal: accion.canal,
    destinatarioTerceroId: accion.destinatario_tercero_id,
    destinatarioContacto: tercero.telefono,
    plantillaCodigo: eventType,
    contenidoRenderizado: textoRenderizado,
    contenidoHash,
    referenciaExterna: resultadoEnvio.providerMessageId ?? null,
    enviadoPor: opciones.actorId,
    exito: resultadoEnvio.success,
    errorMensaje: resultadoEnvio.errorMessage ?? null,
  })

  await admin
    .from('acciones_cobranza')
    .update({
      estado: resultadoEnvio.success ? 'ejecutada' : 'fallida',
      fecha_ejecucion: new Date().toISOString(),
      contenido_hash: contenidoHash,
      referencia_externa: resultadoEnvio.providerMessageId ?? null,
      destinatario_contacto: tercero.telefono,
      notas: resultadoEnvio.success ? null : resultadoEnvio.errorMessage,
      ejecutada_por: opciones.actorId,
    })
    .eq('id', accion.id)

  await emitirEventoDespacho(admin, {
    tenantId: opciones.tenantId,
    accionId: accion.id,
    inmuebleId: accion.inmueble_id,
    fechaCorte: accion.fecha_programada,
    intentoNumero,
    exito: resultadoEnvio.success,
    motivo: resultadoEnvio.success
      ? `SMS despachado al proveedor (intento ${String(intentoNumero)}). Despachada no es recibida: la entrega se acredita por acuse (§34).`
      : `Fallo del proveedor en el intento ${String(intentoNumero)}: ${resultadoEnvio.errorMessage ?? 'sin detalle'}`,
    actorId: opciones.actorId,
  })

  return {
    tipo: 'despachada',
    estado: resultadoEnvio.success ? 'ejecutada' : 'fallida',
    envioId: evidencia.envioId,
    evidenciaRegistrada: evidencia.error === null,
    evidenciaError: evidencia.error,
    segmentsUsed: resultadoEnvio.segmentsUsed,
    errorMessage: resultadoEnvio.errorMessage ?? null,
    contenido: textoRenderizado,
  }
}
