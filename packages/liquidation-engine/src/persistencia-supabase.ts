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
 *
 * ═══ TRANSITORIO: esta función recorre la máquina de estados de un tirón ═══
 *
 * L0 (20260830570000) partió `liquidaciones` en dos tiempos: una liquidación
 * ya no puede NACER aplicada (guard_liquidacion_creacion), tiene que pasar
 * por pre_liquidada → pendiente_aprobacion → aplicada.
 *
 * Esta función es el camino VIEJO — el que usa la Edge Function
 * `liquidar-periodo`, donde liquidar es un solo acto sin revisión previa.
 * Para no romperlo mientras se construye el reemplazo, recorre las tres
 * transiciones seguidas y termina en el mismo sitio de siempre. Corre con
 * `supabaseAdmin` (service_role), así que `auth.uid()` es null y el guard no
 * exige rol administrador — mismo criterio de "cambio fuera de banda" que ya
 * aplican guard_accion_cobranza_transicion y guard_privileged_columns.
 *
 * L2 y L3 la reemplazan por los dos actos reales: `simular-liquidacion` deja
 * la Pre-Liquidación y se detiene ahí; `fn_aplicar_liquidacion` hace el resto
 * en una sola transacción de base de datos. Cuando eso exista, esta función
 * y la Edge Function que la llama se retiran juntas.
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
      estado: 'pre_liquidada',
      result_hash: liquidacion.resultHash,
      tenant_total: Number(liquidacion.resultado.tenantTotal.amount.toString()),
    })
    .select('id')
    .single()
  if (errorLiquidacion) {
    throw new Error(`No se pudo guardar la liquidación: ${errorLiquidacion.message}`)
  }

  // Las dos transiciones que el flujo viejo hacía implícitamente al nacer 'completada'.
  // Se hacen antes de las líneas y los cargos para que un fallo aquí no deje una
  // liquidación aplicada a medias.
  for (const estado of ['pendiente_aprobacion', 'aplicada'] as const) {
    const { error } = await cliente.from('liquidaciones').update({ estado }).eq('id', fila.id)
    if (error) {
      throw new Error(`No se pudo llevar la liquidación a ${estado}: ${error.message}`)
    }
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
