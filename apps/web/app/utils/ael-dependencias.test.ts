/**
 * AEL-004 Fase 5 — cobertura directa de ael-dependencias.ts: grafo limpio,
 * ciclo detectado, dependencia desconocida detectada, impacto invertido.
 * Sin Supabase — construye filas ConceptoRow a mano.
 */
import { describe, expect, it } from 'vitest'
import type { Database } from '@aquila/shared'
import { calcularGrafo, calcularImpacto, conceptoARowSnapshot } from './ael-dependencias'

type ConceptoRow = Database['public']['Tables']['conceptos']['Row']

function concepto(overrides: Partial<ConceptoRow> & { codigo: string }): ConceptoRow {
  return {
    id: overrides.codigo,
    tenant_id: 't1',
    nombre: overrides.codigo,
    modo_calculo: 'distribucion',
    modo_valor: 'formulado',
    formula_ael: null,
    valor_fijo: null,
    tipo_recurrencia: 'recurrente',
    fecha_inicio_anio: 2000,
    fecha_inicio_mes: 1,
    fecha_fin_anio: null,
    fecha_fin_mes: null,
    periodicidad: 'mensual',
    alcance: 'todos',
    alcance_condiciones: null,
    presupuesto_cuenta_id: null,
    prioridad: 100,
    estado: 'activo',
    version: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: null,
    enviado_a_revision_por: null,
    enviado_a_revision_at: null,
    aprobado_por: null,
    aprobado_at: null,
    rechazado_motivo: null,
    busqueda_tsv: null,
    ...overrides,
  }
}

describe('conceptoARowSnapshot', () => {
  it('mapea columnas Supabase a la forma que espera construirGrafo, formula_ael null → cadena vacía', () => {
    const filas = [concepto({ codigo: 'A', formula_ael: null })]
    expect(conceptoARowSnapshot(filas)).toEqual([
      {
        id: 'A',
        codigo: 'A',
        modoCalculo: 'distribucion',
        modoValor: 'formulado',
        formulaAel: '',
        valorFijo: null,
        prioridad: 100,
        tipoRecurrencia: 'recurrente',
        fechaInicioAnio: 2000,
        fechaInicioMes: 1,
        fechaFinAnio: null,
        fechaFinMes: null,
        periodicidad: 'mensual',
        alcance: 'todos',
        alcanceCondiciones: null,
      },
    ])
  })
})

describe('calcularGrafo', () => {
  it('grafo limpio: resuelve el orden topológico real', () => {
    const filas = [
      concepto({ codigo: 'BASE', formula_ael: 'REGLA BASE\nRETORNAR 1' }),
      concepto({
        codigo: 'DERIVADO',
        formula_ael: 'REGLA DERIVADO\nRETORNAR CONCEPTO.BASE',
      }),
    ]
    const resultado = calcularGrafo(filas)
    expect(resultado.ciclo).toBeNull()
    expect(resultado.desconocida).toBeNull()
    expect(resultado.orden?.map((c) => c.codigo)).toEqual(['BASE', 'DERIVADO'])
  })

  it('detecta un ciclo sin lanzar', () => {
    const filas = [
      concepto({ codigo: 'A', formula_ael: 'REGLA A\nRETORNAR CONCEPTO.B' }),
      concepto({ codigo: 'B', formula_ael: 'REGLA B\nRETORNAR CONCEPTO.A' }),
    ]
    const resultado = calcularGrafo(filas)
    expect(resultado.orden).toBeNull()
    expect(resultado.desconocida).toBeNull()
    expect(resultado.ciclo).toContain('A')
    expect(resultado.ciclo).toContain('B')
  })

  it('detecta una dependencia desconocida sin lanzar', () => {
    const filas = [concepto({ codigo: 'A', formula_ael: 'REGLA A\nRETORNAR CONCEPTO.NO_EXISTE' })]
    const resultado = calcularGrafo(filas)
    expect(resultado.orden).toBeNull()
    expect(resultado.ciclo).toBeNull()
    expect(resultado.desconocida).toEqual({ origen: 'A', referenciado: 'NO_EXISTE' })
  })
})

describe('calcularImpacto', () => {
  it('invierte capabilities: un campo usado por dos conceptos lista ambos', () => {
    const filas = [
      concepto({
        codigo: 'CUOTA_ADMIN',
        formula_ael: 'REGLA CUOTA_ADMIN\nRETORNAR PARAMETER.PRESUPUESTO_ANUAL',
      }),
      concepto({
        codigo: 'OTRO',
        formula_ael:
          'REGLA OTRO\nDEFINIR x = PARAMETER.PRESUPUESTO_ANUAL\nRETORNAR REDONDEAR_DINERO(x, 2)',
      }),
    ]
    const impacto = calcularImpacto(filas)

    const parametro = impacto.find((e) => e.etiqueta === 'PARAMETER.PRESUPUESTO_ANUAL')
    expect(parametro?.tipo).toBe('contrato')
    expect(parametro?.conceptos).toEqual(['CUOTA_ADMIN', 'OTRO'])

    const funcion = impacto.find((e) => e.etiqueta === 'REDONDEAR_DINERO')
    expect(funcion?.tipo).toBe('funcion')
    expect(funcion?.conceptos).toEqual(['OTRO'])
  })

  it('sin conceptos, no hay entradas', () => {
    expect(calcularImpacto([])).toEqual([])
  })
})
