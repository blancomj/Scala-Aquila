import { adaptadorBold } from './bold.js'
import { adaptadorEpayco } from './epayco.js'
import { adaptadorPayU } from './payu.js'
import { adaptadorWompi } from './wompi.js'
import type { PasarelaProveedor, PaymentGatewayAdapter } from './tipos.js'

/**
 * Registro exhaustivo de adaptadores.
 *
 * Es un Record sobre el union derivado del enum de la base, NO un
 * Partial<Record<…>> ni un objeto suelto: así, agregar un proveedor a
 * pasarela_proveedor_t sin escribir su adaptador es un error de compilación
 * de TypeScript, no un fallo en producción. Esa garantía es exactamente lo
 * que justifica que el proveedor sea un enum nativo y no una fila de
 * lista_tipos (D-24, y el COMMENT ON TYPE de la migración lo dice).
 */
export const ADAPTADORES: Record<PasarelaProveedor, PaymentGatewayAdapter> = {
  wompi: adaptadorWompi,
  payu: adaptadorPayU,
  epayco: adaptadorEpayco,
  bold: adaptadorBold,
}

export const LISTA_ADAPTADORES: readonly PaymentGatewayAdapter[] = Object.values(ADAPTADORES)
