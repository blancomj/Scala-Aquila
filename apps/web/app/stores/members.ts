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
type Miembro = MembershipRow & {
  profile: Pick<ProfileRow, 'email' | 'full_name' | 'phone' | 'status'> | null
}

interface ActualizarPerfilRespuesta {
  id: string
  full_name: string | null
  phone: string | null
  status: ProfileRow['status']
}

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
        .select('*, profile:profiles!user_id(email, full_name, phone, status)')
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

  async function cambiarRol(
    membershipId: string,
    role: TenantRole,
    tenantId: string,
  ): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente.from('memberships').update({ role }).eq('id', membershipId)
    if (error) throw error
    await cargarMiembros(tenantId)
  }

  async function revocar(membershipId: string, tenantId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente
      .from('memberships')
      .update({ status: 'revoked' })
      .eq('id', membershipId)
    if (error) throw error
    await cargarMiembros(tenantId)
  }

  // A diferencia de cambiarRol/revocar, esto SÍ pasa por Edge Function
  // (update-member-profile): profiles.status está bloqueado por el trigger
  // guard_privileged_columns (SEC-06) para cualquier UPDATE que lleve JWT de
  // usuario, sea RLS directo o RPC — solo una llamada con service_role lo
  // puede tocar. Ver comentario completo en la Edge Function.
  async function actualizarPerfil(
    membershipId: string,
    datos: { fullName: string; phone: string; status: ProfileRow['status'] },
    tenantId: string,
  ): Promise<ActualizarPerfilRespuesta> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente.functions.invoke<ActualizarPerfilRespuesta>(
      'update-member-profile',
      {
        body: {
          membership_id: membershipId,
          full_name: datos.fullName,
          phone: datos.phone,
          status: datos.status,
        },
      },
    )
    if (error) throw await extraerErrorFuncion(error)
    if (!data) throw new Error('update-member-profile no devolvió datos.')

    await cargarMiembros(tenantId)
    return data
  }

  function limpiar(): void {
    miembros.value = []
  }

  return { miembros, loading, cargarMiembros, cambiarRol, revocar, actualizarPerfil, limpiar }
})
