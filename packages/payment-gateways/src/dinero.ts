/**
 * La ÚNICA frontera entero-centavos ⇄ Money de todo el módulo de pasarelas
 * (§4.1 del prompt de fase 2): "la conversión entero-del-proveedor → Money
 * ocurre en UN SOLO punto, en el adaptador, usando money() de
 * @aquila/financial-kernel. De ahí en adelante todo es Money. Nunca un
 * number."
 *
 * Wompi (y el resto de proveedores) hablan en centavos enteros sobre el
 * wire; AQUILA habla en pesos con 2 decimales (pagos.monto numeric(18,2)).
 * Dividir/multiplicar por 100 con aritmética `number` nativa es precisión de
 * punto flotante — prohibido en cualquier ruta monetaria (PLAN §9.2). Por
 * eso pasa por dividir()/multiplicar() de financial-kernel, nunca por `/`
 * o `*` a pelo.
 */
import { dividir, multiplicar, money, type Money } from '@aquila/financial-kernel'

/** Centavos enteros del proveedor → Money en pesos. */
export function moneyDesdeCentavos(centavos: number, moneda: string): Money {
  if (!Number.isInteger(centavos)) {
    throw new Error(
      `moneyDesdeCentavos: se esperaban centavos enteros, se recibió ${String(centavos)}.`,
    )
  }
  return dividir(money(centavos, moneda), 100)
}

/** Money en pesos → centavos enteros para el wire del proveedor. */
export function centavosDesdeMoney(valor: Money): number {
  const centavos = multiplicar(valor, 100)
  if (!centavos.amount.isInteger()) {
    throw new Error(
      `centavosDesdeMoney: ${valor.amount.toString()} ${valor.currency} no representa un número `
        + 'entero de centavos.',
    )
  }
  return centavos.amount.toNumber()
}
