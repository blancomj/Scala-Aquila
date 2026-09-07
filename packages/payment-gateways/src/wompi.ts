/**
 * Wompi (Bancolombia). Primero en el orden de implementación de §F del
 * documento propietario: mejor API local, Nequi nativo y la mejor tarifa PSE
 * para el ticket típico de una cuota de administración.
 *
 * FASE 2 — integración real. Verificado contra la documentación oficial
 * vigente el 2026-08-28 (https://docs.wompi.co/en/docs/colombia/), no
 * deducido de memoria ni del documento propietario (§4 del prompt de fase 2
 * lo exige explícitamente porque una firma mal validada es un agujero de
 * seguridad, no un bug cosmético):
 *
 *   · Ambientes y llaves — https://docs.wompi.co/en/docs/colombia/ambientes-y-llaves/
 *     Sandbox: https://sandbox.wompi.co/v1 · Producción: https://production.wompi.co/v1
 *     Prefijos: pub_test_/prv_test_/test_events_/test_integrity_ (sandbox),
 *     pub_prod_/prv_prod_/prod_events_/prod_integrity_ (producción).
 *   · Widget & Checkout Web — https://docs.wompi.co/en/docs/colombia/widget-checkout-web/
 *     Firma de integridad = SHA256(reference + amount-in-cents + currency + integrity-secret).
 *     Checkout Web: GET https://checkout.wompi.co/p/ con los campos
 *     public-key, currency, amount-in-cents, reference, signature:integrity,
 *     redirect-url — MISMA URL para sandbox y producción; el ambiente lo
 *     decide el prefijo de la public-key usada.
 *   · Eventos — https://docs.wompi.co/en/docs/colombia/eventos/
 *     Checksum = SHA256(concat(valores de signature.properties en orden) +
 *     signature.timestamp + secreto). Header X-Event-Checksum (redundante
 *     con el campo signature.checksum del body — se usa el del body, que es
 *     lo que parsearWebhook ya tiene disponible sin depender de headers).
 *   · Transacciones — https://docs.wompi.co/en/docs/colombia/transacciones/
 *     GET /v1/transactions/{id}, autenticado con la public-key como Bearer.
 *     Estados: PENDING · APPROVED · DECLINED · VOIDED · ERROR.
 *
 * NO usa el checkout embebido con tokenización de tarjeta ni ninguna API que
 * reciba datos de tarjeta: el único camino es Web Checkout (redirect), que
 * mantiene a AQUILA completamente fuera del alcance de PCI DSS (§8.4 del
 * prompt) — Wompi widget/checkout renderiza su propio formulario de tarjeta,
 * nunca el nuestro.
 */
import { createHash } from 'node:crypto'
import { DESCRIPTORES } from './descriptores.js'
import { ErrorPasarela } from './errors.js'
import type {
  ContextoConsulta,
  EstadoTransaccion,
  EventoTransaccion,
  MetodoPago,
  ParamsIntencion,
  PasarelaModo,
  PaymentGatewayAdapter,
  ResultadoIntencion,
} from './tipos.js'

const HOST_CHECKOUT = 'https://checkout.wompi.co/p/'

function hostApi(modo: PasarelaModo): string {
  return modo === 'produccion' ? 'https://production.wompi.co/v1' : 'https://sandbox.wompi.co/v1'
}

function sha256Hex(texto: string): string {
  return createHash('sha256').update(texto).digest('hex')
}

function credencial(
  credenciales: Readonly<Record<string, string>>,
  nombre: string,
): string {
  const valor = credenciales[nombre]
  if (!valor) {
    throw new ErrorPasarela(
      'PASARELA_CREDENCIAL_INVALIDA',
      `Wompi: falta la credencial "${nombre}" para completar la operación.`,
    )
  }
  return valor
}

// Wompi reporta el estado de la transacción en mayúsculas fijas
// (transacciones §"Transaction Status Values"); ERROR se trata como
// rechazada — no hay dinero que reclamar, igual que DECLINED.
function estadoDesdeWompi(estado: string): EstadoTransaccion['estado'] {
  switch (estado) {
    case 'APPROVED':
      return 'aprobada'
    case 'VOIDED':
      return 'anulada'
    case 'PENDING':
      return 'pendiente'
    case 'DECLINED':
    case 'ERROR':
      return 'rechazada'
    default:
      throw new ErrorPasarela(
        'PASARELA_RESPUESTA_INVALIDA',
        `Wompi: estado de transacción desconocido "${estado}" — la documentación cambió, revisar `
          + 'antes de tratarlo como aprobado o rechazado.',
      )
  }
}

interface TransaccionWompi {
  readonly id: string
  readonly status: string
  readonly amount_in_cents: number
  readonly reference: string
  readonly payment_method_type?: string
  readonly currency?: string
}

function metodoDesdeWompi(tipo: string | undefined): MetodoPago | null {
  if (!tipo) return null
  switch (tipo) {
    case 'PSE':
      return 'pse'
    case 'NEQUI':
      return 'nequi'
    case 'CARD':
      return 'tarjeta_credito'
    case 'BANCOLOMBIA_TRANSFER':
    case 'BANCOLOMBIA_COLLECT':
      return 'transferencia_bancaria'
    default:
      // Método que Wompi reporta y que AQUILA no reconoce todavía — null es
      // el contrato correcto (metodo-forma-pago.ts): el llamador lo trata
      // como incidente en vez de adivinar una forma de pago.
      return null
  }
}

export const adaptadorWompi: PaymentGatewayAdapter = {
  ...DESCRIPTORES.wompi,

  // async: un throw síncrono dentro (credencial faltante) debe llegar como
  // rechazo de la promesa, no como excepción síncrona — el contrato de
  // PaymentGatewayAdapter promete un Promise incluso cuando falla temprano.
  // eslint-disable-next-line @typescript-eslint/require-await -- async es a propósito (ver comentario arriba): sin await, pero el throw síncrono debe llegar como rechazo de la promesa.
  async crearIntencion(params: ParamsIntencion): Promise<ResultadoIntencion> {
    const publicKey = credencial(params.credenciales, 'public_key')
    const integritySecret = credencial(params.credenciales, 'integrity_secret')

    // Firma de integridad (Widget & Checkout Web): SHA256 de reference +
    // amount-in-cents + currency + integrity-secret, EN ESE ORDEN, sin
    // separadores. No se usa el parámetro opcional expiration-time: sumarlo
    // cambiaría también el orden de la firma, y el vencimiento de negocio ya
    // lo controla intenciones_pago.expira_at + el job de expiración (§7) —
    // duplicarlo en la URL de Wompi no aporta nada y sí un modo más de
    // equivocar la firma.
    const crudo = `${params.referencia}${String(params.montoCentavos)}${params.moneda}${integritySecret}`
    const firma = sha256Hex(crudo)

    const query = new URLSearchParams({
      'public-key': publicKey,
      currency: params.moneda,
      'amount-in-cents': String(params.montoCentavos),
      reference: params.referencia,
      'signature:integrity': firma,
      'redirect-url': params.urlRetorno,
    })

    // Informativo para la UI ("este enlace es reciente"); Wompi no expira el
    // Checkout Web por sí solo — el vencimiento real de negocio vive en
    // intenciones_pago.expira_at (ver comentario arriba).
    const expiraEn = new Date(Date.now() + 60 * 60_000).toISOString()

    return { tipo: 'redirect', checkoutUrl: `${HOST_CHECKOUT}?${query.toString()}`, expiraEn }
  },

  async consultarTransaccion(
    transactionId: string,
    contexto: ContextoConsulta,
  ): Promise<EstadoTransaccion> {
    const publicKey = credencial(contexto.credenciales, 'public_key')
    const respuesta = await fetch(
      `${hostApi(contexto.modo)}/transactions/${encodeURIComponent(transactionId)}`,
      { headers: { Authorization: `Bearer ${publicKey}` } },
    )

    if (respuesta.status === 404) {
      throw new ErrorPasarela(
        'PASARELA_TRANSACCION_NO_ENCONTRADA',
        `Wompi: la transacción ${transactionId} no existe para estas credenciales.`,
      )
    }
    if (!respuesta.ok) {
      throw new ErrorPasarela(
        'PASARELA_RESPUESTA_INVALIDA',
        `Wompi: la consulta de la transacción ${transactionId} falló (HTTP ${String(respuesta.status)}).`,
      )
    }

    const cuerpo = (await respuesta.json()) as { data?: TransaccionWompi }
    const transaccion = cuerpo.data
    if (!transaccion) {
      throw new ErrorPasarela(
        'PASARELA_RESPUESTA_INVALIDA',
        `Wompi: la respuesta de la transacción ${transactionId} no tiene el campo "data" esperado.`,
      )
    }

    return {
      transactionId: transaccion.id,
      estado: estadoDesdeWompi(transaccion.status),
      montoCentavos: transaccion.amount_in_cents,
      metodo: metodoDesdeWompi(transaccion.payment_method_type),
    }
  },

  // Devuelve boolean de forma SÍNCRONA (contrato de PaymentGatewayAdapter):
  // node:crypto createHash es síncrono, a diferencia de crypto.subtle — mismo
  // motivo por el que packages/liquidation-engine/src/hash.ts lo usa para
  // resultHash en vez de la Web Crypto API.
  validarFirmaWebhook(payload: unknown, firma: string, secreto: string): boolean {
    const evento = payload as {
      data?: Record<string, unknown>
      signature?: { properties?: unknown; checksum?: unknown; timestamp?: unknown }
    } | null
    const propiedades = evento?.signature?.properties
    const timestamp = evento?.signature?.timestamp
    if (!evento?.data || !Array.isArray(propiedades) || typeof timestamp !== 'number') {
      return false
    }

    // Cada entrada de `properties` es una ruta tipo "transaction.id" dentro
    // de `data` — se resuelve campo a campo, nunca se asume un shape fijo
    // (la documentación de Wompi advierte explícitamente que properties
    // puede variar entre eventos).
    let concatenado = ''
    for (const ruta of propiedades) {
      if (typeof ruta !== 'string') return false
      let valor: unknown = evento.data
      for (const segmento of ruta.split('.')) {
        if (valor === null || typeof valor !== 'object') return false
        valor = (valor as Record<string, unknown>)[segmento]
      }
      if (typeof valor !== 'string' && typeof valor !== 'number' && typeof valor !== 'boolean') return false
      concatenado += typeof valor === 'string' ? valor : String(valor)
    }
    concatenado += String(timestamp)
    concatenado += secreto

    const calculado = sha256Hex(concatenado)
    // Comparación de longitud fija: SHA-256 hex siempre son 64 caracteres,
    // así que timingSafeEqual no filtra longitud útil para un atacante que ya
    // conoce el formato del algoritmo.
    return calculado.length === firma.length && calculado === firma
  },

  parsearWebhook(payload: unknown): EventoTransaccion {
    const evento = payload as { data?: { transaction?: TransaccionWompi } } | null
    const transaccion = evento?.data?.transaction
    if (!transaccion?.id || !transaccion.reference || !transaccion.status) {
      throw new ErrorPasarela(
        'PASARELA_RESPUESTA_INVALIDA',
        'Wompi: el evento no tiene la forma esperada data.transaction.{id,reference,status}.',
      )
    }
    return {
      transactionId: transaccion.id,
      referencia: transaccion.reference,
      estado: estadoDesdeWompi(transaccion.status),
      montoCentavos: transaccion.amount_in_cents,
    }
  },
}
