/**
 * Persiste el resultado de una liquidación — Docs/20 §67-69 FINALIZATION
 * GATE/PUBLICATION GATE/RESULT IMMUTABILITY, simplificado (D-14: sin la
 * máquina de estados completa). Igual que snapshot-supabase.ts, es el único
 * otro módulo de liquidation-engine autorizado a hablar con Supabase
 * (vigilado por eslint.config.js).
 *
 * AD-31/AD-33: tras persistir liquidacion_lineas, registra un cargo de
 * capital por cada línea con monto != 0 en el ledger de cuenta corriente —
 * dos escrituras secuenciales, no atómicas (misma simplificación D-14 que
 * liquidaciones+liquidacion_lineas hoy).
 */
import type { AquilaClient } from '@aquila/shared'
import type { ResultadoLiquidacion } from './liquidar.js'
import type { DataSnapshot } from './snapshot.js'
import { registrarCargosDeLiquidacion } from './cuenta-corriente-supabase.js'

export async function guardarLiquidacion(
  cliente: AquilaClient,
  snapshot: DataSnapshot,
  liquidacion: ResultadoLiquidacion,
): Promise<string> {
  const { data: fila, error: errorLiquidacion } = await cliente
    .from('liquidaciones')
    .insert({
      tenant_id: snapshot.tenantId,
      periodo_id: snapshot.periodo.id,
      estado: 'completada',
      result_hash: liquidacion.resultHash,
      tenant_total: Number(liquidacion.resultado.tenantTotal.amount.toString()),
    })
    .select('id')
    .single()
  if (errorLiquidacion) {
    throw new Error(`No se pudo guardar la liquidación: ${errorLiquidacion.message}`)
  }

  if (liquidacion.resultado.lineas.length === 0) return fila.id

  const conceptoIdPorCodigo = new Map(snapshot.conceptos.map((c) => [c.codigo, c.id]))
  const lineas = liquidacion.resultado.lineas.map((linea) => {
    const conceptoId = conceptoIdPorCodigo.get(linea.conceptoCodigo)
    if (conceptoId === undefined) {
      throw new Error(
        `La línea de "${linea.conceptoCodigo}" no corresponde a ningún concepto del snapshot`,
      )
    }
    return {
      tenant_id: snapshot.tenantId,
      liquidacion_id: fila.id,
      inmueble_id: linea.inmuebleId,
      concepto_id: conceptoId,
      monto: Number(linea.monto.amount.toString()),
    }
  })

  const { data: lineasInsertadas, error: errorLineas } = await cliente
    .from('liquidacion_lineas')
    .insert(lineas)
    .select('id, inmueble_id, concepto_id, monto')
  if (errorLineas) throw new Error(`No se pudieron guardar las líneas: ${errorLineas.message}`)

  await registrarCargosDeLiquidacion(
    cliente,
    snapshot.tenantId,
    snapshot.periodo.id,
    lineasInsertadas,
  )

  return fila.id
}
