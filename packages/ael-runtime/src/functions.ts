/**
 * Catálogo de funciones AEL v0 — Docs/01 §21: alcance reducido, solo lo que
 * las tres reglas piloto usan (paso0/INFORME_PASO_0.md §1). Debe mantenerse
 * en sincronía con el catálogo estático de `ael-language/src/analyzer.ts`.
 *
 * Toda aritmética delega en @aquila/financial-kernel (PLAN §3, 19 §96) —
 * este módulo nunca instancia Decimal directamente (vigilado por
 * eslint.config.js).
 */
import {
  compararDecimales,
  dividirDecimales,
  multiplicar,
  redondear,
  type ModoRedondeo,
} from '@aquila/financial-kernel'
import { InvarianteEvaluadorError } from './errors.js'
import { dinero, numero, type TypedValue } from './typed-value.js'

function arg(argumentos: readonly TypedValue[], i: number): TypedValue {
  const v = argumentos[i]
  if (v === undefined) {
    throw new InvarianteEvaluadorError(
      `falta el argumento ${String(i + 1)} — la aridad debió validarse en el Analyzer`,
    )
  }
  return v
}

type ImplementacionFuncion = (
  argumentos: readonly TypedValue[],
  modoRedondeoDinero: ModoRedondeo,
) => TypedValue

/** 01 §21: MIN/MAX/PORCENTAJE/REDONDEAR_DINERO — el catálogo reducido de F4. */
export const FUNCIONES: Readonly<Record<string, ImplementacionFuncion>> = {
  MIN: (argumentos) => {
    const a = numero(arg(argumentos, 0))
    const b = numero(arg(argumentos, 1))
    return compararDecimales(a.valor, b.valor) <= 0 ? a : b
  },

  MAX: (argumentos) => {
    const a = numero(arg(argumentos, 0))
    const b = numero(arg(argumentos, 1))
    return compararDecimales(a.valor, b.valor) >= 0 ? a : b
  },

  // 02 §"PORCENTAJE(total, 10) -> MONEY": el segundo argumento es un
  // porcentaje (10 = 10%), no una fracción — se divide entre 100.
  PORCENTAJE: (argumentos) => {
    const m = dinero(arg(argumentos, 0))
    const pct = numero(arg(argumentos, 1))
    const factor = dividirDecimales(pct.valor, 100)
    return { tipo: 'MONEY', valor: multiplicar(m.valor, factor) }
  },

  // 07 §"FUNCTION EXAMPLE": REDONDEAR_DINERO(Money<C>, Number) -> Money.
  // El modo de redondeo (HALF_UP/…) es política del tenant (16 §44), no un
  // argumento de la llamada — lo aporta el ExecutionContext.
  REDONDEAR_DINERO: (argumentos, modoRedondeoDinero) => {
    const m = dinero(arg(argumentos, 0))
    const escala = numero(arg(argumentos, 1))
    // Frontera controlada Decimal→number, igual que
    // financial-operation-service.ts#contarUnidadesResiduales: la escala es,
    // por contrato de la función, un entero pequeño.
    return {
      tipo: 'MONEY',
      valor: redondear(m.valor, { modo: modoRedondeoDinero, escala: escala.valor.toNumber() }),
    }
  },
}
