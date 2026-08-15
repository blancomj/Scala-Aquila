/**
 * Cuenta corriente — imputación de pagos (PLAN §6.3) e interés de mora
 * (PLAN §6.6). Puro, sin Supabase — mismo nivel de pureza que
 * allocation.ts/graph.ts (D-14). Toda la aritmética pasa por
 * financial-operation-service.ts, nunca decimal.js directo (Docs/19 §96,
 * vigilado por eslint.config.js).
 *
 * AD-31: separado del motor de liquidación de conceptos — este módulo no
 * conoce liquidaciones/liquidacion_lineas, solo el ledger de cargos que
 * cuenta-corriente-supabase.ts arma desde ellas.
 */
import * as fos from '@aquila/financial-kernel'
import {
  isZeroMoney,
  isNegativeMoney,
  type Money,
  type RoundingPolicy,
} from '@aquila/financial-kernel'
import {
  OrdenImputacionInvalidoError,
  EstrategiaImputacionInvalidaError,
  PoliticaMoraNoConfiguradaError,
} from './errors.js'

export type CategoriaCargo = 'capital' | 'interes' | 'otro'

/** Cargo abierto (monto_pendiente > 0) tal como lo arma cuenta-corriente-supabase.ts desde v_cargo_saldo. */
export interface CargoAbierto {
  readonly id: string
  /** clavePeriodo() del periodo del cargo — comparable lexicográficamente (snapshot.ts). */
  readonly periodoClave: string
  readonly categoria: CategoriaCargo
  /** Desempate dentro de categoria='otro' — conceptos.prioridad; null si el cargo no viene de un concepto. */
  readonly conceptoPrioridad: number | null
  /** ISO date (YYYY-MM-DD) — ancla del día-cuenta de mora. */
  readonly fechaVencimiento: string
  readonly montoPendiente: Money
}

/** AD-36: qué periodo se sirve primero. El orden de categoría se mantiene igual en ambas. */
export type EstrategiaImputacion = 'deuda_mas_antigua' | 'periodo_actual'

export interface AplicacionPago {
  readonly cargoId: string
  readonly monto: Money
}

export interface PlanImputacion {
  readonly aplicaciones: readonly AplicacionPago[]
  readonly aplicado: Money
  /** Sobrante tras cubrir todo lo pendiente disponible — crédito a favor (AD-34), sin fila especial. */
  readonly noAplicado: Money
}

const CATEGORIAS_VALIDAS: readonly CategoriaCargo[] = ['interes', 'capital', 'otro']
const ESTRATEGIAS_VALIDAS: readonly EstrategiaImputacion[] = ['deuda_mas_antigua', 'periodo_actual']

function validarOrdenCategoria(orden: readonly CategoriaCargo[]): void {
  const esPermutacionValida =
    orden.length === CATEGORIAS_VALIDAS.length && CATEGORIAS_VALIDAS.every((c) => orden.includes(c))
  if (!esPermutacionValida) throw new OrdenImputacionInvalidoError(orden)
}

function validarEstrategia(estrategia: string): asserts estrategia is EstrategiaImputacion {
  if (!ESTRATEGIAS_VALIDAS.includes(estrategia as EstrategiaImputacion)) {
    throw new EstrategiaImputacionInvalidaError(estrategia)
  }
}

function compararPorCategoria(
  a: CargoAbierto,
  b: CargoAbierto,
  ordenCategoria: readonly CategoriaCargo[],
): number {
  const rangoA = ordenCategoria.indexOf(a.categoria)
  const rangoB = ordenCategoria.indexOf(b.categoria)
  if (rangoA !== rangoB) return rangoA - rangoB

  if (a.categoria === 'otro') {
    const prioridadA = a.conceptoPrioridad ?? Number.MAX_SAFE_INTEGER
    const prioridadB = b.conceptoPrioridad ?? Number.MAX_SAFE_INTEGER
    if (prioridadA !== prioridadB) return prioridadA - prioridadB
  }

  // Empate final determinista — mismo criterio que el desempate por id de allocation.ts.
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * `deuda_mas_antigua`: periodoClave ASC → categoría (ordenCategoria) → desempate.
 * `periodo_actual`: el periodo indicado primero (por categoría), luego el resto
 * cascadea por periodoClave ASC — el remanente nunca queda ocioso como crédito
 * mientras haya deuda pendiente en otro periodo (AD-36).
 */
function ordenarCargos(
  cargos: readonly CargoAbierto[],
  ordenCategoria: readonly CategoriaCargo[],
  estrategia: EstrategiaImputacion,
  periodoActualClave: string,
): readonly CargoAbierto[] {
  if (estrategia === 'deuda_mas_antigua') {
    return [...cargos].sort((a, b) => {
      if (a.periodoClave !== b.periodoClave) return a.periodoClave < b.periodoClave ? -1 : 1
      return compararPorCategoria(a, b, ordenCategoria)
    })
  }

  return [...cargos].sort((a, b) => {
    const esActualA = a.periodoClave === periodoActualClave
    const esActualB = b.periodoClave === periodoActualClave
    if (esActualA !== esActualB) return esActualA ? -1 : 1
    if (a.periodoClave !== b.periodoClave) return a.periodoClave < b.periodoClave ? -1 : 1
    return compararPorCategoria(a, b, ordenCategoria)
  })
}

/**
 * Waterfall greedy — no allocate() (Docs/19 §6): esto es secuencial, no un
 * reparto proporcional de una fuente entre varios targets simultáneos.
 */
export function imputarPago(
  montoPago: Money,
  cargosAbiertos: readonly CargoAbierto[],
  ordenCategoria: readonly CategoriaCargo[],
  estrategia: EstrategiaImputacion,
  periodoActualClave: string,
): PlanImputacion {
  validarEstrategia(estrategia)
  validarOrdenCategoria(ordenCategoria)

  const ordenados = ordenarCargos(cargosAbiertos, ordenCategoria, estrategia, periodoActualClave)

  const aplicaciones: AplicacionPago[] = []
  let restante = montoPago
  for (const cargo of ordenados) {
    if (isZeroMoney(restante)) break
    if (isZeroMoney(cargo.montoPendiente) || isNegativeMoney(cargo.montoPendiente)) continue

    const monto =
      fos.comparar(restante, cargo.montoPendiente) <= 0 ? restante : cargo.montoPendiente
    aplicaciones.push({ cargoId: cargo.id, monto })
    restante = fos.restar(restante, monto)
  }

  const aplicado = fos.restar(montoPago, restante)
  // pago.monto = aplicado + noAplicado, exacto — nunca epsilon (Docs/19 §94).
  if (!fos.esIgual(fos.sumar(aplicado, restante), montoPago)) {
    throw new Error(
      `Invariante violado: aplicado (${aplicado.amount.toString()}) + noAplicado ` +
        `(${restante.amount.toString()}) != montoPago (${montoPago.amount.toString()})`,
    )
  }

  return { aplicaciones, aplicado, noAplicado: restante }
}

// ─────────────────────────── Interés de mora ────────────────────────────

export interface CargoInteresGenerado {
  readonly cargoCapitalOrigenId: string
  readonly monto: Money
  readonly diasMora: number
  readonly topeAplicado: boolean
}

/** politicas_financieras.interes_* vigente (PLAN §6.6). */
export interface PoliticaMora {
  readonly tasaMensual: string | null
  readonly topeMensual: string | null
  readonly diasGracia: number
}

function timestampUtc(fechaIso: string): number {
  const partes = fechaIso.split('-').map(Number)
  const [anio, mes, dia] = partes
  if (partes.length !== 3 || anio === undefined || mes === undefined || dia === undefined) {
    throw new Error(`Fecha ISO inválida: "${fechaIso}" — se espera YYYY-MM-DD`)
  }
  return Date.UTC(anio, mes - 1, dia)
}

/** Días calendario reales entre dos fechas ISO (YYYY-MM-DD), UTC — sin husos horarios. */
function diasCalendario(desde: string, hasta: string): number {
  const msPorDia = 24 * 60 * 60 * 1000
  return Math.round((timestampUtc(hasta) - timestampUtc(desde)) / msPorDia)
}

/**
 * PLAN §6.6: base = saldo vencido de CAPITAL (nunca compone sobre interés ya
 * generado — por eso solo acepta cargos categoria='capital'), day-count =
 * calendario, devengo diario desde el día siguiente al vencimiento, gracia
 * parametrizable, tasa/tope de la política vigente.
 */
export function calcularInteresMora(
  cargosCapitalPendientes: readonly CargoAbierto[],
  fechaReferencia: string,
  politica: PoliticaMora,
  redondeo: RoundingPolicy,
): readonly CargoInteresGenerado[] {
  if (politica.tasaMensual === null || politica.topeMensual === null) {
    throw new PoliticaMoraNoConfiguradaError()
  }
  const tasaMensual = politica.tasaMensual
  const topeMensual = politica.topeMensual
  const topeAplica = fos.compararDecimales(tasaMensual, topeMensual) > 0
  const tasaEfectiva = topeAplica ? topeMensual : tasaMensual
  const tasaDiaria = fos.dividirDecimales(tasaEfectiva, 30)

  const generados: CargoInteresGenerado[] = []
  for (const cargo of cargosCapitalPendientes) {
    if (cargo.categoria !== 'capital') continue
    if (isZeroMoney(cargo.montoPendiente) || isNegativeMoney(cargo.montoPendiente)) continue

    const diasVencido = diasCalendario(cargo.fechaVencimiento, fechaReferencia)
    const diasMora = Math.max(0, diasVencido - politica.diasGracia)
    if (diasMora === 0) continue

    const factor = fos.multiplicarDecimales(tasaDiaria, diasMora)
    const monto = fos.redondear(fos.multiplicar(cargo.montoPendiente, factor), redondeo)
    if (isZeroMoney(monto)) continue

    generados.push({ cargoCapitalOrigenId: cargo.id, monto, diasMora, topeAplicado: topeAplica })
  }

  return generados
}
