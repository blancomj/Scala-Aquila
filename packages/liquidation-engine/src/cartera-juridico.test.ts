import { describe, expect, it } from 'vitest'
import {
  CertificacionSinDeudaError,
  calcularCertificacionHash,
  construirCertificacionDeuda,
  type DetalleCargoCertificado,
} from './cartera-juridico.js'

function cargo(over: Partial<DetalleCargoCertificado> & { cargoId: string }): DetalleCargoCertificado {
  return {
    periodoClave: '2026-01',
    conceptoCodigo: 'ADMINISTRACION',
    fechaVencimiento: '2026-01-05',
    montoOriginal: '100000',
    saldoPendiente: '100000',
    categoria: 'capital',
    motivoNovedadCodigo: null,
    ...over,
  }
}

function baseParams(cargos: readonly DetalleCargoCertificado[]) {
  return {
    tenantId: 'tenant-1',
    inmuebleId: 'inmueble-1',
    consecutivo: 'CERT-2026-001',
    fechaExpedicion: '2026-08-17',
    fechaCorte: '2026-08-01',
    cargos,
    politicaFinancieraId: 'politica-1',
    politicaVersion: 3,
    cargoFirmante: 'Administrador',
  }
}

describe('construirCertificacionDeuda', () => {
  it('discrimina capital→ordinarias, interes→intereses_mora, otro→otros cuando no hay marca de extraordinaria/sanción', () => {
    const cargos = [
      cargo({ cargoId: 'c1', categoria: 'capital', saldoPendiente: '500000' }),
      cargo({ cargoId: 'c2', categoria: 'interes', saldoPendiente: '30000' }),
      cargo({ cargoId: 'c3', categoria: 'otro', saldoPendiente: '20000' }),
    ]
    const resultado = construirCertificacionDeuda(baseParams(cargos))

    expect(resultado.montoExpensasOrdinarias).toBe('500000')
    expect(resultado.montoInteresesMora).toBe('30000')
    expect(resultado.montoOtros).toBe('20000')
    expect(resultado.montoExpensasExtraordinarias).toBe('0')
    expect(resultado.montoSanciones).toBe('0')
    expect(resultado.montoTotal).toBe('550000')
  })

  it('GAP-CAR-011 resuelto: capital con concepto CUOTA_EXTRA cuenta como extraordinaria, no como ordinaria', () => {
    const cargos = [
      cargo({ cargoId: 'c1', categoria: 'capital', conceptoCodigo: 'ADMINISTRACION', saldoPendiente: '500000' }),
      cargo({ cargoId: 'c2', categoria: 'capital', conceptoCodigo: 'CUOTA_EXTRA', saldoPendiente: '200000' }),
    ]
    const resultado = construirCertificacionDeuda(baseParams(cargos))

    expect(resultado.montoExpensasOrdinarias).toBe('500000')
    expect(resultado.montoExpensasExtraordinarias).toBe('200000')
    expect(resultado.montoTotal).toBe('700000')
  })

  it('GAP-CAR-011 resuelto: otro con motivo de novedad sancion cuenta como sanción, no como otros', () => {
    const cargos = [
      cargo({ cargoId: 'c1', categoria: 'otro', conceptoCodigo: 'NOVEDAD', motivoNovedadCodigo: null, saldoPendiente: '20000' }),
      cargo({
        cargoId: 'c2',
        categoria: 'otro',
        conceptoCodigo: 'NOVEDAD',
        motivoNovedadCodigo: 'sancion',
        saldoPendiente: '50000',
      }),
    ]
    const resultado = construirCertificacionDeuda(baseParams(cargos))

    expect(resultado.montoOtros).toBe('20000')
    expect(resultado.montoSanciones).toBe('50000')
    expect(resultado.montoTotal).toBe('70000')
  })

  it('el total siempre reconcilia con la suma exacta de detalleCargos (PH-C32)', () => {
    const cargos = [
      cargo({ cargoId: 'c1', categoria: 'capital', saldoPendiente: '123456.78' }),
      cargo({ cargoId: 'c2', categoria: 'interes', saldoPendiente: '1000.22' }),
    ]
    const resultado = construirCertificacionDeuda(baseParams(cargos))
    expect(resultado.montoTotal).toBe('124457')
  })

  it('ordena detalleCargos canónicamente por (fechaVencimiento, cargoId) sin importar el orden de entrada', () => {
    const cargos = [
      cargo({ cargoId: 'c-z', fechaVencimiento: '2026-02-01' }),
      cargo({ cargoId: 'c-a', fechaVencimiento: '2026-01-01' }),
      cargo({ cargoId: 'c-b', fechaVencimiento: '2026-01-01' }),
    ]
    const resultado = construirCertificacionDeuda(baseParams(cargos))
    expect(resultado.detalleCargos.map((c) => c.cargoId)).toEqual(['c-a', 'c-b', 'c-z'])
  })

  it('CertificacionSinDeudaError: no se puede certificar un inmueble sin deuda', () => {
    expect(() => construirCertificacionDeuda(baseParams([]))).toThrow(CertificacionSinDeudaError)
  })
})

describe('calcularCertificacionHash', () => {
  it('es reproducible: los mismos datos siempre dan el mismo hash', () => {
    const cargos = [cargo({ cargoId: 'c1', saldoPendiente: '100000' })]
    const a = construirCertificacionDeuda(baseParams(cargos))
    const b = construirCertificacionDeuda(baseParams(cargos))
    expect(calcularCertificacionHash(a)).toBe(calcularCertificacionHash(b))
  })

  it('cambia si cambia cualquier cargo del detalle', () => {
    const original = construirCertificacionDeuda(
      baseParams([cargo({ cargoId: 'c1', saldoPendiente: '100000' })]),
    )
    const modificado = construirCertificacionDeuda(
      baseParams([cargo({ cargoId: 'c1', saldoPendiente: '100001' })]),
    )
    expect(calcularCertificacionHash(original)).not.toBe(calcularCertificacionHash(modificado))
  })

  it('cambia si cambia el motivo de novedad de un cargo aunque el saldo sea igual', () => {
    const sinMotivo = construirCertificacionDeuda(
      baseParams([cargo({ cargoId: 'c1', categoria: 'otro', motivoNovedadCodigo: null })]),
    )
    const conSancion = construirCertificacionDeuda(
      baseParams([cargo({ cargoId: 'c1', categoria: 'otro', motivoNovedadCodigo: 'sancion' })]),
    )
    expect(calcularCertificacionHash(sinMotivo)).not.toBe(calcularCertificacionHash(conSancion))
  })
})
