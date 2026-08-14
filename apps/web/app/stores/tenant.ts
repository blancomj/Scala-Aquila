/**
 * Estado de tenancy — PROMPT_MAESTRO_FASE1.md §9.3, §9.4, §10.2.
 *
 * `memberships` trae el tenant embebido (join) para poblar el selector sin
 * una segunda consulta. `crearTenant` llama a la Edge Function `create-tenant`
 * (D-19: infraestructura real, ver supabase/functions/create-tenant);
 * `cambiarTenant` sigue usando la RPC `switch_tenant` (D-18: no necesita
 * service_role, RLS + guard_active_tenant ya la protegen). Ambas refrescan
 * `profiles` después, porque `active_tenant_id` vive ahí, no en este store.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type TenantRow = Database['public']['Tables']['tenants']['Row']
type MembershipRow = Database['public']['Tables']['memberships']['Row']
type Membresia = MembershipRow & { tenant: TenantRow }

interface CrearTenantRespuesta {
  tenant: TenantRow
  membership: MembershipRow
}

// La Edge Function responde `{ error: { code, message, details } }` (formato
// uniforme, PROMPT_MAESTRO_FASE1.md §8) en cualquier fallo con status != 2xx.
// supabase-js envuelve eso en un FunctionsHttpError cuyo `.context` es el
// Response crudo — hay que leerlo a mano para no perder el mensaje real.
async function extraerErrorFuncion(error: unknown): Promise<Error> {
  if (error && typeof error === 'object' && 'context' in error) {
    const contexto = (error as { context: unknown }).context
    if (contexto instanceof Response) {
      try {
        const cuerpo = (await contexto.clone().json()) as { error?: { message?: string } }
        if (cuerpo.error?.message) return new Error(cuerpo.error.message)
      } catch {
        // El cuerpo no era JSON con la forma esperada — cae al mensaje genérico.
      }
    }
  }
  return error instanceof Error ? error : new Error('No se pudo completar la operación.')
}

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
    const { data, error: errorCrear } = await cliente.functions.invoke<CrearTenantRespuesta>(
      'create-tenant',
      { body: { name: nombre, slug } },
    )
    if (errorCrear) throw await extraerErrorFuncion(errorCrear)
    if (!data) throw new Error('create-tenant no devolvió datos.')

    const authStore = useAuthStore()
    await authStore.cargarPerfil({ forzar: true })
    await cargarMemberships()
    return data.tenant
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
