/**
 * Metadata pura de cada pasarela — proveedor, nombre comercial, capacidades.
 * Es lo único que la pantalla de configuración (apps/web, cliente del
 * navegador) necesita: qué credenciales pedir, qué métodos ofrecer, a qué
 * documentación enlazar. NUNCA importar aquí nada que hable con el proveedor
 * (fetch, firma, node:crypto) — ese código solo corre server-side (Edge
 * Functions, Deno) y wompi.ts SÍ lo necesita (node:crypto para la firma de
 * integridad). Si este archivo llegara a depender de wompi.ts, un import de
 * DESCRIPTORES en un componente Vue arrastraría node:crypto al bundle del
 * navegador — cosa que ya pasó una vez: pasarela.vue importaba ADAPTADORES
 * completo, Vite no puede resolver "node:crypto" para el cliente, y la
 * navegación a esa página fallaba en silencio (2026-08-28).
 */
import type { CapacidadesPasarela, PasarelaProveedor } from './tipos.js'

export interface DescriptorPasarela {
  readonly proveedor: PasarelaProveedor
  readonly nombreComercial: string
  readonly capacidades: CapacidadesPasarela
}

export const DESCRIPTORES: Record<PasarelaProveedor, DescriptorPasarela> = {
  wompi: {
    proveedor: 'wompi',
    nombreComercial: 'Wompi (Bancolombia)',
    capacidades: {
      metodosSoportados: ['pse', 'tarjeta_credito', 'tarjeta_debito', 'nequi'],
      tipoCheckout: 'redirect',
      soportaSandbox: true,
      credencialesRequeridas: ['public_key', 'private_key', 'events_secret', 'integrity_secret'],
      urlDocumentacion: 'https://docs.wompi.co/',
    },
  },
  payu: {
    proveedor: 'payu',
    nombreComercial: 'PayU',
    capacidades: {
      metodosSoportados: [
        'pse',
        'tarjeta_credito',
        'tarjeta_debito',
        'nequi',
        'corresponsal_bancario',
      ],
      tipoCheckout: 'redirect',
      soportaSandbox: true,
      credencialesRequeridas: ['merchant_id', 'account_id', 'api_login', 'api_key'],
      urlDocumentacion: 'https://developers.payulatam.com/latam/es/',
    },
  },
  epayco: {
    proveedor: 'epayco',
    nombreComercial: 'ePayco',
    capacidades: {
      metodosSoportados: [
        'pse',
        'tarjeta_credito',
        'tarjeta_debito',
        'nequi',
        'corresponsal_bancario',
      ],
      tipoCheckout: 'redirect',
      soportaSandbox: true,
      credencialesRequeridas: ['p_cust_id_cliente', 'public_key', 'private_key', 'p_key'],
      urlDocumentacion: 'https://docs.epayco.co/',
    },
  },
  bold: {
    proveedor: 'bold',
    nombreComercial: 'Bold',
    capacidades: {
      metodosSoportados: ['pse', 'tarjeta_credito', 'tarjeta_debito', 'nequi'],
      tipoCheckout: 'boton_embebido',
      soportaSandbox: true,
      credencialesRequeridas: ['identity_key', 'secret_key'],
      urlDocumentacion: 'https://developers.bold.co/',
    },
  },
}

export const LISTA_DESCRIPTORES: readonly DescriptorPasarela[] = Object.values(DESCRIPTORES)
