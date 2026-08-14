/**
 * Orquestador de punta a punta — Docs/17 §2 OBJETIVO:
 * ExecutionContext → LiquidationContext → DataSnapshot → AEL Runtime.
 * D-14: snapshot → grafo → plan → ejecución → resultado → resultHash.
 */
import { calcularResultHash } from './hash.js'
import { ejecutarPlan } from './executor.js'
import { construirGrafo, ordenTopologico } from './graph.js'
import { ensamblarResultado, type LiquidationResult } from './result.js'
import type { DataSnapshot } from './snapshot.js'

export interface ResultadoLiquidacion {
  readonly resultado: LiquidationResult
  readonly resultHash: string
}

export function liquidar(snapshot: DataSnapshot): ResultadoLiquidacion {
  const grafo = construirGrafo(snapshot.conceptos)
  const plan = ordenTopologico(grafo)
  const resultadosConcepto = ejecutarPlan(snapshot, plan)
  const resultado = ensamblarResultado(snapshot, resultadosConcepto)
  const resultHash = calcularResultHash(resultado)
  return { resultado, resultHash }
}
