/**
 * PayU (Prosus). Fuerte en efectivo (Efecty/Baloto/Su Red), antifraude maduro
 * y cuotas — cubre el segmento de propietarios que aún paga en corresponsales,
 * relevante en PH de estratos bajos (§B del documento propietario).
 *
 * Métodos de red: NO_IMPLEMENTADO en esta fase (ver no-implementado.ts).
 *
 * TODO(fase 2): verificar metodosSoportados y credencialesRequeridas contra
 * la documentación oficial vigente de PayU antes de integrar. Los valores de
 * aquí provienen de §B del documento propietario, no de la doc del proveedor.
 */
import { DESCRIPTORES } from './descriptores.js'
import { metodosNoImplementados } from './no-implementado.js'
import type { PaymentGatewayAdapter } from './tipos.js'

export const adaptadorPayU: PaymentGatewayAdapter = {
  ...DESCRIPTORES.payu,
  ...metodosNoImplementados('payu'),
}
