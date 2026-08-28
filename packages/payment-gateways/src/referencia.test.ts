import { describe, expect, it } from 'vitest'
import { construirReferencia, normalizarSegmento, parsearReferencia } from './referencia.js'

const UUID = '9f3a21b4-5c6d-4e7f-8a9b-0c1d2e3f4a5b'

describe('referencia estructurada de pasarela', () => {
  it('construye el formato {tenant}-{inmueble}-{periodo}-{uuid8}', () => {
    expect(
      construirReferencia({
        tenantSlug: 'lareles',
        codigoInmueble: 'APT101',
        periodo: '202601',
        uuid: UUID,
      }),
    ).toBe('lareles-apt101-202601-9f3a21b4')
  })

  it('construir y parsear son inversos, incluso con guiones y acentos', () => {
    // El caso que rompe un split() ingenuo: guiones en AMBOS segmentos.
    const casos = [
      { tenantSlug: 'torre-a', codigoInmueble: 'APT-101' },
      { tenantSlug: 'Conjunto Los Laureles', codigoInmueble: 'Casa 3' },
      { tenantSlug: 'edificio-ñandú', codigoInmueble: 'APTO-Á-9' },
      { tenantSlug: 'a', codigoInmueble: '1' },
    ]
    for (const caso of casos) {
      const referencia = construirReferencia({ ...caso, periodo: '202612', uuid: UUID })
      const parseada = parsearReferencia(referencia)
      expect(parseada).not.toBeNull()
      expect(parseada?.tenantSlug).toBe(normalizarSegmento(caso.tenantSlug))
      expect(parseada?.codigoInmueble).toBe(normalizarSegmento(caso.codigoInmueble))
      expect(parseada?.periodo).toBe('202612')
      expect(parseada?.uuidCorto).toBe('9f3a21b4')
    }
  })

  it('rechaza un periodo que no sea AAAAMM', () => {
    expect(() =>
      construirReferencia({
        tenantSlug: 'x',
        codigoInmueble: 'y',
        periodo: '2026-01',
        uuid: UUID,
      }),
    ).toThrow(/AAAAMM/)
  })

  it('rechaza segmentos que quedan vacíos tras normalizar', () => {
    expect(() =>
      construirReferencia({ tenantSlug: '---', codigoInmueble: 'x', periodo: '202601', uuid: UUID }),
    ).toThrow(/no pueden quedar vacíos/)
  })

  it('parsear devuelve null ante basura, nunca lanza', () => {
    // Entrada hostil: viene del cuerpo de un webhook anónimo.
    const basura = [
      '',
      'sin-guiones',
      'a-b-c',
      'a-b-c-d-e',
      'a-b-2026AA-9f3a21b4',
      'a-b-202601-ZZZZZZZZ',
      'a-b-202601-9f3a21',
      "a-b-202601-9f3a21b4'; drop table pagos;--",
      'A-B-202601-9f3a21b4',
    ]
    for (const entrada of basura) {
      expect(parsearReferencia(entrada)).toBeNull()
    }
  })
})
