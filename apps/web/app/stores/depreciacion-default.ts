/**
 * Depreciación por defecto, por categoría de activo — gap de configurabilidad contable
 * (2026-09-14). A diferencia de deterioro.ts (CO-7, política versionada que recalcula saldos),
 * esto es una sugerencia editable en el momento que precarga ActivoFormDrawer al elegir
 * categoría — activos.vida_util_meses/metodo_depreciacion siguen siendo la fuente real por
 * activo, esta tabla nunca los sobrescribe retroactivamente.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type DefaultRow = Database['public']['Tables']['mant_categoria_depreciacion_default']['Row']
type MetodoDepreciacion = Database['public']['Enums']['depreciacion_metodo_t']

export const useDepreciacionDefaultStore = defineStore('depreciacionDefault', () => {
  const defaults = shallowRef<DefaultRow[]>([])
  const loading = ref(false)
  const guardando = ref(false)

  async function cargarDefaults(tenantId: string): Promise<DefaultRow[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('mant_categoria_depreciacion_default')
        .select('*')
        .eq('tenant_id', tenantId)
      if (error) throw error
      defaults.value = data ?? []
      return defaults.value
    } finally {
      loading.value = false
    }
  }

  /** Upsert por (tenant_id, categoria_id) — un default por categoría, se reemplaza si ya existía. */
  async function guardarDefault(params: {
    tenantId: string
    categoriaId: number
    metodoDepreciacion: MetodoDepreciacion
    vidaUtilMeses: number | null
  }): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('mant_categoria_depreciacion_default').upsert(
        {
          tenant_id: params.tenantId,
          categoria_id: params.categoriaId,
          metodo_depreciacion: params.metodoDepreciacion,
          vida_util_meses: params.metodoDepreciacion === 'linea_recta' ? params.vidaUtilMeses : null,
        },
        { onConflict: 'tenant_id,categoria_id' },
      )
      if (error) throw error
      await cargarDefaults(params.tenantId)
    } finally {
      guardando.value = false
    }
  }

  async function eliminarDefault(tenantId: string, id: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('mant_categoria_depreciacion_default').delete().eq('id', id)
      if (error) throw error
      defaults.value = defaults.value.filter((d) => d.id !== id)
    } finally {
      guardando.value = false
    }
  }

  function limpiar(): void {
    defaults.value = []
  }

  return { defaults, loading, guardando, cargarDefaults, guardarDefault, eliminarDefault, limpiar }
})
