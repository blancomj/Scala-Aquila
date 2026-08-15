/**
 * Fuentes de financiación del presupuesto — GAP-19 (Docs/Motor
 * presupuestal/AQUILA_SAAS_E16_...md §9, §14).
 *
 * La lectura de `presupuestos`/`fuente_financiacion` va directo por RLS
 * (mismo criterio que members.ts) — la escritura de `fuente_financiacion`
 * pasa por la Edge Function `presupuesto-financiacion` porque
 * `guard_fuente_financiacion` y la resolución de `tenant_id` desde el
 * presupuesto viven ahí (mismo criterio que invitations.ts para invite-user).
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'
import { extraerErrorFuncion } from '~/utils/edge-function-error'

type PresupuestoRow = Database['public']['Tables']['presupuestos']['Row']
type FuenteFinanciacionRow = Database['public']['Tables']['fuente_financiacion']['Row']
type FuenteFinanciacionTipo = Database['public']['Enums']['fuente_financiacion_tipo_t']

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
    limpiar,
  }
})
