// Webhook de acuses de Brevo — CAR §34.2, cierra PRQ-CAR-019.
//
// Endpoint PÚBLICO, sin JWT: lo llama Brevo, no un usuario. Ruta:
// /functions/v1/webhook-brevo/{token}. Brevo no firma sus webhooks con
// HMAC, así que el token de la URL (BREVO_WEBHOOK_TOKEN) es lo único que
// autoriza — por eso se compara en tiempo constante y por eso el endpoint
// solo puede INSERTAR acuses: aunque alguien adivinara el token, lo peor
// que lograría es ensuciar la evidencia con acuses de mensajes cuyo
// message_id no conoce.
//
// A diferencia de webhook-pasarela, aquí NO hay tenant en la ruta: la
// cuenta de Brevo es del sistema, no de cada copropiedad. El tenant se
// resuelve desde el envío al que pertenece el message_id. Por eso llegan
// también eventos de correos que no son de cobranza (invitaciones, estados
// de cuenta): los que no resuelven a un envío se ignoran con 200 y quedan
// auditados. Un webhook que devuelve error por un evento ajeno acaba
// desactivado por el proveedor.
//
// IDEMPOTENCIA: la garantiza la base, no este código. acuse_unico
// (tenant_id, envio_id, estado, ocurrido_at) hace que el reenvío del mismo
// evento —cosa que Brevo hace— sea un no-op (PH-C45).
//
// Lo que este endpoint NUNCA hace: marcar una acción como acreditada. La
// acreditación se deriva de los acuses (REC-CAR-018, fn_acreditacion_accion);
// no existe columna que escribir.
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse } from '../_shared/http.ts'
import { logEvent } from '../_shared/logger.ts'

type EstadoAcuse = Database['public']['Enums']['estado_acuse_t']

/**
 * Mapa evento de Brevo → estado_acuse_t. Cubre SMS y email con el mismo
 * diccionario: Brevo usa nombres distintos para lo mismo según el canal
 * (hardBounce en SMS, hard_bounce en email) y ambos deben caer en el mismo
 * estado.
 *
 * La distinción que importa jurídicamente no es técnica sino probatoria:
 *
 *   entregado / leido  → acreditan la notificación
 *   rebotado           → rechazo permanente del destino
 *   fallido            → problema técnico, puede reintentarse
 *   no_entregable      → imposibilidad acreditada; NO acredita la
 *                        notificación pero SÍ la diligencia (PH-C43)
 *
 * Un evento desconocido no se fuerza a ningún estado: se ignora y se
 * audita. Inventar un mapeo sería escribir prueba falsa.
 */
const MAPA_EVENTOS: Readonly<Record<string, EstadoAcuse>> = {
  // Aceptado por Brevo, sin resolución todavía.
  request: 'encolado',
  queued: 'encolado',
  sent: 'encolado',
  accepted: 'encolado',
  deferred: 'encolado',
  // Entrega confirmada.
  delivered: 'entregado',
  delivery: 'entregado',
  // Lectura. 'click' implica lectura previa.
  opened: 'leido',
  uniqueOpened: 'leido',
  unique_opened: 'leido',
  click: 'leido',
  // Rechazo permanente del destino.
  hardBounce: 'rebotado',
  hard_bounce: 'rebotado',
  // Fallo técnico, reintentable.
  softBounce: 'fallido',
  soft_bounce: 'fallido',
  error: 'fallido',
  // Imposibilidad acreditada.
  blocked: 'no_entregable',
  rejected: 'no_entregable',
  invalid_email: 'no_entregable',
  invalid_parameter: 'no_entregable',
  unsubscribed: 'no_entregable',
  spam: 'no_entregable',
}

/** Comparación en tiempo constante: el token es el único control de acceso. */
function tokenValido(recibido: string, esperado: string): boolean {
  if (recibido.length !== esperado.length) return false
  let diferencia = 0
  for (let i = 0; i < recibido.length; i += 1) {
    diferencia |= recibido.charCodeAt(i) ^ esperado.charCodeAt(i)
  }
  return diferencia === 0
}

function ipDelRequest(req: Request): string {
  const reenviada = req.headers.get('x-forwarded-for')
  const primera = reenviada?.split(',')[0]?.trim()
  return primera && primera.length > 0 ? primera : 'desconocida'
}

/**
 * Brevo nombra el identificador de tres formas distintas según el canal y
 * la versión del webhook. Se leen todas en vez de asumir una: el coste de
 * equivocarse es un acuse que nunca se registra y una notificación que
 * queda sin acreditar.
 */
function extraerMessageId(evento: Record<string, unknown>): string | null {
  const candidatos = [evento['message_id'], evento['messageId'], evento['message-id'], evento['id']]
  for (const valor of candidatos) {
    if (typeof valor === 'string' && valor.length > 0) return valor
    if (typeof valor === 'number') return String(valor)
  }
  return null
}

/**
 * `ts` (epoch en segundos) es más fiable que `date`, que llega como texto
 * local sin zona en algunos eventos. Si no hay ninguno utilizable se usa
 * la hora de recepción, y la diferencia con recibido_at queda visible.
 */
function extraerOcurridoAt(evento: Record<string, unknown>): string {
  const ts = evento['ts'] ?? evento['ts_event'] ?? evento['ts_epoch']
  if (typeof ts === 'number' && Number.isFinite(ts)) {
    return new Date(ts * 1000).toISOString()
  }
  const fecha = evento['date']
  if (typeof fecha === 'string') {
    const parseada = new Date(fecha)
    if (!Number.isNaN(parseada.getTime())) return parseada.toISOString()
  }
  return new Date().toISOString()
}

Deno.serve(async (req) => {
  const correlationId = crypto.randomUUID()

  if (req.method !== 'POST') {
    return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Solo POST.', undefined, correlationId)
  }

  const segmentos = new URL(req.url).pathname.split('/').filter(Boolean)
  const token = segmentos.at(-1)
  const tokenEsperado = Deno.env.get('BREVO_WEBHOOK_TOKEN')

  // Sin token configurado el endpoint se cierra, no se abre: un webhook
  // que acepta todo mientras "falta configurar" es una puerta abierta.
  if (!tokenEsperado) {
    logEvent({
      level: 'error',
      action: 'webhook_brevo.token_no_configurado',
      correlationId,
      message: 'BREVO_WEBHOOK_TOKEN no está configurado — se rechazan todos los eventos.',
    })
    return errorResponse(500, 'INTERNAL_ERROR', 'Webhook no configurado.', undefined, correlationId)
  }
  if (!token || !tokenValido(token, tokenEsperado)) {
    return errorResponse(404, 'WEBHOOK_TOKEN_INVALIDO', 'Ruta de webhook inválida.', undefined, correlationId)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return errorResponse(500, 'INTERNAL_ERROR', 'Configuración incompleta.', undefined, correlationId)
  }
  const admin = createClient<Database>(supabaseUrl, serviceKey)

  const ip = ipDelRequest(req)
  const { data: permitidoIp, error: errorRateLimit } = await admin.rpc('check_rate_limit', {
    p_bucket: `webhook_brevo_ip:${ip}`,
    p_max_hits: 1000,
    p_window: '1 hour',
  })
  if (errorRateLimit) {
    logEvent({ level: 'error', action: 'rate_limit.check_failed', correlationId, message: errorRateLimit.message })
  } else if (permitidoIp === false) {
    return errorResponse(429, 'RATE_LIMITED', 'Demasiados eventos desde esta dirección.', undefined, correlationId)
  }

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return errorResponse(400, 'INVALID_PAYLOAD', 'El cuerpo debe ser JSON válido.', undefined, correlationId)
  }

  // Brevo envía un objeto por evento, pero admite lotes en algunas
  // configuraciones. Se normaliza a lista para tratar los dos igual.
  const eventos: Record<string, unknown>[] = Array.isArray(payload)
    ? (payload as Record<string, unknown>[])
    : [payload as Record<string, unknown>]

  let registrados = 0
  let duplicados = 0
  let ignorados = 0

  for (const evento of eventos) {
    const tipoEvento = typeof evento['event'] === 'string' ? evento['event'] : null
    const messageId = extraerMessageId(evento)

    if (!tipoEvento || !messageId) {
      ignorados += 1
      continue
    }

    const estado = MAPA_EVENTOS[tipoEvento]
    if (!estado) {
      // Evento real de Brevo que no sabemos traducir. Se audita para poder
      // ampliar el mapa con datos, no con suposiciones.
      ignorados += 1
      logEvent({
        level: 'warn',
        action: 'webhook_brevo.evento_no_mapeado',
        correlationId,
        meta: { tipoEvento, messageId },
      })
      continue
    }

    const { data: envio, error: errorEnvio } = await admin
      .from('acciones_cobranza_envios')
      .select('id, tenant_id')
      .eq('referencia_externa', messageId)
      .maybeSingle()
    if (errorEnvio) {
      logEvent({
        level: 'error',
        action: 'webhook_brevo.envio_no_resuelto',
        correlationId,
        message: errorEnvio.message,
        meta: { messageId },
      })
      continue
    }
    if (!envio) {
      // Evento de un correo o SMS del sistema que no es una acción de
      // cobranza (invitación, estado de cuenta). No es un error.
      ignorados += 1
      continue
    }

    const { error: errorAcuse } = await admin.from('acciones_cobranza_acuses').insert({
      tenant_id: envio.tenant_id,
      envio_id: envio.id,
      estado,
      ocurrido_at: extraerOcurridoAt(evento),
      origen: 'proveedor',
      payload_crudo: evento as never,
      motivo: typeof evento['reason'] === 'string' ? evento['reason'] : null,
    })

    if (errorAcuse) {
      // 23505 = acuse_unico. Es el reenvío esperado, no un fallo.
      if (errorAcuse.code === '23505') {
        duplicados += 1
      } else {
        logEvent({
          level: 'error',
          action: 'webhook_brevo.acuse_no_registrado',
          correlationId,
          tenantId: envio.tenant_id,
          message: errorAcuse.message,
          meta: { messageId, estado },
        })
      }
      continue
    }

    registrados += 1
  }

  logEvent({
    level: 'info',
    action: 'webhook_brevo.procesado',
    correlationId,
    meta: { recibidos: eventos.length, registrados, duplicados, ignorados },
  })

  // 2xx siempre que el token sea válido: Brevo desactiva los webhooks que
  // devuelven error de forma repetida, y un evento ajeno o duplicado no es
  // un fallo nuestro.
  return jsonResponse({ registrados, duplicados, ignorados }, 200, correlationId)
})
