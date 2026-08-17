/**
 * Indicadores de cartera — Overdue Portfolio %, Roll Rate, Cure Rate
 * (Docs/Motor de gestion de cartera/CAR_00_Guia_Oficial.md §23.3). Puro,
 * sin Supabase — mismo nivel de pureza que cartera.ts (D-14, REC-CAR-009).
 *
 * Fuente: posiciones_cartera_snapshot (F3) — NO fn_dashboard_cartera
 * (F9 parte 1, siempre "ahora mismo"). Roll Rate y Cure Rate comparan DOS
 * fechas de corte, así que necesitan snapshots ya congelados; no tiene
 * sentido "recalcular en vivo" un estado pasado (REC-CAR-011/012: la
 * clasificación congelada en el snapshot es la que manda, un cambio de
 * política posterior no reescribe historia).
 *
 * "deudaTotal" de cada fila de snapshot es la deuda VENCIDA (así la
 * define fn_posicion_cartera/F1, que produce el snapshot) — no la deuda
 * total del inmueble. Overdue Portfolio % SÍ necesita la deuda TOTAL
 * (vencida+corriente), que no vive en el snapshot — se compone aparte con
 * fn_dashboard_cartera (F9 parte 1) en el llamador.
 *
 * Roll Rate exige el ORDEN de los tramos de la política (dias_min
 * ascendente) para saber cuál es "el siguiente" tramo de deterioro — el
 * llamador decide de qué política tomarlo (normalmente la vigente al
 * fecha_desde, REC-CAR-012). Un inmueble sin fila en el snapshot de
 * llegada (fecha_hasta) se cuenta en el denominador (estaba en el tramo
 * en t−1, la fórmula no exige que exista en t) pero no puede "rolar" a
 * ningún lado — no se inventa su destino.
 */
import { isZeroMoney, money, type Money } from '@aquila/financial-kernel'
import * as fos from '@aquila/financial-kernel'

export interface FilaSnapshotIndicador {
  readonly inmuebleId: string
  /** Deuda VENCIDA congelada en el snapshot (fn_posicion_cartera). */
  readonly deudaVencida: Money
  readonly clasificacionCodigo: string
}

/**
 * `null` cuando el denominador es cero — indeterminado, nunca se informa
 * como 0% (0% de una base cero no es "cero deterioro", es "no aplica").
 */
export function calcularOverduePortfolioPct(carteraVencida: Money, carteraTotal: Money): number | null {
  if (isZeroMoney(carteraTotal)) return null
  return fos.dividirDecimales(carteraVencida.amount, carteraTotal.amount).times(100).toNumber()
}

export function calcularCureRate(
  snapshotAnterior: readonly FilaSnapshotIndicador[],
  snapshotActual: readonly FilaSnapshotIndicador[],
  moneda: string,
): number | null {
  const actualPorInmueble = new Map(snapshotActual.map((f) => [f.inmuebleId, f]))

  let deudaVencidaAnterior = money(0, moneda)
  let deudaCurada = money(0, moneda)
  for (const anterior of snapshotAnterior) {
    if (isZeroMoney(anterior.deudaVencida)) continue // no estaba vencida en t−1 — no compite en este indicador.
    deudaVencidaAnterior = fos.sumar(deudaVencidaAnterior, anterior.deudaVencida)

    const actual = actualPorInmueble.get(anterior.inmuebleId)
    if (actual && isZeroMoney(actual.deudaVencida)) {
      deudaCurada = fos.sumar(deudaCurada, anterior.deudaVencida)
    }
  }

  if (isZeroMoney(deudaVencidaAnterior)) return null
  return fos.dividirDecimales(deudaCurada.amount, deudaVencidaAnterior.amount).times(100).toNumber()
}

export interface TramoOrdenado {
  readonly codigo: string
}

export interface RollRateTramo {
  readonly tramoCodigo: string
  /** null si es el último tramo de la política — no hay a dónde deteriorar más. */
  readonly tramoSiguienteCodigo: string | null
  readonly deudaEnTramoAnterior: Money
  readonly deudaQueRoloAlSiguiente: Money
  /** null si deudaEnTramoAnterior es cero (indeterminado) o si es el último tramo. */
  readonly rollRate: number | null
}

/**
 * CAR §23.3 — "Σ deuda que estaba en tramo T en t−1 y está en tramo T+1
 * en t / Σ deuda en tramo T en t−1", uno por cada tramo salvo el último.
 * `tramosOrdenados` debe venir ya ordenado por dias_min ascendente (mismo
 * orden que devuelve obtenerPoliticaClasificacionVigente).
 */
export function calcularRollRatePorTramo(
  snapshotAnterior: readonly FilaSnapshotIndicador[],
  snapshotActual: readonly FilaSnapshotIndicador[],
  tramosOrdenados: readonly TramoOrdenado[],
  moneda: string,
): readonly RollRateTramo[] {
  const actualPorInmueble = new Map(snapshotActual.map((f) => [f.inmuebleId, f]))

  return tramosOrdenados.map((tramo, indice) => {
    const siguiente = tramosOrdenados[indice + 1] ?? null

    let deudaEnTramoAnterior = money(0, moneda)
    let deudaQueRolo = money(0, moneda)
    for (const fila of snapshotAnterior) {
      if (fila.clasificacionCodigo !== tramo.codigo) continue
      deudaEnTramoAnterior = fos.sumar(deudaEnTramoAnterior, fila.deudaVencida)
      if (siguiente === null) continue
      const actual = actualPorInmueble.get(fila.inmuebleId)
      if (actual && actual.clasificacionCodigo === siguiente.codigo) {
        deudaQueRolo = fos.sumar(deudaQueRolo, fila.deudaVencida)
      }
    }

    const rollRate =
      siguiente === null || isZeroMoney(deudaEnTramoAnterior)
        ? null
        : fos.dividirDecimales(deudaQueRolo.amount, deudaEnTramoAnterior.amount).times(100).toNumber()

    return {
      tramoCodigo: tramo.codigo,
      tramoSiguienteCodigo: siguiente?.codigo ?? null,
      deudaEnTramoAnterior,
      deudaQueRoloAlSiguiente: deudaQueRolo,
      rollRate,
    }
  })
}
