/**
 * Consola de plataforma — PROMPT_MAESTRO_FASE1.md §5.3, F11.
 *
 * `platform_tenant_overview` (F1) ya hace todo el trabajo de seguridad:
 * `security_invoker = false` + `where is_platform_admin()` dentro de la
 * vista misma (SEC-10, T-SEC-10). Este store solo lee — no hay mutación
 * de plataforma en esta rebanada (platform:tenants:suspend queda para
 * cuando exista esa acción en la UI).
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type TenantOverviewRow = Database['public']['Views']['platform_tenant_overview']['Row']

export const usePlatformStore = defineStore('platform', () => {
  const tenants = shallowRef<TenantOverviewRow[]>([])
  const loading = ref(false)

  async function cargarTenants(): Promise<TenantOverviewRow[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: errorTenants } = await cliente
        .from('platform_tenant_overview')
        .select('*')
        .order('created_at', { ascending: false })
      if (errorTenants) throw errorTenants
      tenants.value = data ?? []
      return tenants.value
    } finally {
      loading.value = false
    }
  }

  return { tenants, loading, cargarTenants }
})
