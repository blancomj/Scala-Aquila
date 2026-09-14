import { describe, expect, it } from 'vitest'
import { DESCRIPTORES, LISTA_DESCRIPTORES } from './descriptores.js'
import type { IaProveedor } from './tipos.js'

// Los 3 valores de ia_proveedor_t (20260935000000). Escritos a mano a
// propósito: si alguien agrega un valor al enum, este test falla y obliga a
// escribir su descriptor — que es justo la garantía que el COMMENT ON TYPE
// promete (Record exhaustivo, error de compilación si falta uno).
const PROVEEDORES: IaProveedor[] = ['anthropic', 'openai', 'google', 'openrouter']

describe('descriptores de proveedor de IA', () => {
  it('los 4 proveedores del enum tienen descriptor', () => {
    expect(Object.keys(DESCRIPTORES).sort()).toEqual([...PROVEEDORES].sort())
  })

  it('LISTA_DESCRIPTORES expone exactamente los valores de DESCRIPTORES', () => {
    expect(LISTA_DESCRIPTORES).toHaveLength(PROVEEDORES.length)
    expect(LISTA_DESCRIPTORES.map((d) => d.proveedor).sort()).toEqual([...PROVEEDORES].sort())
  })

  it.each(PROVEEDORES)('%s declara capacidades completas', (proveedor) => {
    const descriptor = DESCRIPTORES[proveedor]
    expect(descriptor.proveedor).toBe(proveedor)
    expect(descriptor.nombreComercial.length).toBeGreaterThan(0)
    expect(descriptor.capacidades.modelosSoportados.length).toBeGreaterThan(0)
    expect(descriptor.capacidades.credencialesRequeridas.length).toBeGreaterThan(0)
    expect(descriptor.capacidades.credencialesRequeridas).toContain('api_key')
    expect(descriptor.capacidades.urlDocumentacion).toMatch(/^https:\/\//)
  })
})
