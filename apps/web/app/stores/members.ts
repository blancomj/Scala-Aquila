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
export interface RolFuncional {
  id: number
  codigo: string
  nombre: string
}
export interface RolFuncionalConModulos extends RolFuncional {
  modulos: string[]
}
type Miembro = MembershipRow & {
  profile: Pick<ProfileRow, 'email' | 'full_name' | 'phone' | 'status'> | null
  roles_funcionales: { rol_funcional: RolFuncional | null }[]
}

interface ActualizarPerfilRespuesta {
  id: string
  full_name: string | null
  phone: string | null
  status: ProfileRow['status']
}

export const useMembersStore = defineStore('members', () => {
  const miembros = shallowRef<Miembro[]>([])
  const rolesFuncionalesCatalogo = shallowRef<RolFuncional[]>([])
  const rolesFuncionalesConModulos = shallowRef<RolFuncionalConModulos[]>([])
  const loading = ref(false)

  async function cargarMiembros(tenantId: string): Promise<Miembro[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: errorMiembros } = await cliente
        .from('memberships')
        // memberships tiene dos FK a profiles (user_id, invited_by) —
        // PostgREST necesita el hint de columna para no ser ambiguo.
        .select(
          '*, profile:profiles!user_id(email, full_name, phone, status), ' +
            'roles_funcionales:membership_roles_funcionales(rol_funcional:lista_tipos(id, codigo, nombre))',
        )
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .order('created_at', { ascending: true })
      if (errorMiembros) throw errorMiembros
      miembros.value = (data ?? []) as unknown as Miembro[]
      return miembros.value
    } finally {
      loading.value = false
    }
  }

  // Catálogo ROL_FUNCIONAL (20260830120000) — sembrado por plataforma,
  // no cambia por tenant, se carga una sola vez.
  async function cargarCatalogoRolesFuncionales(): Promise<RolFuncional[]> {
    if (rolesFuncionalesCatalogo.value.length > 0) return rolesFuncionalesCatalogo.value
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('lista_tipos')
      .select('id, codigo, nombre')
      .eq('tipo', 'ROL_FUNCIONAL')
      .is('tenant_id', null)
      .order('orden')
    if (error) throw error
    rolesFuncionalesCatalogo.value = data ?? []
    return rolesFuncionalesCatalogo.value
  }

  // Espejo del catálogo, con los módulos que cubre cada rol funcional
  // embebidos — usado por la página de Seguridad (solo lectura), separado
  // de rolesFuncionalesCatalogo (el drawer no necesita los módulos).
  async function cargarCatalogoRolesFuncionalesConModulos(): Promise<RolFuncionalConModulos[]> {
    if (rolesFuncionalesConModulos.value.length > 0) return rolesFuncionalesConModulos.value
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('lista_tipos')
      .select('id, codigo, nombre, rol_funcional_modulo(modulo)')
      .eq('tipo', 'ROL_FUNCIONAL')
      .is('tenant_id', null)
      .order('orden')
    if (error) throw error
    rolesFuncionalesConModulos.value = (
      (data ?? []) as unknown as (RolFuncional & { rol_funcional_modulo: { modulo: string }[] })[]
    ).map((fila) => ({
      id: fila.id,
      codigo: fila.codigo,
      nombre: fila.nombre,
      modulos: fila.rol_funcional_modulo.map((m) => m.modulo),
    }))
    return rolesFuncionalesConModulos.value
  }

  async function asignarRolFuncional(
    membershipId: string,
    rolFuncionalId: number,
    tenantId: string,
  ): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente
      .from('membership_roles_funcionales')
      .insert({ membership_id: membershipId, rol_funcional_id: rolFuncionalId })
    if (error) throw error
    await cargarMiembros(tenantId)
  }

  async function revocarRolFuncional(
    membershipId: string,
    rolFuncionalId: number,
    tenantId: string,
  ): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente
      .from('membership_roles_funcionales')
      .delete()
      .eq('membership_id', membershipId)
      .eq('rol_funcional_id', rolFuncionalId)
    if (error) throw error
    await cargarMiembros(tenantId)
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

  return {
    miembros,
    rolesFuncionalesCatalogo,
    rolesFuncionalesConModulos,
    loading,
    cargarMiembros,
    cargarCatalogoRolesFuncionales,
    cargarCatalogoRolesFuncionalesConModulos,
    asignarRolFuncional,
    revocarRolFuncional,
    cambiarRol,
    revocar,
    actualizarPerfil,
    limpiar,
  }
})
