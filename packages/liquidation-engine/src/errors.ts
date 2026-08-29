/**
 * Errores de orquestación. 0AEL §23: typed, classified, actionable, traceable.
 */
import type { Diagnostico } from '@aquila/ael-core'

/** Docs/18 §13-15 CYCLE / CYCLE ERROR / CYCLE DIAGNOSTICS. */
export class DependenciaCiclicaError extends Error {
  constructor(readonly ciclo: readonly string[]) {
    super(`Ciclo de dependencias entre conceptos: ${ciclo.join(' → ')} (18 §13-15)`)
    this.name = 'DependenciaCiclicaError'
  }
}

/** Docs/18 §11 UNKNOWN DEPENDENCY. */
export class DependenciaDesconocidaError extends Error {
  constructor(
    readonly conceptoOrigen: string,
    readonly conceptoReferenciado: string,
  ) {
    super(
      `El concepto "${conceptoOrigen}" referencia CONCEPTO.${conceptoReferenciado}, ` +
        `que no existe en el snapshot (18 §11)`,
    )
    this.name = 'DependenciaDesconocidaError'
  }
}

/** El Analyzer de ael-language rechazó la fórmula de un concepto antes de poder evaluarla. */
export class ConceptoNoAnalizaLimpioError extends Error {
  constructor(
    readonly conceptoCodigo: string,
    readonly diagnosticos: readonly Diagnostico[],
  ) {
    super(
      `El concepto "${conceptoCodigo}" no analiza limpio: ` +
        diagnosticos.map((d) => `${d.codigo}: ${d.mensaje}`).join('; '),
    )
    this.name = 'ConceptoNoAnalizaLimpioError'
  }
}

/** El evaluador de ael-runtime falló al ejecutar la fórmula de un concepto. */
export class EvaluacionConceptoFallidaError extends Error {
  constructor(
    readonly conceptoCodigo: string,
    readonly diagnosticos: readonly Diagnostico[],
  ) {
    super(
      `El concepto "${conceptoCodigo}" falló al evaluar: ` +
        diagnosticos.map((d) => `${d.codigo}: ${d.mensaje}`).join('; '),
    )
    this.name = 'EvaluacionConceptoFallidaError'
  }
}

/**
 * Docs/16 §79 (PLAN §6.4 R1-R8): una reconciliación obligatoria falló.
 * 0AEL §20 detect → report → block — nunca se ajusta el resultado para que cuadre.
 */
export class ReconciliacionLiquidacionFallidaError extends Error {
  constructor(
    readonly invariante: string,
    readonly detalle: string,
  ) {
    super(`${invariante}: ${detalle} (PLAN §6.4)`)
    this.name = 'ReconciliacionLiquidacionFallidaError'
  }
}

/** PLAN §6.3: imputacion_orden debe ser una permutación exacta de interes/capital/otro. */
export class OrdenImputacionInvalidoError extends Error {
  constructor(readonly ordenRecibido: readonly string[]) {
    super(
      `imputacion_orden debe ser una permutación exacta de interes/capital/otro, recibido: ` +
        `[${ordenRecibido.join(', ')}] (PLAN §6.3)`,
    )
    this.name = 'OrdenImputacionInvalidoError'
  }
}

/** AD-36: imputacion_estrategia debe ser deuda_mas_antigua o periodo_actual. */
export class EstrategiaImputacionInvalidaError extends Error {
  constructor(readonly estrategiaRecibida: string) {
    super(
      `imputacion_estrategia debe ser "deuda_mas_antigua" o "periodo_actual", recibido: ` +
        `"${estrategiaRecibida}" (AD-36)`,
    )
    this.name = 'EstrategiaImputacionInvalidaError'
  }
}

/** Imputación manual (RegistrarPagoForm "aplicar a cargos específicos", art. 1653 C.C.):
 * un cargo elegido no está abierto en este inmueble, aparece repetido, su monto excede su
 * pendiente, o la suma excede el monto del pago. */
export class ImputacionManualInvalidaError extends Error {
  constructor(readonly detalle: string) {
    super(`Imputación manual inválida: ${detalle}`)
    this.name = 'ImputacionManualInvalidaError'
  }
}

/** PLAN §6.6: la política vigente no tiene interés de mora configurado. */
export class PoliticaMoraNoConfiguradaError extends Error {
  constructor() {
    super(
      'La política vigente no tiene interes_tasa_mensual/interes_tope_mensual configurados (PLAN §6.6)',
    )
    this.name = 'PoliticaMoraNoConfiguradaError'
  }
}

/**
 * CAR §13.3 (GAP-CAR-004, PH-C11) — treinta_360 no es una convención de
 * calendario real: sus "días" no se corresponden linealmente con fechas
 * calendario, así que no hay una forma correcta de recortar un segmento de
 * tasa a una ventana [desde,hasta) bajo esa convención sin inventar una
 * regla. Se rechaza en vez de aproximar.
 */
export class SegmentacionDayCountNoSoportadoError extends Error {
  constructor(readonly dayCount: string) {
    super(
      `calcularInteresMora con segmentos de tasa no soporta la convención "${dayCount}" ` +
        `— solo day-counts de calendario real (mensual_30_dias_reales/actual_365/actual_360). ` +
        `(CAR §13.3)`,
    )
    this.name = 'SegmentacionDayCountNoSoportadoError'
  }
}

/** CAR §13.3 — dos segmentos de tasa que se solapan cobrarían interés dos veces sobre los mismos días. */
export class SegmentosTasaSolapadosError extends Error {
  constructor(
    readonly segmentoA: string,
    readonly segmentoB: string,
  ) {
    super(`Los segmentos de tasa "${segmentoA}" y "${segmentoB}" se solapan (CAR §13.3)`)
    this.name = 'SegmentosTasaSolapadosError'
  }
}

/**
 * CAR §8.3 IC-TRAMO-01..05 — una política de clasificación de cartera con
 * tramos que no cubren [0,∞) sin huecos/solapes, o con códigos duplicados,
 * no puede activarse. Se lanza antes de permitir estado='vigente'.
 */
export class PoliticaClasificacionInvalidaError extends Error {
  constructor(readonly errores: readonly string[]) {
    super(`Política de clasificación de cartera inválida: ${errores.join('; ')} (CAR §8.3)`)
    this.name = 'PoliticaClasificacionInvalidaError'
  }
}

/**
 * CAR §8.6 — ningún tramo de la política cubre los días de mora dados.
 * Nunca hay un default implícito: una política incompleta debe fallar
 * ruidosamente, no clasificar como "al día" en silencio.
 */
export class TramoClasificacionNoEncontradoError extends Error {
  constructor(
    readonly diasMora: number,
    readonly politicaId: string,
    readonly politicaVersion: number,
  ) {
    super(
      `Ningún tramo de la política de clasificación ${politicaId} v${String(politicaVersion)} ` +
        `cubre ${String(diasMora)} días de mora — la política está incompleta (CAR §8.3 IC-TRAMO-01)`,
    )
    this.name = 'TramoClasificacionNoEncontradoError'
  }
}

/** Conceptos avanzados Fase 1 — un concepto modo_valor='fijo' sin valor_fijo
 * viola el CHECK de la base de datos; solo alcanzable si el snapshot se
 * construyó a mano (test) sin respetar el contrato. */
export class ConceptoFijoSinValorError extends Error {
  constructor(readonly conceptoCodigo: string) {
    super(
      `El concepto "${conceptoCodigo}" es modo_valor='fijo' pero no tiene valorFijo — snapshot inconsistente.`,
    )
    this.name = 'ConceptoFijoSinValorError'
  }
}

/** Conceptos avanzados Fase 2 — un concepto recurrente/unico/por_periodo sin
 * las fechas que su tipo exige viola el CHECK de la base de datos; solo
 * alcanzable si el snapshot se construyó a mano (test) sin respetar el
 * contrato de conceptoAplicaEnPeriodo() (temporal.ts). */
export class ConceptoRecurrenciaSinFechaError extends Error {
  constructor(
    readonly conceptoCodigo: string,
    readonly tipoRecurrencia: string,
  ) {
    super(
      `El concepto "${conceptoCodigo}" es tipo_recurrencia='${tipoRecurrencia}' pero le faltan las fechas que ese tipo exige — snapshot inconsistente.`,
    )
    this.name = 'ConceptoRecurrenciaSinFechaError'
  }
}

/**
 * GAP-CAR-001 (CAR §4.4) — ni el cargo ni su periodo tienen fecha de
 * vencimiento. Nunca se infiere un vencimiento por defecto: un vencimiento
 * inventado produce una mora inventada, que produce un interés inventado
 * cobrado a una persona real.
 */
export class PeriodoSinFechaVencimientoError extends Error {
  constructor(
    readonly cargoId: string,
    readonly periodoId: string,
  ) {
    super(
      `El cargo ${cargoId} no tiene fecha de vencimiento determinable: ni cargos.fecha_vencimiento ` +
        `(override) ni periodos.fecha_vencimiento del periodo ${periodoId} están configurados ` +
        `(CAR §4.4 GAP-CAR-001)`,
    )
    this.name = 'PeriodoSinFechaVencimientoError'
  }
}

/**
 * GAP-CAR-008 (CAR §12.4) — la cuota de acuerdo elegida para conciliar ya
 * está cerrada (pagada/incumplida/cancelada). Conciliar contra una cuota
 * cerrada resucitaría un estado que ya se decidió como definitivo.
 */
export class CuotaAcuerdoNoConciliableError extends Error {
  constructor(readonly estadoActual: string) {
    super(
      `La cuota de acuerdo está en estado '${estadoActual}' y no admite conciliación — solo se ` +
        `puede conciliar contra 'pendiente', 'parcial' o 'vencida' (CAR §12.4 GAP-CAR-008)`,
    )
    this.name = 'CuotaAcuerdoNoConciliableError'
  }
}
