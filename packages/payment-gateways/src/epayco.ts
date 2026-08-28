/**
 * ePayco. Cobertura completa de métodos locales y soporte local fuerte, muy
 * usada en pymes y administradores de PH (§B del documento propietario).
 *
 * Métodos de red: NO_IMPLEMENTADO en esta fase (ver no-implementado.ts).
 *
 * TODO(fase 2): verificar metodosSoportados y credencialesRequeridas contra
 * la documentación oficial vigente de ePayco antes de integrar. Los valores de
 * aquí provienen de §B del documento propietario, no de la doc del proveedor.
 */
import { DESCRIPTORES } from './descriptores.js'
import { metodosNoImplementados } from './no-implementado.js'
import type { PaymentGatewayAdapter } from './tipos.js'

export const adaptadorEpayco: PaymentGatewayAdapter = {
  ...DESCRIPTORES.epayco,
  ...metodosNoImplementados('epayco'),
}
