import { describe, expect, it } from 'vitest'
import { ADAPTADORES } from './registro.js'
import { ErrorPasarela } from './errors.js'
import type { PasarelaProveedor, PaymentGatewayAdapter } from './tipos.js'

const buscar = (p: PasarelaProveedor): PaymentGatewayAdapter => ADAPTADORES[p]

// Los 4 valores de pasarela_proveedor_t (20260904100000). Escritos a mano a
// propósito: si alguien agrega un valor al enum, este test falla y obliga a
// escribir su adaptador — que es justo la garantía que el COMMENT ON TYPE
// promete.
const PROVEEDORES: PasarelaProveedor[] = ['wompi', 'payu', 'epayco', 'bold']

describe('registro de adaptadores de pasarela', () => {
  it('los 4 proveedores del enum tienen adaptador', () => {
    expect(Object.keys(ADAPTADORES).sort()).toEqual([...PROVEEDORES].sort())
  })

  it.each(PROVEEDORES)('%s declara capacidades completas', (proveedor) => {
    const adaptador = buscar(proveedor)
    expect(adaptador.proveedor).toBe(proveedor)
    expect(adaptador.nombreComercial.length).toBeGreaterThan(0)
    expect(adaptador.capacidades.metodosSoportados.length).toBeGreaterThan(0)
    expect(adaptador.capacidades.credencialesRequeridas.length).toBeGreaterThan(0)
    expect(adaptador.capacidades.urlDocumentacion).toMatch(/^https:\/\//)
  })

  it('Bold es el único con checkout de botón embebido', () => {
    // No es cosmético: es la razón por la que ResultadoIntencion es una unión
    // discriminada. Si este test empieza a fallar porque alguien "simplificó"
    // la interfaz a checkoutUrl, Bold quedó roto.
    expect(buscar('bold').capacidades.tipoCheckout).toBe('boton_embebido')
    for (const proveedor of PROVEEDORES.filter((p) => p !== 'bold')) {
      expect(buscar(proveedor).capacidades.tipoCheckout).toBe('redirect')
    }
  })

  // wompi tiene integración real desde la fase 2 (wompi.test.ts) — este bucle
  // solo cubre a quienes SIGUEN sin adaptador (§0 del prompt de fase 2: "PayU,
  // ePayco y Bold siguen lanzando NO_IMPLEMENTADO al terminar esta tarea").
  const PROVEEDORES_SIN_IMPLEMENTAR = PROVEEDORES.filter((p) => p !== 'wompi')

  it.each(PROVEEDORES_SIN_IMPLEMENTAR)('%s lanza NO_IMPLEMENTADO en los métodos de red', async (proveedor) => {
    const adaptador = buscar(proveedor)
    await expect(
      adaptador.crearIntencion({
        montoCentavos: 100000,
        moneda: 'COP',
        referencia: 'ref-1',
        metodo: 'pse',
        urlRetorno: 'https://example.test/retorno',
        modo: 'sandbox',
        credenciales: {},
      }),
    ).rejects.toThrow(ErrorPasarela)

    await expect(
      adaptador.consultarTransaccion('tx-1', { modo: 'sandbox', credenciales: {} }),
    ).rejects.toThrow(ErrorPasarela)

    expect(() => adaptador.validarFirmaWebhook({}, 'firma', 'secreto')).toThrow(ErrorPasarela)
    expect(() => adaptador.parsearWebhook({})).toThrow(ErrorPasarela)
  })
})
