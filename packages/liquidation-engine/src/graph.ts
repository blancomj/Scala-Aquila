/**
 * Grafo de dependencias entre conceptos — Docs/18 §5-21.
 *
 * Nodo = concepto. Arista = referencia `CONCEPTO.<codigo>` dentro de la
 * fórmula AEL de otro concepto. Orden topológico determinista: `prioridad`
 * ASC como desempate primario (18 §59 CONCEPT PRIORITY, PLAN §4.3
 * "desempate del orden topológico"), `codigo` ASC como desempate secundario
 * (18 §17-19 DETERMINISM / TIE BREAKER).
 */
import { parsear, type Expresion, type Instruccion } from '@aquila/ael-language'
import { DependenciaCiclicaError, DependenciaDesconocidaError } from './errors.js'
import type { SnapshotConcepto } from './snapshot.js'

function referenciasEnExpresion(expr: Expresion): readonly string[] {
  switch (expr.tipo) {
    case 'ReferenciaContract':
      return expr.contrato === 'CONCEPTO' ? [expr.campo] : []
    case 'LlamadaFuncion':
      return expr.argumentos.flatMap(referenciasEnExpresion)
    case 'ExpresionUnaria':
      return referenciasEnExpresion(expr.operando)
    case 'ExpresionBinaria':
      return [...referenciasEnExpresion(expr.izquierda), ...referenciasEnExpresion(expr.derecha)]
    default:
      return []
  }
}

function referenciasEnInstrucciones(instrucciones: readonly Instruccion[]): readonly string[] {
  const resultado: string[] = []
  for (const inst of instrucciones) {
    switch (inst.tipo) {
      case 'Declaracion':
        resultado.push(...referenciasEnExpresion(inst.expresion))
        break
      case 'Retorno':
        resultado.push(...referenciasEnExpresion(inst.expresion))
        break
      case 'Condicional':
        resultado.push(...referenciasEnExpresion(inst.condicion))
        resultado.push(...referenciasEnInstrucciones(inst.entonces))
        if (inst.sino !== null) resultado.push(...referenciasEnInstrucciones(inst.sino))
        break
    }
  }
  return resultado
}

export interface NodoGrafo {
  readonly concepto: SnapshotConcepto
  readonly dependencias: readonly string[]
}

/** Docs/18 §11 UNKNOWN DEPENDENCY: toda referencia CONCEPTO.X debe existir en el snapshot. */
export function construirGrafo(conceptos: readonly SnapshotConcepto[]): readonly NodoGrafo[] {
  const codigosConocidos = new Set(conceptos.map((c) => c.codigo))

  return conceptos.map((concepto) => {
    const { regla } = parsear(concepto.formulaAel, concepto.codigo)
    const dependencias = regla ? [...new Set(referenciasEnInstrucciones(regla.cuerpo))] : []

    for (const dependencia of dependencias) {
      if (!codigosConocidos.has(dependencia)) {
        throw new DependenciaDesconocidaError(concepto.codigo, dependencia)
      }
    }

    return { concepto, dependencias }
  })
}

/** Docs/18 §13-15 CYCLE, §16-21 TOPOLOGICAL SORT/DETERMINISM/TIE BREAKER. */
export function ordenTopologico(nodos: readonly NodoGrafo[]): readonly SnapshotConcepto[] {
  const porCodigo = new Map(nodos.map((n) => [n.concepto.codigo, n]))
  const visitados = new Set<string>()
  const enProgreso = new Set<string>()
  const pila: string[] = []
  const resultado: SnapshotConcepto[] = []

  const nodosOrdenados = [...nodos].sort((a, b) => {
    if (a.concepto.prioridad !== b.concepto.prioridad) {
      return a.concepto.prioridad - b.concepto.prioridad
    }
    return a.concepto.codigo < b.concepto.codigo ? -1 : 1
  })

  function visitar(codigo: string): void {
    if (visitados.has(codigo)) return
    if (enProgreso.has(codigo)) {
      const inicioCiclo = pila.indexOf(codigo)
      throw new DependenciaCiclicaError([...pila.slice(inicioCiclo), codigo])
    }

    const nodo = porCodigo.get(codigo)
    if (nodo === undefined) return // construirGrafo ya validó que toda dependencia existe.

    enProgreso.add(codigo)
    pila.push(codigo)

    for (const dependencia of [...nodo.dependencias].sort()) visitar(dependencia)

    pila.pop()
    enProgreso.delete(codigo)
    visitados.add(codigo)
    resultado.push(nodo.concepto)
  }

  for (const nodo of nodosOrdenados) visitar(nodo.concepto.codigo)

  return resultado
}
