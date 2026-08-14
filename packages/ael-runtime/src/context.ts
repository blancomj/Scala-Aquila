/**
 * ExecutionContext — Docs/06 §428 (Contract Provider), 01 §22-23 Contracts.
 *
 * El evaluador nunca sabe CÓMO se resuelve `PARAMETER.X` / `UNIT.X` /
 * `CONCEPTO.X`: solo le pide el valor al contexto. Cómo se materializan los
 * derivados de snapshot (GAP-20, Docs/17 §22) o el resultado de otro
 * Concepto (GAP-19, orquestación de F5) es responsabilidad de quien
 * implemente esta interfaz, no del evaluador.
 */
import type { CatalogoContratos } from '@aquila/ael-language'
import type { ModoRedondeo } from '@aquila/financial-kernel'
import type { TypedValue } from './typed-value.js'

export interface ExecutionContext {
  /** Mismo catálogo usado por el Analyzer — el evaluador lo usa para
   * verificar que el proveedor cumple el tipo estático que prometió
   * (frontera de confianza: el proveedor es código externo al AST ya
   * verificado). */
  readonly catalogo: CatalogoContratos
  /** 16 §44 ROUNDING: "debe ser una política explícita" — la escala la da
   * el argumento de REDONDEAR_DINERO, el modo lo da el contexto (versionable
   * por tenant, 16 §156 ROUNDING POLICY). */
  readonly modoRedondeoDinero: ModoRedondeo
  resolverContract(contrato: string, campo: string): TypedValue
}
