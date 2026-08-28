/** Códigos de error de la capa de pasarelas. Espejo de las entradas
 *  PASARELA_* de packages/shared/src/error-codes.ts — el registro central es
 *  el que hace cumplir tests/governance/error-codes-coverage.test.ts. */
export type CodigoErrorPasarela =
  | 'NO_IMPLEMENTADO'
  | 'PASARELA_CREDENCIAL_INVALIDA'
  | 'PASARELA_PROVEEDOR_NO_IMPLEMENTADO'
  | 'PASARELA_TRANSACCION_NO_ENCONTRADA'
  | 'PASARELA_RESPUESTA_INVALIDA'

export class ErrorPasarela extends Error {
  constructor(
    readonly codigo: CodigoErrorPasarela,
    mensaje: string,
  ) {
    super(mensaje)
    this.name = 'ErrorPasarela'
  }
}
