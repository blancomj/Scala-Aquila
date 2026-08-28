/**
 * Los 4 métodos de red del adaptador, en su versión de esta fase: lanzan
 * NO_IMPLEMENTADO. Es deliberado — esta es la fase de ESTRUCTURA, el cobro
 * real (crear intención contra la API del proveedor, webhooks, registro del
 * pago en el ledger) llega en la fase siguiente.
 *
 * Vive en un solo archivo y no repetido 4 veces para que, cuando se
 * implemente Wompi de verdad, se vea de un vistazo qué proveedores siguen sin
 * integrar: los que aún hagan spread de esto.
 */
import { ErrorPasarela } from './errors.js'
import type { PasarelaProveedor, PaymentGatewayAdapter } from './tipos.js'

type MetodosDeRed = Pick<
  PaymentGatewayAdapter,
  'crearIntencion' | 'consultarTransaccion' | 'validarFirmaWebhook' | 'parsearWebhook'
>

export function metodosNoImplementados(proveedor: PasarelaProveedor): MetodosDeRed {
  const error = (metodo: string): ErrorPasarela =>
    new ErrorPasarela(
      'NO_IMPLEMENTADO',
      `${metodo} no implementado para ${proveedor}: la integración real es la fase siguiente.`,
    )
  return {
    // Los dos primeros RECHAZAN en vez de lanzar de forma síncrona: la
    // interfaz promete un Promise, y un llamador que encadene .catch() sin
    // await se rompería de otra manera.
    crearIntencion: () => Promise.reject(error('crearIntencion')),
    consultarTransaccion: () => Promise.reject(error('consultarTransaccion')),
    validarFirmaWebhook: () => {
      throw error('validarFirmaWebhook')
    },
    parsearWebhook: () => {
      throw error('parsearWebhook')
    },
  }
}
