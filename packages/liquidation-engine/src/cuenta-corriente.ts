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
  SegmentacionDayCountNoSoportadoError,
  SegmentosTasaSolapadosError,
  ImputacionManualInvalidaError,
  CuotaAcuerdoNoConciliableError,
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
  /** cargos.novedad_id → novedades.tipo — null salvo categoria='otro' con origen_tipo='novedad'. */
  readonly novedadTipo: NovedadTipo | null
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

export interface AplicacionManual {
  readonly cargoId: string
  readonly monto: Money
}

/**
 * Construye un PlanImputacion a partir de una selección manual del auxiliar
 * (art. 1653 C.C. — el pagador puede declarar a qué obligación aplica su
 * pago). A diferencia de imputarPago(), no ordena ni decide por el usuario:
 * solo valida integridad (cargo abierto en este inmueble, sin duplicados,
 * cada monto ≤ pendiente del cargo, suma ≤ monto del pago) y arma el mismo
 * PlanImputacion que consume registrarPago() — el remanente (si lo hay)
 * queda como noAplicado, igual que un sobrepago hoy.
 */
export function construirPlanManual(
  montoPago: Money,
  aplicaciones: readonly AplicacionManual[],
  cargosAbiertos: readonly CargoAbierto[],
): PlanImputacion {
  if (aplicaciones.length === 0) {
    throw new ImputacionManualInvalidaError('se requiere al menos un cargo.')
  }
  const cargosPorId = new Map(cargosAbiertos.map((c) => [c.id, c]))
  const vistos = new Set<string>()
  let acumulado = fos.money(0, montoPago.currency)

  for (const a of aplicaciones) {
    if (vistos.has(a.cargoId)) {
      throw new ImputacionManualInvalidaError(`el cargo ${a.cargoId} está repetido.`)
    }
    vistos.add(a.cargoId)
    const cargo = cargosPorId.get(a.cargoId)
    if (!cargo) {
      throw new ImputacionManualInvalidaError(`el cargo ${a.cargoId} no está pendiente en este inmueble.`)
    }
    if (fos.comparar(a.monto, cargo.montoPendiente) > 0) {
      throw new ImputacionManualInvalidaError(
        `${a.monto.amount.toString()} excede el pendiente del cargo ${a.cargoId} ` +
          `(${cargo.montoPendiente.amount.toString()}).`,
      )
    }
    acumulado = fos.sumar(acumulado, a.monto)
  }
  if (fos.comparar(acumulado, montoPago) > 0) {
    throw new ImputacionManualInvalidaError(
      `las aplicaciones (${acumulado.amount.toString()}) exceden el monto del pago ` +
        `(${montoPago.amount.toString()}).`,
    )
  }

  return {
    aplicaciones: aplicaciones.map((a) => ({ cargoId: a.cargoId, monto: a.monto })),
    aplicado: acumulado,
    noAplicado: fos.restar(montoPago, acumulado),
  }
}

// ────────────────────── Conciliación pago↔cuota de acuerdo (GAP-CAR-008) ─

export type EstadoCuotaAcuerdo = 'pendiente' | 'parcial' | 'pagada' | 'vencida' | 'incumplida' | 'cancelada'

/** Solo se concilia contra una cuota todavía abierta — pagada/incumplida/cancelada son estados finales. */
const ESTADOS_CUOTA_CONCILIABLES: readonly EstadoCuotaAcuerdo[] = ['pendiente', 'parcial', 'vencida']

export interface CuotaAcuerdoActual {
  readonly monto: Money
  readonly montoPagado: Money
  readonly estado: EstadoCuotaAcuerdo
}

export interface ResultadoConciliacionCuota {
  readonly montoPagado: Money
  readonly estado: 'parcial' | 'pagada'
  readonly sePagaCompleto: boolean
}

/**
 * GAP-CAR-008 (CAR §12.4, decisión explícita del usuario 2026-08-17):
 * asociación explícita pago↔cuota vía pagos.acuerdo_cuota_id — no hay
 * inferencia por monto/fecha (queda para cuando exista un caso de uso
 * real que la ejerza). Esta función solo calcula cuánto de `montoPago`
 * cubre la cuota y en qué estado queda; nunca decide SI se asocia — eso
 * ya lo decidió quien registró el pago.
 *
 * montoPagado nunca excede cuota.monto (cuota_pagado_no_excede,
 * 20260822310000): el pago ya se aplicó por completo a cargos vía
 * imputarPago() antes de llegar aquí — este cálculo solo etiqueta cuánto
 * de esa cuota quedó cubierto, un pago mayor al saldo de la cuota
 * simplemente la salda sin que el exceso se "pierda" (ya está aplicado
 * en el ledger real).
 */
export function conciliarCuotaAcuerdo(cuota: CuotaAcuerdoActual, montoPago: Money): ResultadoConciliacionCuota {
  if (!ESTADOS_CUOTA_CONCILIABLES.includes(cuota.estado)) {
    throw new CuotaAcuerdoNoConciliableError(cuota.estado)
  }

  const sumaBruta = fos.sumar(cuota.montoPagado, montoPago)
  const excede = fos.comparar(sumaBruta, cuota.monto) > 0
  const montoPagadoFinal = excede ? cuota.monto : sumaBruta
  const sePagaCompleto = excede || fos.comparar(montoPagadoFinal, cuota.monto) === 0

  return {
    montoPagado: montoPagadoFinal,
    estado: sePagaCompleto ? 'pagada' : 'parcial',
    sePagaCompleto,
  }
}

// ─────────────────────────── Interés de mora ────────────────────────────

export interface CargoInteresGenerado {
  readonly cargoCapitalOrigenId: string
  readonly monto: Money
  readonly diasMora: number
  readonly topeAplicado: boolean
}

/**
 * REQ-MORA-003 (D-23) — day-count configurable. `mensual_30_dias_reales` es
 * el comportamiento histórico del motor (tasaMensual/30 × días calendario
 * reales): no tiene nombre ISO estándar, pero es de uso común en Colombia.
 * `actual_365`/`actual_360`/`treinta_360` son las convenciones de Docs/16 §56.
 */
export type ConvencionDayCount = 'mensual_30_dias_reales' | 'actual_365' | 'actual_360' | 'treinta_360'

/**
 * REQ-NOVEDAD-003 (D-23) — orden configurable entre un DISCOUNT y el
 * interés de mora del mismo período. `interes_sobre_capital_completo` es
 * el comportamiento histórico (el interés siempre ignoró los descuentos).
 */
export type OrdenDescuentoInteres = 'interes_sobre_capital_completo' | 'descuento_antes_interes'

/** cargos.novedad_id → novedades.tipo (AD-30) — null si el cargo no viene de una novedad. */
export type NovedadTipo = 'CHARGE' | 'DISCOUNT' | 'ADJUSTMENT' | 'REFUND' | 'CREDIT' | 'DEBIT'

/** politicas_financieras.interes_* vigente (PLAN §6.6). */
export interface PoliticaMora {
  readonly tasaMensual: string | null
  readonly topeMensual: string | null
  readonly diasGracia: number
  readonly dayCount: ConvencionDayCount
  readonly descuentoOrden: OrdenDescuentoInteres
  /** H3/H4 (auditoría externa 2026-08-26): solo importa cuando descuentoOrden
   * ==='descuento_antes_interes'. false (default) = solo DISCOUNT compensa
   * mora (comportamiento histórico). true = CREDIT/REFUND también, mismo
   * tratamiento que DISCOUNT — los tres son dinero a favor real (AD-30). */
  readonly compensaCreditos: boolean
}

function timestampUtc(fechaIso: string): number {
  const partes = fechaIso.split('-').map(Number)
  const [anio, mes, dia] = partes
  if (partes.length !== 3 || anio === undefined || mes === undefined || dia === undefined) {
    throw new Error(`Fecha ISO inválida: "${fechaIso}" — se espera YYYY-MM-DD`)
  }
  return Date.UTC(anio, mes - 1, dia)
}

/**
 * Días calendario reales entre dos fechas ISO (YYYY-MM-DD), UTC — sin husos
 * horarios. Exportada: cartera.ts la reutiliza para antigüedad (CAR §7.1),
 * que es aritmética de calendario simple, distinta del day-count de mora.
 */
export function diasCalendario(desde: string, hasta: string): number {
  const msPorDia = 24 * 60 * 60 * 1000
  return Math.round((timestampUtc(hasta) - timestampUtc(desde)) / msPorDia)
}

/** Fecha ISO (YYYY-MM-DD) que resulta de sumar `dias` días calendario a `fechaIso`, UTC. */
function sumarDiasCalendario(fechaIso: string, dias: number): string {
  const msPorDia = 24 * 60 * 60 * 1000
  const fecha = new Date(timestampUtc(fechaIso) + dias * msPorDia)
  const anio = fecha.getUTCFullYear()
  const mes = fecha.getUTCMonth() + 1
  const dia = fecha.getUTCDate()
  return `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

/** 30/360 (Bond Basis / US NASD, Docs/16 §56) — cada mes cuenta como 30 días. */
function diasTreintaTrescientosSesenta(desde: string, hasta: string): number {
  const p1 = desde.split('-').map(Number)
  const p2 = hasta.split('-').map(Number)
  const [anio1, mes1, dia1] = p1
  const [anio2, mes2, dia2] = p2
  if (
    p1.length !== 3 ||
    p2.length !== 3 ||
    anio1 === undefined ||
    mes1 === undefined ||
    dia1 === undefined ||
    anio2 === undefined ||
    mes2 === undefined ||
    dia2 === undefined
  ) {
    throw new Error(`Fecha ISO inválida en diasTreintaTrescientosSesenta: "${desde}"/"${hasta}"`)
  }
  const d1 = dia1 === 31 ? 30 : dia1
  const d2 = dia2 === 31 && d1 === 30 ? 30 : dia2
  return (anio2 - anio1) * 360 + (mes2 - mes1) * 30 + (d2 - d1)
}

function diasVencido(convencion: ConvencionDayCount, desde: string, hasta: string): number {
  return convencion === 'treinta_360'
    ? diasTreintaTrescientosSesenta(desde, hasta)
    : diasCalendario(desde, hasta)
}

/** Tasa diaria a partir de la tasa mensual efectiva, según la convención (Docs/16 §56). */
function tasaDiariaPor(convencion: ConvencionDayCount, tasaMensualEfectiva: string) {
  switch (convencion) {
    case 'mensual_30_dias_reales':
    case 'treinta_360':
      return fos.dividirDecimales(tasaMensualEfectiva, 30)
    case 'actual_365':
      return fos.dividirDecimales(fos.multiplicarDecimales(tasaMensualEfectiva, 12), 365)
    case 'actual_360':
      return fos.dividirDecimales(fos.multiplicarDecimales(tasaMensualEfectiva, 12), 360)
  }
}

/**
 * H3/H4 (auditoría externa 2026-08-26): pool de crédito acumulado del
 * inmueble (DISCOUNT siempre; CREDIT/REFUND si `compensaCreditos`),
 * consumido cronológicamente contra los capitales en mora — el más antiguo
 * primero, mismo criterio que la estrategia de imputación
 * `deuda_mas_antigua`. Un crédito de un periodo puede compensar la mora de
 * un periodo posterior — antes de esta fase el mecanismo solo miraba el
 * mismo periodo del capital.
 *
 * Devuelve la base YA ajustada (piso cero) por cargoId de capital — solo
 * para los que el pool alcanzó a tocar. calcularInteresMora usa
 * `montoPendiente` sin cambios para cualquier capital ausente del mapa.
 */
function calcularBasesConPool(
  cargos: readonly CargoAbierto[],
  compensaCreditos: boolean,
): ReadonlyMap<string, Money> {
  const tiposIncluidos: ReadonlySet<NovedadTipo> = compensaCreditos
    ? new Set<NovedadTipo>(['DISCOUNT', 'CREDIT', 'REFUND'])
    : new Set<NovedadTipo>(['DISCOUNT'])

  const creditos = cargos.filter(
    (c) => c.categoria === 'otro' && c.novedadTipo !== null && tiposIncluidos.has(c.novedadTipo),
  )
  const capitalesOrdenados = cargos
    .filter((c) => c.categoria === 'capital' && !isZeroMoney(c.montoPendiente) && !isNegativeMoney(c.montoPendiente))
    .slice()
    .sort((a, b) => (a.periodoClave < b.periodoClave ? -1 : a.periodoClave > b.periodoClave ? 1 : 0))
  const [primerCapital] = capitalesOrdenados
  if (creditos.length === 0 || primerCapital === undefined) return new Map()

  const moneda = primerCapital.montoPendiente.currency
  // Negativo (o cero) — suma de todo el crédito disponible del inmueble (AD-30).
  let poolRestante = creditos.reduce((acc, c) => fos.sumar(acc, c.montoPendiente), fos.money(0, moneda))

  const bases = new Map<string, Money>()
  for (const capital of capitalesOrdenados) {
    if (isZeroMoney(poolRestante)) break
    const reducida = fos.sumar(capital.montoPendiente, poolRestante)
    if (isNegativeMoney(reducida)) {
      // El pool cubre todo este capital (piso cero) y lo que sobra pasa al siguiente.
      bases.set(capital.id, fos.restar(capital.montoPendiente, capital.montoPendiente))
      poolRestante = reducida
    } else {
      // El pool se agota en este capital (o justo alcanza).
      bases.set(capital.id, reducida)
      poolRestante = fos.money(0, moneda)
    }
  }
  return bases
}

/**
 * CAR §13.3 (GAP-CAR-004, PH-C11) — tramo de tasa vigente en [desde,hasta]
 * (ambas ISO YYYY-MM-DD, inclusive) dentro de una mora que cruza un cambio
 * de tasa certificada. `tasaMensual` como string decimal, igual que
 * PoliticaMora — nunca number para no perder precisión (Docs/19 §96).
 */
export interface SegmentoTasa {
  readonly desde: string
  readonly hasta: string
  readonly tasaMensual: string
  readonly fuenteResolucion: string
}

function validarSegmentosOrdenados(segmentos: readonly SegmentoTasa[]): readonly SegmentoTasa[] {
  const ordenados = [...segmentos].sort((a, b) => (a.desde < b.desde ? -1 : a.desde > b.desde ? 1 : 0))
  for (let i = 1; i < ordenados.length; i++) {
    const anterior = ordenados[i - 1]
    const actual = ordenados[i]
    if (anterior === undefined || actual === undefined) continue
    if (anterior.hasta > actual.desde) {
      throw new SegmentosTasaSolapadosError(anterior.fuenteResolucion, actual.fuenteResolucion)
    }
  }
  return ordenados
}

const maxFecha = (a: string, b: string): string => (a > b ? a : b)
const minFecha = (a: string, b: string): string => (a < b ? a : b)

/**
 * Generaliza el cálculo de un único cargo a N tramos de tasa. Con
 * exactamente 1 segmento que cubre [fechaInicioAcumulacion, fechaReferencia]
 * reproduce EXACTAMENTE el mismo monto que el camino sin segmentar (mismo
 * redondeo único al final, no por segmento) — así es como se verifica la
 * retrocompatibilidad, no solo se declara.
 */
function calcularInteresSegmentado(
  base: Money,
  fechaVencimiento: string,
  fechaReferencia: string,
  diasGracia: number,
  topeMensual: string,
  dayCount: ConvencionDayCount,
  segmentosOrdenados: readonly SegmentoTasa[],
): { readonly monto: Money; readonly diasMora: number; readonly topeAplicado: boolean } | null {
  const fechaInicioAcumulacion = sumarDiasCalendario(fechaVencimiento, diasGracia)
  if (fechaInicioAcumulacion >= fechaReferencia) return null

  let montoTotal: Money | null = null
  let diasMoraTotal = 0
  let topeAplicado = false

  for (const segmento of segmentosOrdenados) {
    const ventanaDesde = maxFecha(segmento.desde, fechaInicioAcumulacion)
    const ventanaHasta = minFecha(segmento.hasta, fechaReferencia)
    if (ventanaDesde >= ventanaHasta) continue

    const dias = diasVencido(dayCount, ventanaDesde, ventanaHasta)
    if (dias <= 0) continue

    const topeAplicaSegmento = fos.compararDecimales(segmento.tasaMensual, topeMensual) > 0
    if (topeAplicaSegmento) topeAplicado = true
    const tasaEfectiva = topeAplicaSegmento ? topeMensual : segmento.tasaMensual
    const tasaDiaria = tasaDiariaPor(dayCount, tasaEfectiva)

    const factor = fos.multiplicarDecimales(tasaDiaria, dias)
    const montoSegmento = fos.multiplicar(base, factor)
    montoTotal = montoTotal === null ? montoSegmento : fos.sumar(montoTotal, montoSegmento)
    diasMoraTotal += dias
  }

  if (montoTotal === null) return null
  return { monto: montoTotal, diasMora: diasMoraTotal, topeAplicado }
}

/**
 * PLAN §6.6: base = saldo vencido de CAPITAL (nunca compone sobre interés ya
 * generado — por eso solo genera intereses sobre cargos categoria='capital'),
 * devengo diario desde el día siguiente al vencimiento, gracia parametrizable,
 * tasa/tope/day-count/orden-de-descuento de la política vigente (D-23).
 *
 * Recibe TODOS los cargos abiertos del inmueble (no solo capital): necesita
 * ver los cargos categoria='otro' de tipo DISCOUNT para poder aplicar
 * `descuentoOrden`. Un cargo sin `novedadTipo` (capital/interés) nunca
 * participa en el cómputo de descuentos, solo en el de capital.
 *
 * `segmentos` (CAR §13.3, GAP-CAR-004, PH-C11) — opcional y retrocompatible:
 * sin él (o con arreglo vacío), corre exactamente el camino de tasa escalar
 * de siempre, sin ninguna diferencia de código ejecutado. Con segmentos,
 * cada cargo de capital reparte su interés entre los tramos de tasa que
 * intersectan su ventana de mora. treinta_360 no tiene una noción lineal de
 * fecha calendario y se rechaza explícitamente en vez de aproximar
 * (SegmentacionDayCountNoSoportadoError).
 */
export function calcularInteresMora(
  cargosAbiertos: readonly CargoAbierto[],
  fechaReferencia: string,
  politica: PoliticaMora,
  redondeo: RoundingPolicy,
  segmentos?: readonly SegmentoTasa[],
): readonly CargoInteresGenerado[] {
  if (politica.tasaMensual === null || politica.topeMensual === null) {
    throw new PoliticaMoraNoConfiguradaError()
  }
  const tasaMensual = politica.tasaMensual
  const topeMensual = politica.topeMensual
  const topeAplica = fos.compararDecimales(tasaMensual, topeMensual) > 0
  const tasaEfectiva = topeAplica ? topeMensual : tasaMensual
  const tasaDiaria = tasaDiariaPor(politica.dayCount, tasaEfectiva)

  const usaSegmentos = segmentos !== undefined && segmentos.length > 0
  if (usaSegmentos && politica.dayCount === 'treinta_360') {
    throw new SegmentacionDayCountNoSoportadoError(politica.dayCount)
  }
  const segmentosOrdenados = usaSegmentos ? validarSegmentosOrdenados(segmentos) : null

  const basesConPool =
    politica.descuentoOrden === 'descuento_antes_interes'
      ? calcularBasesConPool(cargosAbiertos, politica.compensaCreditos)
      : null

  const generados: CargoInteresGenerado[] = []
  for (const cargo of cargosAbiertos) {
    if (cargo.categoria !== 'capital') continue
    if (isZeroMoney(cargo.montoPendiente) || isNegativeMoney(cargo.montoPendiente)) continue

    // calcularBasesConPool ya aplicó el piso cero — un capital ausente del
    // mapa no fue tocado por el pool, usa su montoPendiente completo.
    const base = basesConPool?.get(cargo.id) ?? cargo.montoPendiente
    if (isZeroMoney(base)) continue

    if (segmentosOrdenados !== null) {
      const resultado = calcularInteresSegmentado(
        base,
        cargo.fechaVencimiento,
        fechaReferencia,
        politica.diasGracia,
        topeMensual,
        politica.dayCount,
        segmentosOrdenados,
      )
      if (resultado === null) continue
      const monto = fos.redondear(resultado.monto, redondeo)
      if (isZeroMoney(monto)) continue
      generados.push({
        cargoCapitalOrigenId: cargo.id,
        monto,
        diasMora: resultado.diasMora,
        topeAplicado: resultado.topeAplicado,
      })
      continue
    }

    const diasMoraCalendario = diasVencido(politica.dayCount, cargo.fechaVencimiento, fechaReferencia)
    const diasMora = Math.max(0, diasMoraCalendario - politica.diasGracia)
    if (diasMora === 0) continue

    const factor = fos.multiplicarDecimales(tasaDiaria, diasMora)
    const monto = fos.redondear(fos.multiplicar(base, factor), redondeo)
    if (isZeroMoney(monto)) continue

    generados.push({ cargoCapitalOrigenId: cargo.id, monto, diasMora, topeAplicado: topeAplica })
  }

  return generados
}
