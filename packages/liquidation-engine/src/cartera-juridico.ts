/**
 * Certificación de deuda — el artefacto del art. 48 Ley 675 (Docs/Motor de
 * gestion de cartera/CAR_00_Guia_Oficial.md §15.2). Puro, sin Supabase —
 * mismo nivel de pureza que cartera.ts (D-14, REC-CAR-009). Mismo patrón
 * que calcularPosicionHash()/PosicionCarteraSnapshotDatos (cartera.ts): el
 * mismo objeto que se hashea es el que se persiste, así ambos nunca pueden
 * divergir entre sí.
 *
 * GAP-CAR-011 (decisión explícita del usuario, 2026-08-17): el esquema NO
 * distingue hoy una cuota extraordinaria de una ordinaria a nivel de cargo
 * (fuente_financiacion.cuota_extraordinaria es una fuente de financiación
 * del PRESUPUESTO, no una marca por cargo — "todavía no reduce
 * conceptos.CUOTA_ADMIN", 20260814200000). Tampoco hay ninguna marca que
 * distinga una sanción de cualquier otro cargo categoria='otro'
 * (TIPO_NOVEDAD en lista_tipos existe sembrado pero NUNCA se referencia
 * desde ninguna tabla/código — novedades.tipo es el enum CHARGE/DISCOUNT/
 * ADJUSTMENT/REFUND/CREDIT/DEBIT, sin sub-clasificación). Por eso
 * montoExpensasExtraordinarias y montoSanciones son SIEMPRE '0' — no se
 * inventa una clasificación que no existe. Los 3 rubros que sí son
 * ciertos (capital→ordinarias, interés→intereses_mora, todo lo demás
 * categoria='otro'→montoOtros) se certifican con exactitud, y el total
 * siempre reconcilia con fn_posicion_cartera (misma fuente de cargos).
 */
import * as fos from '@aquila/financial-kernel'
import { createHash } from 'node:crypto'
import type { CategoriaCargo } from './cuenta-corriente.js'

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
  /** GAP-CAR-011 — siempre '0', ver cabecera del archivo. */
  readonly montoExpensasExtraordinarias: string
  readonly montoInteresesMora: string
  /** GAP-CAR-011 — siempre '0', ver cabecera del archivo. */
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

  const porCategoria = (categoria: CategoriaCargo): string =>
    fos
      .sumarDecimales(detalleOrdenado.filter((c) => c.categoria === categoria).map((c) => c.saldoPendiente))
      .toString()

  const ordinarias = porCategoria('capital')
  const interesesMora = porCategoria('interes')
  const otros = porCategoria('otro')
  const extraordinarias = '0' // GAP-CAR-011
  const sanciones = '0' // GAP-CAR-011
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
    })),
    politicaFinancieraId: datos.politicaFinancieraId,
    politicaVersion: datos.politicaVersion,
    cargoFirmante: datos.cargoFirmante,
  })
  return createHash('sha256').update(canonico).digest('hex')
}
