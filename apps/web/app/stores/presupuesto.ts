/**
 * Fuentes de financiación y previsualización del presupuesto — GAP-19
 * (Docs/Motor presupuestal/AQUILA_SAAS_E16_...md §5 fase 5, §9, §14).
 *
 * La lectura de `presupuestos`/`fuente_financiacion` va directo por RLS
 * (mismo criterio que members.ts) — la escritura de `fuente_financiacion`
 * y la previsualización pasan por Edge Functions (`presupuesto-financiacion`,
 * `presupuesto-previsualizar`) porque ninguna de las dos es una simple
 * lectura/escritura RLS: la primera tiene un guard trigger y resuelve
 * tenant_id server-side: la segunda ejecuta allocate() del kernel
 * financiero, no algo que el cliente pueda hacer solo.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'
import { extraerErrorFuncion } from '~/utils/edge-function-error'

type PresupuestoRow = Database['public']['Tables']['presupuestos']['Row']
type FuenteFinanciacionRow = Database['public']['Tables']['fuente_financiacion']['Row']
type FuenteFinanciacionTipo = Database['public']['Enums']['fuente_financiacion_tipo_t']

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
  const fuentes = shallowRef<FuenteFinanciacionRow[]>([])
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
    fuentes.value = []
  }

  return {
    presupuestos,
    fuentes,
    loading,
    cargarPresupuestos,
    cargarFuentesFinanciacion,
    registrarFuenteFinanciacion,
    previsualizarDistribucion,
    limpiar,
  }
})
