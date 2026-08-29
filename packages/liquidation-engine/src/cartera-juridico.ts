/**
 * Certificación de deuda — el artefacto del art. 48 Ley 675 (Docs/Motor de
 * gestion de cartera/CAR_00_Guia_Oficial.md §15.2). Puro, sin Supabase —
 * mismo nivel de pureza que cartera.ts (D-14, REC-CAR-009). Mismo patrón
 * que calcularPosicionHash()/PosicionCarteraSnapshotDatos (cartera.ts): el
 * mismo objeto que se hashea es el que se persiste, así ambos nunca pueden
 * divergir entre sí.
 *
 * GAP-CAR-011 — RESUELTO (2026-08-29). Cuando se escribió el gap
 * (2026-08-17) el esquema no distinguía una cuota extraordinaria de una
 * ordinaria a nivel de cargo, ni una sanción de cualquier otro cargo
 * categoria='otro'. Desde entonces se sembraron dos catálogos que sí
 * discriminan a nivel de cargo:
 *   - conceptos_plantilla (20260901180000): el concepto CUOTA_EXTRA es
 *     real y produce cargos con concepto_id propio — un cargo
 *     categoria='capital' cuyo concepto es CUOTA_EXTRA es una expensa
 *     extraordinaria, cualquier otro concepto de categoria='capital' es
 *     ordinaria.
 *   - novedad_tipo_cuenta (20260830240000): TIPO_NOVEDAD 'sancion' (uno de
 *     los 8 motivos sembrados en lista_tipos, 20260814180000) ya se
 *     referencia desde novedades.tipo_novedad_id — un cargo
 *     categoria='otro' cuya novedad tiene motivo 'sancion' es una sanción,
 *     cualquier otro motivo (o sin novedad) sigue siendo montoOtros.
 * Los 5 rubros del art. 48 se certifican con exactitud; el total sigue
 * reconciliando con fn_posicion_cartera (misma fuente de cargos).
 */
import * as fos from '@aquila/financial-kernel'
import { createHash } from 'node:crypto'
import type { CategoriaCargo } from './cuenta-corriente.js'

/** conceptos.codigo de la cuota extraordinaria (conceptos_plantilla, 20260901180000). */
const CONCEPTO_CODIGO_CUOTA_EXTRAORDINARIA = 'CUOTA_EXTRA'
/** lista_tipos.codigo (familia TIPO_NOVEDAD) que marca una sanción (20260814180000). */
const TIPO_NOVEDAD_CODIGO_SANCION = 'sancion'

export class CertificacionSinDeudaError extends Error {
  constructor(inmuebleId: string, fechaCorte: string) {
    super(
      `No hay deuda vencida para el inmueble ${inmuebleId} a la fecha de corte ${fechaCorte} — ` +
        `no tiene sentido expedir una certificación de deuda en cero.`,
    )
    this.name = 'CertificacionSinDeudaError'
  }
}

/** Exactamente lo que detalle_cargos congela (REC-CAR-014): id, período, concepto, vencimiento, monto original, saldo. */
export interface DetalleCargoCertificado {
  readonly cargoId: string
  readonly periodoClave: string
  readonly conceptoCodigo: string | null
  readonly fechaVencimiento: string
  readonly montoOriginal: string
  readonly saldoPendiente: string
  readonly categoria: CategoriaCargo
  /** lista_tipos.codigo (TIPO_NOVEDAD) de la novedad origen del cargo — null si no viene de una novedad. */
  readonly motivoNovedadCodigo: string | null
}

/**
 * Exactamente los campos que persiste certificaciones_deuda — el mismo
 * objeto sirve para calcular el hash y para armar el INSERT
 * (cartera-juridico-supabase.ts).
 */
export interface CertificacionDeudaDatos {
  readonly tenantId: string
  readonly inmuebleId: string
  readonly consecutivo: string
  readonly fechaExpedicion: string
  readonly fechaCorte: string
  readonly montoExpensasOrdinarias: string
  readonly montoExpensasExtraordinarias: string
  readonly montoInteresesMora: string
  readonly montoSanciones: string
  readonly montoOtros: string
  readonly montoTotal: string
  /** Orden canónico: (fechaVencimiento, cargoId) — necesario para que el hash sea reproducible. */
  readonly detalleCargos: readonly DetalleCargoCertificado[]
  readonly politicaFinancieraId: string
  readonly politicaVersion: number
  readonly cargoFirmante: string
}

/**
 * CAR §15.2 (I-C15-style) — agrega los cargos vencidos con saldo (ya
 * filtrados por el llamador a fecha_corte, mismo criterio que
 * fn_posicion_cartera) en los 5 rubros del art. 48. Determinista: los
 * mismos cargos siempre producen el mismo desglose y el mismo total.
 */
export function construirCertificacionDeuda(params: {
  readonly tenantId: string
  readonly inmuebleId: string
  readonly consecutivo: string
  readonly fechaExpedicion: string
  readonly fechaCorte: string
  readonly cargos: readonly DetalleCargoCertificado[]
  readonly politicaFinancieraId: string
  readonly politicaVersion: number
  readonly cargoFirmante: string
}): CertificacionDeudaDatos {
  const detalleOrdenado = [...params.cargos].sort((a, b) => {
    const porFecha = a.fechaVencimiento.localeCompare(b.fechaVencimiento)
    return porFecha !== 0 ? porFecha : a.cargoId.localeCompare(b.cargoId)
  })

  const sumar = (cs: readonly DetalleCargoCertificado[]): string =>
    fos.sumarDecimales(cs.map((c) => c.saldoPendiente)).toString()

  const esExtraordinaria = (c: DetalleCargoCertificado): boolean =>
    c.conceptoCodigo === CONCEPTO_CODIGO_CUOTA_EXTRAORDINARIA
  const esSancion = (c: DetalleCargoCertificado): boolean =>
    c.motivoNovedadCodigo === TIPO_NOVEDAD_CODIGO_SANCION

  const cargosCapital = detalleOrdenado.filter((c) => c.categoria === 'capital')
  const cargosOtro = detalleOrdenado.filter((c) => c.categoria === 'otro')

  const ordinarias = sumar(cargosCapital.filter((c) => !esExtraordinaria(c)))
  const extraordinarias = sumar(cargosCapital.filter(esExtraordinaria))
  const interesesMora = sumar(detalleOrdenado.filter((c) => c.categoria === 'interes'))
  const sanciones = sumar(cargosOtro.filter(esSancion))
  const otros = sumar(cargosOtro.filter((c) => !esSancion(c)))
  const total = fos.sumarDecimales([ordinarias, extraordinarias, interesesMora, sanciones, otros]).toString()

  if (fos.compararDecimales(total, '0') <= 0) {
    throw new CertificacionSinDeudaError(params.inmuebleId, params.fechaCorte)
  }

  return {
    tenantId: params.tenantId,
    inmuebleId: params.inmuebleId,
    consecutivo: params.consecutivo,
    fechaExpedicion: params.fechaExpedicion,
    fechaCorte: params.fechaCorte,
    montoExpensasOrdinarias: ordinarias,
    montoExpensasExtraordinarias: extraordinarias,
    montoInteresesMora: interesesMora,
    montoSanciones: sanciones,
    montoOtros: otros,
    montoTotal: total,
    detalleCargos: detalleOrdenado,
    politicaFinancieraId: params.politicaFinancieraId,
    politicaVersion: params.politicaVersion,
    cargoFirmante: params.cargoFirmante,
  }
}

/**
 * REC-CAR-014/PH-C32 — mismo principio que calcularPosicionHash(): serialización
 * canónica con orden de campos estable, solo valores deterministas. Recalcular
 * con los mismos cargos y la misma política SIEMPRE reproduce el mismo hash.
 */
export function calcularCertificacionHash(datos: CertificacionDeudaDatos): string {
  const canonico = JSON.stringify({
    tenantId: datos.tenantId,
    inmuebleId: datos.inmuebleId,
    consecutivo: datos.consecutivo,
    fechaExpedicion: datos.fechaExpedicion,
    fechaCorte: datos.fechaCorte,
    montoExpensasOrdinarias: datos.montoExpensasOrdinarias,
    montoExpensasExtraordinarias: datos.montoExpensasExtraordinarias,
    montoInteresesMora: datos.montoInteresesMora,
    montoSanciones: datos.montoSanciones,
    montoOtros: datos.montoOtros,
    montoTotal: datos.montoTotal,
    detalleCargos: datos.detalleCargos.map((c) => ({
      cargoId: c.cargoId,
      periodoClave: c.periodoClave,
      conceptoCodigo: c.conceptoCodigo,
      fechaVencimiento: c.fechaVencimiento,
      montoOriginal: c.montoOriginal,
      saldoPendiente: c.saldoPendiente,
      categoria: c.categoria,
      motivoNovedadCodigo: c.motivoNovedadCodigo,
    })),
    politicaFinancieraId: datos.politicaFinancieraId,
    politicaVersion: datos.politicaVersion,
    cargoFirmante: datos.cargoFirmante,
  })
  return createHash('sha256').update(canonico).digest('hex')
}
