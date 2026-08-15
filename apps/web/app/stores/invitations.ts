/**
 * Estado de invitaciones — PROMPT_MAESTRO_FASE1.md §8, §9.2, E5.
 *
 * Las tres operaciones pasan por Edge Functions (invite-user,
 * accept-invitation, revoke-invitation) — `invitations` deniega
 * INSERT/UPDATE a todo rol vía RLS (solo Edge Function, ver
 * 20260813190300_rls_policies.sql), así que no hay una versión "directa"
 * como `cambiarTenant()` en stores/tenant.ts.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'
import type { TenantRole } from '~/types/permissions'

type InvitationRow = Database['public']['Tables']['invitations']['Row']

interface InvitarRespuesta {
  invitation_id: string
  expires_at: string
}

interface AceptarRespuesta {
  tenant_id: string
  role: TenantRole
}

export const useInvitationsStore = defineStore('invitations', () => {
  const pendientes = shallowRef<InvitationRow[]>([])
  const loading = ref(false)

  async function cargarPendientes(tenantId: string): Promise<InvitationRow[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: errorPendientes } = await cliente
        .from('invitations')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      if (errorPendientes) throw errorPendientes
      pendientes.value = data ?? []
      return pendientes.value
    } finally {
      loading.value = false
    }
  }

  async function invitar(
    tenantId: string,
    email: string,
    role: TenantRole,
  ): Promise<InvitarRespuesta> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorInvitar } = await cliente.functions.invoke<InvitarRespuesta>(
      'invite-user',
      {
        body: { tenant_id: tenantId, email, role },
      },
    )
    if (errorInvitar) throw await extraerErrorFuncion(errorInvitar)
    if (!data) throw new Error('invite-user no devolvió datos.')

    await cargarPendientes(tenantId)
    return data
  }

  async function revocar(invitationId: string, tenantId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error: errorRevocar } = await cliente.functions.invoke('revoke-invitation', {
      body: { invitation_id: invitationId },
    })
    if (errorRevocar) throw await extraerErrorFuncion(errorRevocar)

    await cargarPendientes(tenantId)
  }

  async function aceptar(token: string): Promise<AceptarRespuesta> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorAceptar } = await cliente.functions.invoke<AceptarRespuesta>(
      'accept-invitation',
      { body: { token } },
    )
    if (errorAceptar) throw await extraerErrorFuncion(errorAceptar)
    if (!data) throw new Error('accept-invitation no devolvió datos.')
    return data
  }

  function limpiar(): void {
    pendientes.value = []
  }

  return { pendientes, loading, cargarPendientes, invitar, revocar, aceptar, limpiar }
})
