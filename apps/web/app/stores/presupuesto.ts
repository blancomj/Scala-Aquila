/**
 * Presupuestos, rubros, fuentes de financiación y previsualización —
 * GAP-19 (Docs/Motor presupuestal/AQUILA_SAAS_E16_...md §5 fase 5, §9, §14).
 *
 * `presupuestos`/`presupuesto_rubros`/`fuente_financiacion` se leen directo
 * por RLS (mismo criterio que members.ts). Escritura:
 *  - crear presupuesto/rubro y activar (borrador→vigente): RLS directa
 *    (`presupuestos_insert_agent`/`_update_agent`, `presupuesto_rubros_
 *    insert_agent`) — no hay guard trigger que lo bloquee en ese sentido,
 *    a diferencia de fuente_financiacion.
 *  - registrar fuente_financiacion y previsualizar: Edge Functions
 *    (`presupuesto-financiacion`, `presupuesto-previsualizar`) porque
 *    ninguna de las dos es una simple lectura/escritura RLS: la primera
 *    tiene un guard trigger y resuelve tenant_id server-side; la segunda
 *    ejecuta allocate() del kernel financiero, no algo que el cliente
 *    pueda hacer solo.
 *
 * activarPresupuesto no valida Σrubros = monto_total del lado del cliente
 * más allá de una advertencia visual — guard_presupuesto_reconciliado ya
 * lo exige en BD (BUDGET_NOT_RECONCILED) y ese error llega tal cual, sin
 * traducir (mismo criterio que activarPolitica en politicaFinanciera.ts).
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'
import { extraerErrorFuncion } from '~/utils/edge-function-error'

type PresupuestoRow = Database['public']['Tables']['presupuestos']['Row']
type PresupuestoRubroRow = Database['public']['Tables']['presupuesto_rubros']['Row']
type FuenteFinanciacionRow = Database['public']['Tables']['fuente_financiacion']['Row']
type FuenteFinanciacionTipo = Database['public']['Enums']['fuente_financiacion_tipo_t']
type CategoriaRubro = Pick<
  Database['public']['Tables']['lista_tipos']['Row'],
  'id' | 'codigo' | 'nombre'
>

interface PrevisualizacionDistribucion {
  presupuesto_id: string
  anio: number
  version: number
  estado: string
  moneda: string
  monto_total: number
  otros_ingresos_aplicados: number
  necesidad_financiera: string
  distribucion: {
    inmueble_id: string
    codigo: string
    coeficiente: string | null
    valor_exacto: string
    valor_asignado: string
  }[]
}

export const usePresupuestoStore = defineStore('presupuesto', () => {
  const presupuestos = shallowRef<PresupuestoRow[]>([])
  const rubros = shallowRef<PresupuestoRubroRow[]>([])
  const fuentes = shallowRef<FuenteFinanciacionRow[]>([])
  const categoriasRubro = shallowRef<CategoriaRubro[]>([])
  const loading = ref(false)

  async function cargarPresupuestos(tenantId: string): Promise<PresupuestoRow[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: errorPresupuestos } = await cliente
        .from('presupuestos')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('anio', { ascending: false })
      if (errorPresupuestos) throw errorPresupuestos
      presupuestos.value = data ?? []
      return presupuestos.value
    } finally {
      loading.value = false
    }
  }

  async function crearPresupuesto(params: {
    tenantId: string
    anio: number
    montoTotal: number
  }): Promise<PresupuestoRow> {
    const ultimaVersion = presupuestos.value
      .filter((p) => p.tenant_id === params.tenantId && p.anio === params.anio)
      .reduce((max, p) => Math.max(max, p.version), 0)

    const cliente = useSupabaseClient<Database>()
    const { data, error: errorInsert } = await cliente
      .from('presupuestos')
      .insert({
        tenant_id: params.tenantId,
        anio: params.anio,
        version: ultimaVersion + 1,
        estado: 'borrador',
        monto_total: params.montoTotal,
      })
      .select('*')
      .single()
    if (errorInsert) throw errorInsert

    await cargarPresupuestos(params.tenantId)
    return data
  }

  async function activarPresupuesto(id: string, tenantId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error: errorUpdate } = await cliente
      .from('presupuestos')
      .update({ estado: 'vigente' })
      .eq('id', id)
    if (errorUpdate) throw errorUpdate

    await cargarPresupuestos(tenantId)
  }

  async function cargarCategoriasRubro(): Promise<CategoriaRubro[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorCategorias } = await cliente
      .from('lista_tipos')
      .select('id, codigo, nombre')
      .eq('tipo', 'CATEGORIA_RUBRO_PRESUPUESTAL')
      .is('tenant_id', null)
      .order('orden')
    if (errorCategorias) throw errorCategorias
    categoriasRubro.value = data ?? []
    return categoriasRubro.value
  }

  async function cargarRubros(presupuestoId: string): Promise<PresupuestoRubroRow[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorRubros } = await cliente
      .from('presupuesto_rubros')
      .select('*')
      .eq('presupuesto_id', presupuestoId)
      .order('created_at', { ascending: true })
    if (errorRubros) throw errorRubros
    rubros.value = data ?? []
    return rubros.value
  }

  async function crearRubro(params: {
    presupuestoId: string
    tenantId: string
    codigo: string
    nombre: string
    categoriaId: number
    montoAnual: number
    fundamentoNormativoId?: number
  }): Promise<PresupuestoRubroRow> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorInsert } = await cliente
      .from('presupuesto_rubros')
      .insert({
        tenant_id: params.tenantId,
        presupuesto_id: params.presupuestoId,
        codigo: params.codigo,
        nombre: params.nombre,
        categoria_id: params.categoriaId,
        monto_anual: params.montoAnual,
        fundamento_normativo_id: params.fundamentoNormativoId,
      })
      .select('*')
      .single()
    if (errorInsert) throw errorInsert

    await cargarRubros(params.presupuestoId)
    return data
  }

  async function cargarFuentesFinanciacion(
    presupuestoId: string,
  ): Promise<FuenteFinanciacionRow[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: errorFuentes } = await cliente
        .from('fuente_financiacion')
        .select('*')
        .eq('presupuesto_id', presupuestoId)
        .order('created_at', { ascending: false })
      if (errorFuentes) throw errorFuentes
      fuentes.value = data ?? []
      return fuentes.value
    } finally {
      loading.value = false
    }
  }

  async function registrarFuenteFinanciacion(params: {
    presupuestoId: string
    tipo: FuenteFinanciacionTipo
    valorDisponible: number
    valorAplicado: number
    descripcion?: string
    fundamentoNormativoId?: number
  }): Promise<FuenteFinanciacionRow> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorFuncion } = await cliente.functions.invoke<FuenteFinanciacionRow>(
      'presupuesto-financiacion',
      {
        body: {
          presupuesto_id: params.presupuestoId,
          tipo: params.tipo,
          valor_disponible: params.valorDisponible,
          valor_aplicado: params.valorAplicado,
          descripcion: params.descripcion,
          fundamento_normativo_id: params.fundamentoNormativoId,
        },
      },
    )
    if (errorFuncion) throw await extraerErrorFuncion(errorFuncion)
    if (!data) throw new Error('presupuesto-financiacion no devolvió datos.')

    await cargarFuentesFinanciacion(params.presupuestoId)
    return data
  }

  async function previsualizarDistribucion(
    presupuestoId: string,
  ): Promise<PrevisualizacionDistribucion> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorFuncion } =
      await cliente.functions.invoke<PrevisualizacionDistribucion>('presupuesto-previsualizar', {
        body: { presupuesto_id: presupuestoId },
      })
    if (errorFuncion) throw await extraerErrorFuncion(errorFuncion)
    if (!data) throw new Error('presupuesto-previsualizar no devolvió datos.')
    return data
  }

  function limpiar(): void {
    presupuestos.value = []
    rubros.value = []
    fuentes.value = []
    categoriasRubro.value = []
  }

  return {
    presupuestos,
    rubros,
    fuentes,
    categoriasRubro,
    loading,
    cargarPresupuestos,
    crearPresupuesto,
    activarPresupuesto,
    cargarCategoriasRubro,
    cargarRubros,
    crearRubro,
    cargarFuentesFinanciacion,
    registrarFuenteFinanciacion,
    previsualizarDistribucion,
    limpiar,
  }
})
