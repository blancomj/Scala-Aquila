/**
 * MANT-2 · Semáforo de cumplimiento normativo (mant_estado_cumplimiento, calculado — nunca
 * almacenado) y registro de evidencia (mant_cumplimiento, append-only).
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type EstadoRow = Database['public']['Functions']['mant_estado_cumplimiento']['Returns'][number]
type CumplimientoInsert = Database['public']['Tables']['mant_cumplimiento']['Insert']

export const useCumplimientoStore = defineStore('cumplimiento', () => {
  const estados = shallowRef<EstadoRow[]>([])
  const loading = ref(false)
  const guardando = ref(false)

  async function cargarEstados(tenantId: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.rpc('mant_estado_cumplimiento', { p_tenant_id: tenantId })
      if (error) throw error
      estados.value = data ?? []
    } finally {
      loading.value = false
    }
  }

  async function registrarCumplimiento(fila: CumplimientoInsert): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('mant_cumplimiento').insert(fila)
      if (error) throw error
      await cargarEstados(fila.tenant_id)
    } finally {
      guardando.value = false
    }
  }

  return { estados, loading, guardando, cargarEstados, registrarCumplimiento }
})
