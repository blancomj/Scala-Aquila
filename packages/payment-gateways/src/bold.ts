/**
 * Bold. Mejor comisión de tarjeta del grupo (§B del documento propietario).
 *
 * Es el proveedor que forzó que ResultadoIntencion sea una unión discriminada:
 * su checkout online NO es un redirect a una URL, es un botón que se renderiza
 * embebido en la página con una firma de integridad. Ver el comentario de
 * ResultadoIntencion en tipos.ts antes de "simplificar" esa interfaz.
 *
 * ALCANCE — EL DATÁFONO FÍSICO DE BOLD NO ESTÁ AQUÍ. Bold también vende
 * datáfono físico (relevante en PH para portería y asambleas), pero ese es un
 * cobro PRESENCIAL que aparece después en el reporte de liquidación de Bold:
 * es un caso de CONCILIACIÓN, no de checkout con webhook. Si alguien asume que
 * configurar Bold aquí "también cubre el datáfono", se termina registrando el
 * mismo pago dos veces — una por el datáfono y otra por el flujo online. La UI
 * de configuración lo dice explícitamente por el mismo motivo.
 *
 * Métodos de red: NO_IMPLEMENTADO en esta fase (ver no-implementado.ts).
 *
 * TODO(fase 2): verificar metodosSoportados y credencialesRequeridas contra
 * la documentación oficial vigente de Bold antes de integrar. Los valores de
 * aquí provienen de §B del documento propietario, no de la doc del proveedor.
 */
import { DESCRIPTORES } from './descriptores.js'
import { metodosNoImplementados } from './no-implementado.js'
import type { PaymentGatewayAdapter } from './tipos.js'

export const adaptadorBold: PaymentGatewayAdapter = {
  ...DESCRIPTORES.bold,
  ...metodosNoImplementados('bold'),
}
