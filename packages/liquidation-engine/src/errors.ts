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

/** PLAN §6.6: la política vigente no tiene interés de mora configurado. */
export class PoliticaMoraNoConfiguradaError extends Error {
  constructor() {
    super(
      'La política vigente no tiene interes_tasa_mensual/interes_tope_mensual configurados (PLAN §6.6)',
    )
    this.name = 'PoliticaMoraNoConfiguradaError'
  }
}
