/**
 * Errores de evaluación en tiempo de ejecución.
 * 0AEL §23: typed, classified, actionable, traceable.
 */

/**
 * Docs/17 §37 SNAPSHOT INCOMPLETE: el proveedor de contexto no pudo resolver
 * un Contract. Los proveedores de ExecutionContext deben lanzar este error
 * (no devolver `undefined` ni un valor inventado) cuando el dato no existe.
 */
export class ContractoNoResueltoError extends Error {
  constructor(
    readonly contrato: string,
    readonly campo: string,
  ) {
    super(`No se pudo resolver ${contrato}.${campo} en este contexto de ejecución (17 §37)`)
    this.name = 'ContractoNoResueltoError'
  }
}

/**
 * Un Regla evaluado debió haber pasado por `analizar()` sin diagnósticos de
 * error antes de llegar aquí. Si esta excepción se lanza, o bien se saltó
 * ese paso, o bien el ExecutionContext devolvió un valor que no coincide con
 * el catálogo estático — en ambos casos es un invariante violado, no una
 * condición de negocio (0AEL §20 detect → report → block).
 */
export class InvarianteEvaluadorError extends Error {
  constructor(mensaje: string) {
    super(`Invariante violado en el evaluador AEL: ${mensaje}`)
    this.name = 'InvarianteEvaluadorError'
  }
}
