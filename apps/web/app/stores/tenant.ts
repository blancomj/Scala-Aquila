/**
 * Estado de tenancy — PROMPT_MAESTRO_FASE1.md §9.3, §9.4, §10.2.
 *
 * `memberships` trae el tenant embebido (join) para poblar el selector sin
 * una segunda consulta. `crearTenant`/`cambiarTenant` llaman a las RPC de
 * `20260814120000_tenancy_rpc.sql` (D-18) y refrescan `profiles` después,
 * porque `active_tenant_id` vive ahí, no en este store.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type TenantRow = Database['public']['Tables']['tenants']['Row']
type MembershipRow = Database['public']['Tables']['memberships']['Row']
type Membresia = MembershipRow & { tenant: TenantRow }

export const useTenantStore = defineStore('tenant', () => {
  // shallowRef: `tenant.settings` es `Json` (tipo recursivo). `ref<T>` fuerza
  // a Vue a des-envolver profundamente vía UnwrapRef, lo que dispara
  // "Type instantiation is excessively deep" en vue-tsc. No mutamos campos
  // anidados reactivamente — siempre reemplazamos el arreglo entero.
  const memberships = shallowRef<Membresia[]>([])
  const loading = ref(false)

  async function cargarMemberships(): Promise<Membresia[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: errorMemberships } = await cliente
        .from('memberships')
        .select('*, tenant:tenants(*)')
        .eq('status', 'active')
      if (errorMemberships) throw errorMemberships
      memberships.value = (data ?? []) as Membresia[]
      return memberships.value
    } finally {
      loading.value = false
    }
  }

  async function crearTenant(nombre: string, slug: string): Promise<TenantRow> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorCrear } = await cliente.rpc('create_tenant', {
      p_name: nombre,
      p_slug: slug,
    })
    if (errorCrear) throw errorCrear

    const authStore = useAuthStore()
    await authStore.cargarPerfil({ forzar: true })
    await cargarMemberships()
    return data as TenantRow
  }

  async function cambiarTenant(tenantId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error: errorSwitch } = await cliente.rpc('switch_tenant', { p_tenant_id: tenantId })
    if (errorSwitch) throw errorSwitch

    const authStore = useAuthStore()
    await authStore.cargarPerfil({ forzar: true })
  }

  function limpiar(): void {
    memberships.value = []
  }

  return { memberships, loading, cargarMemberships, crearTenant, cambiarTenant, limpiar }
})
