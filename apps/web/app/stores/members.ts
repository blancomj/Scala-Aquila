/**
 * Gestión de miembros — PROMPT_MAESTRO_FASE1.md §8 (update-membership), E6.
 *
 * A diferencia de tenants/invitations, `memberships` sí permite UPDATE
 * directo al agent vía RLS (`memberships_update_agent`) — no hace falta
 * una Edge Function. `guard_last_agent` (F1) y `guard_self_modify`
 * (20260814150000_guard_self_modify.sql) son la barrera real en BD;
 * este store solo hace el UPDATE y confía en que la RLS/triggers lo
 * validen (los errores LAST_AGENT/SELF_MODIFY llegan tal cual desde
 * Postgres, sin traducir — no hay Edge Function que los reformatee).
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'
import type { TenantRole } from '~/types/permissions'

type MembershipRow = Database['public']['Tables']['memberships']['Row']
type ProfileRow = Database['public']['Tables']['profiles']['Row']
type Miembro = MembershipRow & { profile: Pick<ProfileRow, 'email' | 'full_name'> | null }

export const useMembersStore = defineStore('members', () => {
  const miembros = shallowRef<Miembro[]>([])
  const loading = ref(false)

  async function cargarMiembros(tenantId: string): Promise<Miembro[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: errorMiembros } = await cliente
        .from('memberships')
        // memberships tiene dos FK a profiles (user_id, invited_by) —
        // PostgREST necesita el hint de columna para no ser ambiguo.
        .select('*, profile:profiles!user_id(email, full_name)')
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .order('created_at', { ascending: true })
      if (errorMiembros) throw errorMiembros
      miembros.value = (data ?? []) as Miembro[]
      return miembros.value
    } finally {
      loading.value = false
    }
  }

  async function cambiarRol(membershipId: string, role: TenantRole, tenantId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente.from('memberships').update({ role }).eq('id', membershipId)
    if (error) throw error
    await cargarMiembros(tenantId)
  }

  async function revocar(membershipId: string, tenantId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente.from('memberships').update({ status: 'revoked' }).eq('id', membershipId)
    if (error) throw error
    await cargarMiembros(tenantId)
  }

  function limpiar(): void {
    miembros.value = []
  }

  return { miembros, loading, cargarMiembros, cambiarRol, revocar, limpiar }
})
