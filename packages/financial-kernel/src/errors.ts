/**
 * Errores tipados del kernel financiero.
 * 0AEL §23: los errores deben ser typed, classified, actionable, traceable.
 */

export interface ContextoAsignacion {
  readonly sourceConceptId?: string
  readonly targetId?: string
  readonly policyId?: string
  readonly executionId?: string
}

export class InvalidCurrencyError extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'InvalidCurrencyError'
  }
}

export class InvalidMoneyAmountError extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'InvalidMoneyAmountError'
  }
}

/** Docs/16 §41 CURRENCY CONSISTENCY. */
export class CurrencyMismatchError extends Error {
  constructor(
    readonly currencyA: string,
    readonly currencyB: string,
  ) {
    super(
      `No se puede operar entre monedas distintas sin conversión explícita ` +
        `(16 §41): ${currencyA} vs ${currencyB}`,
    )
    this.name = 'CurrencyMismatchError'
  }
}

/**
 * Docs/19 §19 NO EPSILON / precisión decimal: un resultado no finito
 * (p.ej. división por cero) indica una operación inválida y nunca debe
 * propagarse en silencio (0AEL §20 detect → report → block).
 */
export class NonFiniteDecimalError extends Error {
  constructor(operacion: string) {
    super(`La operación "${operacion}" produjo un resultado no finito (¿división por cero?)`)
    this.name = 'NonFiniteDecimalError'
  }
}

/** Docs/19 §12-13 BASIS VALIDATION / EMPTY TARGETS. */
export class EmptyTargetsError extends Error {
  constructor() {
    super('No se puede distribuir sobre una lista vacía de targets (19 §13)')
    this.name = 'EmptyTargetsError'
  }
}

/** Docs/19 §14 NEGATIVE BASIS. */
export class NegativeBasisError extends Error {
  constructor(readonly targetId: string) {
    super(`La base de asignación del target "${targetId}" es negativa (19 §14)`)
    this.name = 'NegativeBasisError'
  }
}

/** Docs/19 §17 ZERO TOTAL BASIS. */
export class ZeroTotalBasisError extends Error {
  constructor() {
    super('La suma de las bases de asignación es cero (19 §17)')
    this.name = 'ZeroTotalBasisError'
  }
}

/** Docs/19 §43-44 TARGET DUPLICATES / DUPLICATE TARGET ERROR. */
export class DuplicateTargetError extends Error {
  constructor(readonly targetId: string) {
    super(`El target "${targetId}" está duplicado en la solicitud de asignación (19 §43-44)`)
    this.name = 'DuplicateTargetError'
  }
}

/**
 * Invariante interno violado: el residual no es un múltiplo entero de la
 * unidad mínima. Dado el método de mayor resto (PLAN §6.2), esto no debería
 * ocurrir nunca a través de `allocate()` con entradas válidas — indica un
 * error del motor, no una condición de negocio.
 */
export class NonIntegerResidualError extends Error {
  constructor(residual: string, escala: number) {
    super(
      `Invariante violado: el residual (${residual}) no es múltiplo entero de la ` +
        `unidad mínima en escala ${String(escala)} — error interno del motor de asignación (19 §26)`,
    )
    this.name = 'NonIntegerResidualError'
  }
}

/**
 * Docs/19 §92-98 RECONCILIATION POLICY / NO EPSILON / DIAGNOSTICS.
 * `detect → report → block` (0AEL §20): nunca se ajusta el resultado.
 */
export class ReconciliationFailedError extends Error {
  constructor(
    readonly source: string,
    readonly allocated: string,
    readonly residual: string,
    readonly contexto: ContextoAsignacion = {},
  ) {
    super(
      `AEL_ALLOCATION_RECONCILIATION_FAILED: source=${source} allocated=${allocated} ` +
        `residual=${residual} (19 §98)`,
    )
    this.name = 'ReconciliationFailedError'
  }
}
