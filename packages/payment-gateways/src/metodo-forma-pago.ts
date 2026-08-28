/**
 * Mapeo "método que reporta la pasarela" → `codigo` de la familia FORMA_PAGO
 * de `lista_tipos` (§3.5).
 *
 * Existe porque `pagos.forma_pago_id` es NOT NULL: sin este mapeo no se puede
 * insertar el pago. Y es `lista_tipos` y no un enum por el criterio que ya
 * dejó escrito 20260903100000_pagos_medio_recaudo.sql:
 *
 *   "Una copropiedad puede necesitar una forma de pago que hoy no imaginamos
 *    (datáfono, corresponsal bancario, billetera digital) y lista_tipos
 *    admite filas por tenant; un enum obligaría a una migración por cada una."
 *
 * Los 4 códigos que faltaban (tarjeta_credito, tarjeta_debito, nequi,
 * corresponsal_bancario) ya se sembraron como filas de plataforma en
 * 20260904100000, durante la fase 1.
 */
import type { MetodoPago } from './tipos.js'

/** Devuelve null si el proveedor reporta un método que no sabemos mapear —
 *  el llamador debe tratarlo como incidente y NO adivinar una forma de pago:
 *  elegir mal aquí desvía la contabilidad de caja a la cuenta equivocada. */
export function formaPagoDeMetodo(metodo: string): MetodoPago | null {
  const normalizado = metodo.trim().toLowerCase()
  return MAPA[normalizado] ?? null
}

/** Las claves son lo que reportan los proveedores; los valores, códigos
 *  reales de FORMA_PAGO. Se agrupan por método interno para que se vea de un
 *  golpe qué alias caen en cada uno.
 *
 *  TODO(fase 2, al integrar cada proveedor): confirmar los identificadores
 *  exactos contra la documentación oficial vigente. Los de Wompi se validan
 *  contra su sandbox; PayU/ePayco/Bold cuando les toque su fase. */
const MAPA: Record<string, MetodoPago> = {
  // PSE — el rey del ticket medio-alto en PH.
  pse: 'pse',
  bank_transfer: 'pse',
  // Tarjetas. Wompi reporta CARD sin distinguir crédito/débito en el tipo de
  // método; la distinción real llega en el detalle de la transacción, así que
  // el default es crédito y el llamador puede refinarlo si el proveedor lo
  // informa.
  card: 'tarjeta_credito',
  tarjeta: 'tarjeta_credito',
  credit_card: 'tarjeta_credito',
  tarjeta_credito: 'tarjeta_credito',
  debit_card: 'tarjeta_debito',
  tarjeta_debito: 'tarjeta_debito',
  // Billeteras.
  nequi: 'nequi',
  // Efectivo en corresponsal (Efecty, Baloto, Su Red).
  efecty: 'corresponsal_bancario',
  baloto: 'corresponsal_bancario',
  su_red: 'corresponsal_bancario',
  cash: 'corresponsal_bancario',
  efectivo: 'corresponsal_bancario',
  corresponsal_bancario: 'corresponsal_bancario',
  // Transferencia directa (Bancolombia u otra, según proveedor).
  bancolombia_transfer: 'transferencia_bancaria',
  transferencia_bancaria: 'transferencia_bancaria',
}
