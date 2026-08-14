/**
 * resultHash — Docs/20 §55-57 (RESULT HASH, CANONICAL SERIALIZATION, HASH
 * EXCLUSIONS). Cierra la puerta F5→F6 (PLAN §5.4): "mismo snapshot ⇒ mismo
 * resultHash". Serialización canónica: orden estable por (inmueble, concepto),
 * solo campos deterministas — nada de timestamps ni metadatos de ejecución.
 */
import { createHash } from 'node:crypto'
import type { LiquidationResult } from './result.js'

function serializarCanonico(resultado: LiquidationResult): string {
  const lineasOrdenadas = [...resultado.lineas].sort((a, b) => {
    if (a.inmuebleId !== b.inmuebleId) return a.inmuebleId < b.inmuebleId ? -1 : 1
    return a.conceptoCodigo < b.conceptoCodigo ? -1 : 1
  })

  return JSON.stringify({
    tenantId: resultado.tenantId,
    periodoId: resultado.periodoId,
    lineas: lineasOrdenadas.map((l) => ({
      inmuebleId: l.inmuebleId,
      conceptoCodigo: l.conceptoCodigo,
      monto: l.monto.amount.toString(),
      moneda: l.monto.currency,
    })),
    tenantTotal: {
      monto: resultado.tenantTotal.amount.toString(),
      moneda: resultado.tenantTotal.currency,
    },
  })
}

export function calcularResultHash(resultado: LiquidationResult): string {
  return createHash('sha256').update(serializarCanonico(resultado)).digest('hex')
}
