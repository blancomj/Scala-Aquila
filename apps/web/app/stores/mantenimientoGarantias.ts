/**
 * MANT-5 §4.5: garantías vigentes de un activo — Fase 5 de mantenimiento de activos (D-92)
 * conecta esto a la Ficha 360°, que hasta ahora no tenía ninguna vista para `mant_garantias`
 * (la tabla existía desde MANT-5 sin ningún store/página en el frontend).
 *
 * Puramente de lectura: `mant_activo_garantias_vigentes` es "solo informa, nunca bloquea"
 * (comentario de la propia función) — no hay CRUD de garantías en esta fase, ni falta hace
 * para "conectar visualmente" lo que ya existe.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type GarantiaVigente = Database['public']['Functions']['mant_activo_garantias_vigentes']['Returns'][number]

export const useMantenimientoGarantiasStore = defineStore('mantenimientoGarantias', () => {
  const vigentes = shallowRef<GarantiaVigente[]>([])
  const loading = ref(false)

  async function cargarGarantiasVigentes(activoId: string, fecha?: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.rpc('mant_activo_garantias_vigentes', {
        p_activo_id: activoId,
        ...(fecha ? { p_fecha: fecha } : {}),
      })
      if (error) throw error
      vigentes.value = data ?? []
    } finally {
      loading.value = false
    }
  }

  return { vigentes, loading, cargarGarantiasVigentes }
})
