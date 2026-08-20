/**
 * AEL-004 Fase 5 — grafo de dependencias entre conceptos + impacto por
 * Contract/Function. Reutiliza construirGrafo()/ordenTopologico() reales
 * de @aquila/liquidation-engine (el mismo cálculo que usa liquidar()) en
 * vez de reimplementar el análisis de dependencias — y extraerCapabilidades()
 * de Fase 4 (ael-capabilities.ts), invertida, para el impacto.
 *
 * Importa desde los subpaths ./graph y ./errors, nunca desde el barrel
 * "." de @aquila/liquidation-engine — ese barrel re-exporta módulos
 * server-only (snapshot-supabase.ts, persistencia-supabase.ts,
 * cuenta-corriente-supabase.ts) que no deben llegar al bundle del cliente.
 */
import { construirGrafo, ordenTopologico, type NodoGrafo } from '@aquila/liquidation-engine/graph'
import {
  DependenciaCiclicaError,
  DependenciaDesconocidaError,
} from '@aquila/liquidation-engine/errors'
import type { SnapshotConcepto } from '@aquila/liquidation-engine/snapshot'
import type { Database } from '@aquila/shared'
import { extraerCapabilidades } from './ael-capabilities'

type ConceptoRow = Database['public']['Tables']['conceptos']['Row']

export function conceptoARowSnapshot(conceptos: readonly ConceptoRow[]): SnapshotConcepto[] {
  return conceptos.map((c) => ({
    id: c.id,
    codigo: c.codigo,
    modoCalculo: c.modo_calculo,
    modoValor: c.modo_valor,
    formulaAel: c.formula_ael ?? '',
    valorFijo: c.valor_fijo !== null ? String(c.valor_fijo) : null,
    prioridad: c.prioridad,
    tipoRecurrencia: c.tipo_recurrencia,
    fechaInicioAnio: c.fecha_inicio_anio,
    fechaInicioMes: c.fecha_inicio_mes,
    fechaFinAnio: c.fecha_fin_anio,
    fechaFinMes: c.fecha_fin_mes,
    periodicidad: c.periodicidad,
    alcance: c.alcance,
    alcanceCondiciones: c.alcance_condiciones as unknown as SnapshotConcepto['alcanceCondiciones'],
  }))
}

export interface ResultadoGrafo {
  /** Vacío si construirGrafo() no pudo completar (ver `desconocida`). */
  readonly nodos: readonly NodoGrafo[]
  /** Orden de cálculo real (el mismo que usará liquidar-periodo) — null si hay ciclo o no se pudo construir el grafo. */
  readonly orden: readonly SnapshotConcepto[] | null
  readonly ciclo: readonly string[] | null
  readonly desconocida: { readonly origen: string; readonly referenciado: string } | null
}

/** construirGrafo() valida TODOS los conceptos juntos — una sola referencia
 * desconocida bloquea el lote completo (fail-fast, Docs/18 §11), así que
 * cuando eso ocurre no hay grafo parcial que mostrar, solo el detalle del
 * problema. Reimplementar una versión "tolerante a fallos" duplicaría la
 * lógica real de construirGrafo — se prefiere mostrar el problema tal cual. */
export function calcularGrafo(conceptos: readonly ConceptoRow[]): ResultadoGrafo {
  const snapshot = conceptoARowSnapshot(conceptos)

  let nodos: readonly NodoGrafo[]
  try {
    nodos = construirGrafo(snapshot)
  } catch (excepcion) {
    if (excepcion instanceof DependenciaDesconocidaError) {
      return {
        nodos: [],
        orden: null,
        ciclo: null,
        desconocida: {
          origen: excepcion.conceptoOrigen,
          referenciado: excepcion.conceptoReferenciado,
        },
      }
    }
    throw excepcion
  }

  try {
    const orden = ordenTopologico(nodos)
    return { nodos, orden, ciclo: null, desconocida: null }
  } catch (excepcion) {
    if (excepcion instanceof DependenciaCiclicaError) {
      return { nodos, orden: null, ciclo: excepcion.ciclo, desconocida: null }
    }
    throw excepcion
  }
}

export interface ImpactoEntry {
  readonly tipo: 'contrato' | 'funcion'
  readonly etiqueta: string
  readonly conceptos: readonly string[]
}

/** Inversa de extraerCapabilidades(): para cada PARAMETER/UNIT/CONCEPTO.campo
 * o función usada en cualquier fórmula, qué conceptos la usan — Doc 10
 * §79-80 IMPACT ANALYSIS/CHANGE IMPACT, adaptado (AQUILA no "depreca"
 * Contracts, pero la misma pregunta — "¿qué se rompería?" — aplica antes
 * de archivar/modificar un concepto). */
export function calcularImpacto(conceptos: readonly ConceptoRow[]): readonly ImpactoEntry[] {
  const porEtiqueta = new Map<string, { tipo: 'contrato' | 'funcion'; conceptos: Set<string> }>()

  for (const concepto of conceptos) {
    const { contratos, funciones } = extraerCapabilidades(concepto.formula_ael ?? '')

    for (const c of contratos) {
      for (const campo of c.campos) {
        const etiqueta = `${c.contrato}.${campo}`
        const entrada = porEtiqueta.get(etiqueta) ?? {
          tipo: 'contrato' as const,
          conceptos: new Set<string>(),
        }
        entrada.conceptos.add(concepto.codigo)
        porEtiqueta.set(etiqueta, entrada)
      }
    }

    for (const funcion of funciones) {
      const entrada = porEtiqueta.get(funcion) ?? {
        tipo: 'funcion' as const,
        conceptos: new Set<string>(),
      }
      entrada.conceptos.add(concepto.codigo)
      porEtiqueta.set(funcion, entrada)
    }
  }

  return [...porEtiqueta.entries()]
    .map(([etiqueta, { tipo, conceptos: codigos }]) => ({
      tipo,
      etiqueta,
      conceptos: [...codigos].sort(),
    }))
    .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta))
}
