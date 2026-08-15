/**
 * Conceptos/fórmulas AEL — última pieza sin UI del DoD de F6 ("UI de
 * conceptos y fórmulas", PLAN §5). Lectura/escritura directa por RLS
 * (`conceptos_insert_agent`/`_update_agent`) — a diferencia de
 * `politicas_financieras`/`coeficiente_sets`, `conceptos` no tiene ningún
 * guard de inmutabilidad (solo `set_updated_at`), así que editar una
 * fórmula existente es un UPDATE normal, sin ciclo borrador→vigente.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'
import { extraerErrorFuncion } from '~/utils/edge-function-error'

type ConceptoRow = Database['public']['Tables']['conceptos']['Row']
type ConceptoTipoBase = Database['public']['Enums']['concepto_tipo_base_t']
type ConceptoModoCalculo = Database['public']['Enums']['concepto_modo_calculo_t']
type ConceptoEstado = Database['public']['Enums']['concepto_estado_t']

export interface DiagnosticoPrueba {
  readonly codigo: string
  readonly mensaje: string
  readonly linea: number
  readonly columna: number
}

export interface ResultadoPruebaFormula {
  readonly valido: boolean
  readonly resultado: string | boolean | null
  readonly tipo: string | null
  readonly diagnosticos: readonly DiagnosticoPrueba[]
}

export const useConceptoStore = defineStore('concepto', () => {
  const conceptos = shallowRef<ConceptoRow[]>([])
  const loading = ref(false)

  async function cargarConceptos(tenantId: string): Promise<ConceptoRow[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: errorConceptos } = await cliente
        .from('conceptos')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('prioridad')
      if (errorConceptos) throw errorConceptos
      conceptos.value = data ?? []
      return conceptos.value
    } finally {
      loading.value = false
    }
  }

  async function crearConcepto(params: {
    tenantId: string
    codigo: string
    nombre: string
    tipoBase: ConceptoTipoBase
    modoCalculo: ConceptoModoCalculo
    formulaAel: string
    prioridad: number
  }): Promise<ConceptoRow> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorInsert } = await cliente
      .from('conceptos')
      .insert({
        tenant_id: params.tenantId,
        codigo: params.codigo,
        nombre: params.nombre,
        tipo_base: params.tipoBase,
        modo_calculo: params.modoCalculo,
        formula_ael: params.formulaAel,
        prioridad: params.prioridad,
      })
      .select('*')
      .single()
    if (errorInsert) throw errorInsert

    await cargarConceptos(params.tenantId)
    return data
  }

  async function actualizarConcepto(params: {
    id: string
    tenantId: string
    nombre: string
    tipoBase: ConceptoTipoBase
    modoCalculo: ConceptoModoCalculo
    formulaAel: string
    prioridad: number
  }): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error: errorUpdate } = await cliente
      .from('conceptos')
      .update({
        nombre: params.nombre,
        tipo_base: params.tipoBase,
        modo_calculo: params.modoCalculo,
        formula_ael: params.formulaAel,
        prioridad: params.prioridad,
      })
      .eq('id', params.id)
    if (errorUpdate) throw errorUpdate

    await cargarConceptos(params.tenantId)
  }

  async function cambiarEstado(
    id: string,
    estado: ConceptoEstado,
    tenantId: string,
  ): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error: errorUpdate } = await cliente.from('conceptos').update({ estado }).eq('id', id)
    if (errorUpdate) throw errorUpdate

    await cargarConceptos(tenantId)
  }

  async function probarFormula(params: {
    tenantId: string
    inmuebleId: string
    periodoId: string
    formulaAel: string
  }): Promise<ResultadoPruebaFormula> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorFuncion } = await cliente.functions.invoke<ResultadoPruebaFormula>(
      'probar-formula',
      {
        body: {
          tenant_id: params.tenantId,
          inmueble_id: params.inmuebleId,
          periodo_id: params.periodoId,
          formula_ael: params.formulaAel,
        },
      },
    )
    if (errorFuncion) throw await extraerErrorFuncion(errorFuncion)
    if (!data) throw new Error('probar-formula no devolvió datos.')
    return data
  }

  function limpiar(): void {
    conceptos.value = []
  }

  return {
    conceptos,
    loading,
    cargarConceptos,
    crearConcepto,
    actualizarConcepto,
    cambiarEstado,
    probarFormula,
    limpiar,
  }
})
