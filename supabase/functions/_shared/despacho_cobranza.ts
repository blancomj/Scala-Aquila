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
// Canales: SMS (2026-08-17) y EMAIL (2026-08-29). WhatsApp y postal
// entran cuando exista su despachador. El webhook de acuses ya sirve a
// los tres — mapea los eventos de Brevo de SMS y de correo al mismo
// estado_acuse_t.
//
// Lo que cambia entre SMS y correo es solo el par (plantilla, envío): de
// dónde sale el texto y por qué API se manda. Todo lo demás —tope de
// intentos, evidencia, acuse inicial, evento, cierre de la acción— es
// idéntico, y por eso vive fuera del switch. Duplicar ese tronco por
// canal es exactamente lo que haría que un canal acabara acreditando
// distinto que el otro.
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { esTelefonoValido, renderSmsTemplate, SMS_FIELD_REGISTRY } from '../../../packages/shared/src/sms.ts'
import {
  CORREO_COBRANZA_POR_DEFECTO,
  EMAIL_FIELD_REGISTRY,
  esEmailValido,
  renderEmailTemplate,
} from '../../../packages/shared/src/email.ts'
import { enviarEmailCobranza } from './email_cobranza_provider.ts'
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
      /** Solo SMS: el correo no se cobra por segmentos. */
      readonly segmentsUsed: number
      readonly errorMessage: string | null
      readonly contenido: string
      /** null en SMS. */
      readonly asunto: string | null
    }
  | {
      readonly tipo: 'simulada'
      readonly contenido: string
      readonly asunto: string | null
      readonly destinatarioContacto: string
      readonly intentoNumero: number
      readonly canal: Database['public']['Enums']['canal_cobranza_t']
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
    asunto: string | null
    contenidoRenderizado: string
    contenidoHash: string
    referenciaExterna: string | null
    enviadoPor: string | null
    exito: boolean
    errorMensaje: string | null
    plantillaVersion: number
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
      asunto: datos.asunto,
      // PRQ-CAR-021 (20260907130000): versión real de plantillas_sms/
      // email_templates.version al momento del envío. 0 solo en correo con
      // la plantilla del sistema (sin propia redactada) — nunca en SMS.
      plantilla_version: datos.plantillaVersion,
      contenido_renderizado: datos.contenidoRenderizado,
      contenido_hash: datos.contenidoHash,
      proveedor: 'brevo',
      referencia_externa: datos.referenciaExterna,
      enviado_por: datos.enviadoPor,
      // COM-1: ejecutar-accion-cobranza y cartera-ejecutar-lote solo se invocan con el JWT de un
      // usuario autenticado (ctx.userClaims) — nunca hay una corrida sin una persona detrás.
      es_automatico: false,
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

  // Los canales no automatizables ('telefono', 'fisico', 'interno') caen
  // aquí y NO son un error: son gestión humana. La bandeja los muestra
  // como "gestión manual" y quien administra los cierra a mano.
  if (accion.canal !== 'sms' && accion.canal !== 'email') {
    return {
      tipo: 'no_ejecutable',
      codigo: 'ACCION_COBRANZA_CANAL_NO_SOPORTADO',
      mensaje: `El canal '${accion.canal}' no tiene despacho automático — esta acción se gestiona a mano.`,
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

  const [{ data: tercero, error: errorTercero }, { data: inmueble, error: errorInmueble }] = await Promise.all([
    admin
      .from('terceros')
      .select('telefono, email, nombre_completo')
      .eq('id', accion.destinatario_tercero_id)
      .maybeSingle(),
    admin.from('inmuebles').select('codigo').eq('id', accion.inmueble_id).maybeSingle(),
  ])
  if (errorTercero) return { tipo: 'no_ejecutable', codigo: 'INTERNAL_ERROR', mensaje: errorTercero.message }
  if (errorInmueble) return { tipo: 'no_ejecutable', codigo: 'INTERNAL_ERROR', mensaje: errorInmueble.message }
  if (!tercero || !inmueble) {
    return { tipo: 'no_ejecutable', codigo: 'INTERNAL_ERROR', mensaje: 'Destinatario o inmueble inconsistente.' }
  }

  const preparado = await prepararMensaje(admin, {
    tenantId: opciones.tenantId,
    canal: accion.canal,
    eventType,
    destinatarioId: accion.destinatario_tercero_id,
    nombreDestinatario: tercero.nombre_completo,
    telefono: tercero.telefono,
    email: tercero.email,
    inmuebleCodigo: inmueble.codigo,
    diasMora: accion.dias_mora_al_momento,
    deudaTotal: accion.deuda_total_al_momento,
  })
  if (preparado.tipo === 'no_ejecutable') return preparado

  if (opciones.modo === 'simulacion') {
    return {
      tipo: 'simulada',
      contenido: preparado.contenido,
      asunto: preparado.asunto,
      destinatarioContacto: preparado.contacto,
      intentoNumero,
      canal: accion.canal,
    }
  }

  await admin.from('acciones_cobranza').update({ estado: 'ejecutando' }).eq('id', accion.id)

  const resultadoEnvio =
    accion.canal === 'email'
      ? {
          ...(await enviarEmailCobranza({
            to: preparado.contacto,
            destinatarioNombre: tercero.nombre_completo,
            subject: preparado.asunto ?? '',
            html: preparado.contenido,
            reference: accion.id,
          })),
          segmentsUsed: 0,
        }
      : await sendSms({ to: preparado.contacto, body: preparado.contenido, reference: accion.id })

  // El asunto es contenido, no metadato: dos correos con el mismo cuerpo y
  // distinto asunto no son el mismo mensaje. Va dentro del material que se
  // hashea, y por eso el hash de un correo nunca coincide con el de un SMS
  // de igual texto.
  const materialHash =
    preparado.asunto === null ? preparado.contenido : `${preparado.asunto}\n\n${preparado.contenido}`
  const contenidoHash = await calcularContenidoHash(materialHash)

  // La evidencia va ANTES de cerrar la acción: si esto falla, el mensaje ya
  // salió y hay que saberlo ahora, no el día que un juez pida la prueba.
  const evidencia = await registrarEvidenciaEnvio(admin, {
    tenantId: opciones.tenantId,
    accionId: accion.id,
    intentoNumero,
    canal: accion.canal,
    destinatarioTerceroId: accion.destinatario_tercero_id,
    destinatarioContacto: preparado.contacto,
    plantillaCodigo: eventType,
    asunto: preparado.asunto,
    contenidoRenderizado: preparado.contenido,
    contenidoHash,
    plantillaVersion: preparado.plantillaVersion,
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
      destinatario_contacto: preparado.contacto,
      notas: resultadoEnvio.success ? null : resultadoEnvio.errorMessage,
      ejecutada_por: opciones.actorId,
    })
    .eq('id', accion.id)

  const canalTexto = accion.canal === 'email' ? 'Correo' : 'SMS'
  await emitirEventoDespacho(admin, {
    tenantId: opciones.tenantId,
    accionId: accion.id,
    inmuebleId: accion.inmueble_id,
    fechaCorte: accion.fecha_programada,
    intentoNumero,
    exito: resultadoEnvio.success,
    motivo: resultadoEnvio.success
      ? `${canalTexto} despachado al proveedor (intento ${String(intentoNumero)}, plantilla ${preparado.origenPlantilla}). ` +
        'Despachada no es recibida: la entrega se acredita por acuse (§34).'
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
    contenido: preparado.contenido,
    asunto: preparado.asunto,
  }
}

/** Lo que hay que saber para mandar el mensaje, ya resuelto por canal. */
type MensajePreparado =
  | {
      readonly tipo: 'listo'
      /** Teléfono o correo, según el canal. */
      readonly contacto: string
      /** Texto del SMS u HTML del correo — lo que se envía y lo que se guarda como prueba. */
      readonly contenido: string
      readonly asunto: string | null
      /** 'propia' = la copropiedad la escribió; 'del sistema' = la de defecto. */
      readonly origenPlantilla: string
      /** plantillas_sms/email_templates.version vigente (PRQ-CAR-021). 0 = plantilla del sistema (solo correo). */
      readonly plantillaVersion: number
    }
  | { readonly tipo: 'no_ejecutable'; readonly codigo: string; readonly mensaje: string }

/**
 * §18.4 pasos 2 y 3, por canal: contacto vigente + plantilla renderizada.
 *
 * Los motivos de rechazo nombran a la PERSONA, no su uuid: se leen en la
 * pantalla de simulación, donde alguien tiene que poder ir a arreglar el
 * dato.
 */
async function prepararMensaje(
  admin: ClienteAdmin,
  datos: {
    tenantId: string
    canal: Database['public']['Enums']['canal_cobranza_t']
    eventType: string
    destinatarioId: string
    nombreDestinatario: string | null
    telefono: string | null
    email: string | null
    inmuebleCodigo: string
    diasMora: number
    deudaTotal: number
  },
): Promise<MensajePreparado> {
  const quien = datos.nombreDestinatario ?? `el tercero ${datos.destinatarioId}`

  if (datos.canal === 'sms') {
    if (!datos.telefono || !esTelefonoValido(datos.telefono)) {
      return {
        tipo: 'no_ejecutable',
        codigo: 'ACCION_COBRANZA_DESTINATARIO_SIN_TELEFONO',
        mensaje: `${quien} no tiene un teléfono válido registrado.`,
      }
    }

    const { data: plantilla, error } = await admin
      .from('plantillas_sms')
      .select('cuerpo, version')
      .eq('tenant_id', datos.tenantId)
      .eq('event_type', datos.eventType)
      .eq('activo', true)
      .maybeSingle()
    if (error) return { tipo: 'no_ejecutable', codigo: 'INTERNAL_ERROR', mensaje: error.message }
    if (!plantilla) {
      return {
        tipo: 'no_ejecutable',
        codigo: 'SMS_TEMPLATE_NOT_FOUND',
        mensaje: `No hay una plantilla de SMS activa para el evento '${datos.eventType}' en esta copropiedad.`,
      }
    }

    const campos = SMS_FIELD_REGISTRY[datos.eventType] ?? []
    return {
      tipo: 'listo',
      contacto: datos.telefono,
      contenido: renderSmsTemplate(plantilla.cuerpo, valoresDeCampos(campos, datos, null)),
      asunto: null,
      origenPlantilla: 'propia',
      plantillaVersion: plantilla.version,
    }
  }

  if (!datos.email || !esEmailValido(datos.email)) {
    return {
      tipo: 'no_ejecutable',
      codigo: 'ACCION_COBRANZA_DESTINATARIO_SIN_EMAIL',
      mensaje: `${quien} no tiene un correo válido registrado.`,
    }
  }

  // A diferencia del SMS, la ausencia de plantilla propia NO impide
  // despachar: se usa la del sistema. Exigir que alguien redacte HTML
  // antes de poder cobrar por correo dejaría el canal apagado en la
  // práctica — el mismo motivo por el que la configuración de §8.4/§9.4
  // se siembra con un clic.
  const { data: plantilla, error } = await admin
    .from('email_templates')
    .select('subject, html_content, version')
    .eq('tenant_id', datos.tenantId)
    .eq('event_type', datos.eventType)
    .maybeSingle()
  if (error) return { tipo: 'no_ejecutable', codigo: 'INTERNAL_ERROR', mensaje: error.message }

  const usaPropia = plantilla !== null && plantilla.html_content.trim().length > 0
  const asuntoFuente = usaPropia ? plantilla.subject : CORREO_COBRANZA_POR_DEFECTO.subject
  const cuerpoFuente = usaPropia ? plantilla.html_content : CORREO_COBRANZA_POR_DEFECTO.htmlContent
  // 0 = plantilla del sistema (sin propia redactada), no "sin versionado" —
  // PRQ-CAR-021 ya existe; ver comentario de plantillaVersion en MensajePreparado.
  const plantillaVersion = usaPropia ? plantilla.version : 0

  // El nombre de la copropiedad no viaja en la acción: se lee aquí, y solo
  // para el correo — el SMS no lo usa, y una consulta de más por cada SMS
  // de un lote de 200 no es gratis.
  const { data: tenant } = await admin.from('tenants').select('name').eq('id', datos.tenantId).maybeSingle()

  const campos = EMAIL_FIELD_REGISTRY[datos.eventType] ?? []
  const params = valoresDeCampos(campos, datos, tenant?.name ?? '')
  return {
    tipo: 'listo',
    contacto: datos.email,
    contenido: renderEmailTemplate(cuerpoFuente, params),
    asunto: renderEmailTemplate(asuntoFuente, params),
    origenPlantilla: usaPropia ? 'propia' : 'del sistema',
    plantillaVersion,
  }
}

/**
 * Rellena solo los campos que el registro del evento declara. Un campo no
 * declarado se queda sin valor a propósito: el renderizador deja el
 * marcador literal, y eso se ve en la simulación — mejor que enviarlo
 * vacío y que nadie lo note.
 */
function valoresDeCampos(
  campos: readonly { field: string }[],
  datos: { nombreDestinatario: string | null; inmuebleCodigo: string; diasMora: number; deudaTotal: number },
  copropiedad: string | null,
): Record<string, string> {
  const params: Record<string, string> = {}
  for (const campo of campos) {
    if (campo.field === 'nombreResidente') params[campo.field] = datos.nombreDestinatario ?? ''
    else if (campo.field === 'inmueble') params[campo.field] = datos.inmuebleCodigo
    else if (campo.field === 'diasMora') params[campo.field] = String(datos.diasMora)
    else if (campo.field === 'saldoPendiente') params[campo.field] = formatearMoneda(datos.deudaTotal)
    else if (campo.field === 'copropiedad' && copropiedad !== null) params[campo.field] = copropiedad
  }
  return params
}
