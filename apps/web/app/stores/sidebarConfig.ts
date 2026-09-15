/**
 * Orden/agrupación del menú lateral personalizado por el administrador del
 * tenant (migración 20260937000000). Sin invariante de "solo uno activo" ni
 * secretos de por medio — a diferencia de ia_config, un UPDATE directo del
 * cliente basta, protegido por la RLS de la propia tabla (solo
 * 'administrador' puede escribir).
 */
import { defineStore } from 'pinia'
import type { Database, Json } from '@aquila/shared'
import type { ConfiguracionMenu } from '~/composables/useMenuPersonalizado'

export const useSidebarConfigStore = defineStore('sidebar-config', () => {
  const configuracion = ref<ConfiguracionMenu>({})
  const loading = ref(false)
  const guardando = ref(false)

  async function cargar(tenantId: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('sidebar_config')
        .select('configuracion')
        .eq('tenant_id', tenantId)
        .maybeSingle()
      if (error) throw error
      configuracion.value = (data?.configuracion as ConfiguracionMenu | null) ?? {}
    } finally {
      loading.value = false
    }
  }

  async function guardar(tenantId: string, nuevaConfiguracion: ConfiguracionMenu): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const {
        data: { user },
      } = await cliente.auth.getUser()
      const { error } = await cliente.from('sidebar_config').upsert(
        {
          tenant_id: tenantId,
          configuracion: nuevaConfiguracion as unknown as Json,
          actualizado_por: user?.id ?? null,
          actualizado_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id' },
      )
      if (error) throw error
      configuracion.value = nuevaConfiguracion
    } finally {
      guardando.value = false
    }
  }

  async function restablecer(tenantId: string): Promise<void> {
    await guardar(tenantId, {})
  }

  return { configuracion, loading, guardando, cargar, guardar, restablecer }
})
