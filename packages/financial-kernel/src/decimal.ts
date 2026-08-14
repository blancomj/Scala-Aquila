/**
 * Única puerta de entrada a decimal.js en todo el kernel financiero.
 *
 * `Decimal.clone()` en vez de mutar el constructor global: evita fugas de
 * configuración si otro paquete del monorepo también importa decimal.js.
 *
 * Precisión 34 dígitos significativos (≈ decimal128) para la "precisión
 * interna" que exige Docs/19 §20 EXACT ALLOCATION antes de redondear.
 *
 * Este módulo es INTERNO: no se exporta desde index.ts. Fuera de este
 * paquete, y dentro de él fuera de financial-operation-service.ts, nadie
 * debe importarlo directamente (Docs/19 §95-96 FINANCIAL OPERATION
 * SERVICE / NO DIRECT DECIMAL LIBRARY). Vigilado por eslint.config.js.
 */
import { Decimal as DecimalJs } from 'decimal.js'

export const Decimal = DecimalJs.clone({
  precision: 34,
  toExpNeg: -34,
  toExpPos: 34,
})

export type Decimal = InstanceType<typeof Decimal>

/** Cualquier forma en que puede llegar un valor decimal desde fuera. */
export type DecimalValue = string | number | Decimal
