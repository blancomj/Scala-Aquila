import { describe, expect, it } from 'vitest'
import { construirGrafo, ordenTopologico } from './graph.js'
import { DependenciaCiclicaError, DependenciaDesconocidaError } from './errors.js'
import type { SnapshotConcepto } from './snapshot.js'

function concepto(
  over: Partial<SnapshotConcepto> & { codigo: string; formulaAel: string },
): SnapshotConcepto {
  return {
    id: over.codigo,
    modoCalculo: 'distribucion',
    modoValor: 'formulado',
    valorFijo: null,
    prioridad: 0,
    tipoRecurrencia: 'recurrente',
    fechaInicioAnio: 2000,
    fechaInicioMes: 1,
    fechaFinAnio: null,
    fechaFinMes: null,
    periodicidad: 'mensual',
    alcance: 'todos',
    alcanceCondiciones: null,
    ...over,
  }
}

describe('construirGrafo — referencias CONCEPTO.X', () => {
  it('sin referencias: dependencias vacías', () => {
    const grafo = construirGrafo([concepto({ codigo: 'A', formulaAel: 'REGLA A\nRETORNAR 1 COP' })])
    expect(grafo[0]?.dependencias).toEqual([])
  })

  it('detecta una referencia CONCEPTO.X', () => {
    const grafo = construirGrafo([
      concepto({ codigo: 'A', formulaAel: 'REGLA A\nRETORNAR 1 COP' }),
      concepto({ codigo: 'B', formulaAel: 'REGLA B\nRETORNAR CONCEPTO.A' }),
    ])
    const nodoB = grafo.find((n) => n.concepto.codigo === 'B')
    expect(nodoB?.dependencias).toEqual(['A'])
  })

  it('detecta referencias dentro de SI/binaria, con varias dependencias', () => {
    const grafo = construirGrafo([
      concepto({ codigo: 'A', formulaAel: 'REGLA A\nRETORNAR 1 COP' }),
      concepto({ codigo: 'C', formulaAel: 'REGLA C\nRETORNAR 1 COP' }),
      concepto({
        codigo: 'B',
        formulaAel:
          'REGLA B\nSI VERDADERO ENTONCES\nRETORNAR CONCEPTO.A - CONCEPTO.C\nSINO\nRETORNAR 0 COP\nFIN',
      }),
    ])
    const nodoB = grafo.find((n) => n.concepto.codigo === 'B')
    expect(nodoB?.dependencias).toEqual(['A', 'C'])
  })

  it('DependenciaDesconocidaError si CONCEPTO.X no existe en el snapshot (18 §11)', () => {
    expect(() =>
      construirGrafo([
        concepto({ codigo: 'B', formulaAel: 'REGLA B\nRETORNAR CONCEPTO.NO_EXISTE' }),
      ]),
    ).toThrow(DependenciaDesconocidaError)
  })
})

describe('ordenTopologico — orden determinista (18 §16-21)', () => {
  it('respeta las dependencias: A antes que B si B depende de A', () => {
    const grafo = construirGrafo([
      concepto({ codigo: 'B', formulaAel: 'REGLA B\nRETORNAR CONCEPTO.A', prioridad: 1 }),
      concepto({ codigo: 'A', formulaAel: 'REGLA A\nRETORNAR 1 COP', prioridad: 2 }),
    ])
    const orden = ordenTopologico(grafo).map((c) => c.codigo)
    expect(orden.indexOf('A')).toBeLessThan(orden.indexOf('B'))
  })

  it('desempata por prioridad ASC cuando no hay dependencia entre sí', () => {
    const grafo = construirGrafo([
      concepto({ codigo: 'Z', formulaAel: 'REGLA Z\nRETORNAR 1 COP', prioridad: 1 }),
      concepto({ codigo: 'A', formulaAel: 'REGLA A\nRETORNAR 1 COP', prioridad: 2 }),
    ])
    const orden = ordenTopologico(grafo).map((c) => c.codigo)
    expect(orden).toEqual(['Z', 'A'])
  })

  it('desempata por código ASC si prioridad también empata', () => {
    const grafo = construirGrafo([
      concepto({ codigo: 'Z', formulaAel: 'REGLA Z\nRETORNAR 1 COP', prioridad: 5 }),
      concepto({ codigo: 'A', formulaAel: 'REGLA A\nRETORNAR 1 COP', prioridad: 5 }),
    ])
    const orden = ordenTopologico(grafo).map((c) => c.codigo)
    expect(orden).toEqual(['A', 'Z'])
  })

  it('DependenciaCiclicaError si A→B→A (18 §13-15)', () => {
    const grafo = construirGrafo([
      concepto({ codigo: 'A', formulaAel: 'REGLA A\nRETORNAR CONCEPTO.B' }),
      concepto({ codigo: 'B', formulaAel: 'REGLA B\nRETORNAR CONCEPTO.A' }),
    ])
    expect(() => ordenTopologico(grafo)).toThrow(DependenciaCiclicaError)
  })

  it('rechaza la auto-dependencia A→A', () => {
    const grafo = construirGrafo([
      concepto({ codigo: 'A', formulaAel: 'REGLA A\nRETORNAR CONCEPTO.A' }),
    ])
    expect(() => ordenTopologico(grafo)).toThrow(DependenciaCiclicaError)
  })

  it('un concepto fijo no tiene dependencias — se salta el parseo, no falla con formulaAel vacío', () => {
    const grafo = construirGrafo([
      concepto({ codigo: 'FIJO', formulaAel: '', modoValor: 'fijo', valorFijo: '50000' }),
      concepto({ codigo: 'FORMULADO', formulaAel: 'REGLA FORMULADO\nRETORNAR CONCEPTO.FIJO' }),
    ])
    expect(grafo.find((n) => n.concepto.codigo === 'FIJO')?.dependencias).toEqual([])
    expect(grafo.find((n) => n.concepto.codigo === 'FORMULADO')?.dependencias).toEqual(['FIJO'])
  })
})
