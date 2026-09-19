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
// 'ver' | 'actuar' — dimensión ver/actuar (20260951000000). 'actuar' implica
// 'ver' de forma natural en el servidor (puede_ver_modulo no mira accion);
// aquí se refleja igual, un módulo cubierto siempre "se ve" sin importar su accion.
export type AccionRolFuncional = Database['public']['Enums']['rol_funcional_accion_t']
export interface ModuloDeRol {
  modulo: string
  accion: AccionRolFuncional
}
export interface RolFuncionalConModulos extends RolFuncional {
  modulos: ModuloDeRol[]
}
// Builder de roles funcionales (seguridad/index.vue) — a diferencia de
// RolFuncionalConModulos (solo catálogo de plataforma, tenant_id IS NULL),
// esto incluye también los roles propios del tenant activo, y los campos
// que el builder necesita para editar/desactivar/borrar.
export interface RolFuncionalTenant extends RolFuncionalConModulos {
  descripcion: string | null
  activo: boolean
  tenantId: string | null
}
export type ModuloCobertura = Database['public']['Views']['v_modulo_cobertura']['Row']
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
  const rolesFuncionalesTenant = shallowRef<RolFuncionalTenant[]>([])
  const coberturaModulos = shallowRef<ModuloCobertura[]>([])
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

  // Catálogo ROL_FUNCIONAL asignable a un miembro (MiembroDrawer.vue) —
  // plataforma (20260830120000) + los que el propio tenant haya creado con
  // el builder (§A3, PROMPT_PERMISOS_CAPA2.md). Antes de §A3 solo existían
  // roles de plataforma, así que este catálogo bastaba con `tenant_id is
  // null`; ahora un rol creado por este tenant no aparecería nunca como
  // asignable si se mantuviera ese filtro — quedaría creado pero huérfano.
  async function cargarCatalogoRolesFuncionales(tenantId?: string): Promise<RolFuncional[]> {
    if (rolesFuncionalesCatalogo.value.length > 0) return rolesFuncionalesCatalogo.value
    const cliente = useSupabaseClient<Database>()
    // Un solo shape de builder (evita reasignar `consulta` con un `if`, que
    // dispara TS2589 "type instantiation excessively deep" en el resto del
    // typecheck de apps/web — el filtro condicional va en el STRING de
    // `.or()`, no en la forma del builder).
    const filtroTenant = tenantId ? `tenant_id.is.null,tenant_id.eq.${tenantId}` : 'tenant_id.is.null'
    const { data, error } = await cliente
      .from('lista_tipos')
      .select('id, codigo, nombre')
      .eq('tipo', 'ROL_FUNCIONAL')
      .or(filtroTenant)
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
      .select('id, codigo, nombre, rol_funcional_modulo(modulo, accion)')
      .eq('tipo', 'ROL_FUNCIONAL')
      .is('tenant_id', null)
      .order('orden')
    if (error) throw error
    rolesFuncionalesConModulos.value = (
      (data ?? []) as unknown as (RolFuncional & { rol_funcional_modulo: ModuloDeRol[] })[]
    ).map((fila) => ({
      id: fila.id,
      codigo: fila.codigo,
      nombre: fila.nombre,
      modulos: fila.rol_funcional_modulo,
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

  // ── Builder de roles funcionales (PROMPT_PERMISOS_CAPA2.md §A3) ────────
  //
  //  A diferencia de cargarCatalogoRolesFuncionalesConModulos (solo lectura,
  //  solo plataforma), esto trae también los roles tenant_id propios, y lo
  //  usa /seguridad para la sección de edición (visible solo si
  //  tenantStore.role === 'administrador' — la RLS de abajo es la barrera
  //  real, ver 20260950000000).

  function generarCodigoRol(nombre: string): string {
    return nombre
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
  }

  async function cargarRolesFuncionalesTenant(tenantId: string): Promise<RolFuncionalTenant[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('lista_tipos')
      .select('id, codigo, nombre, descripcion, activo, tenant_id, rol_funcional_modulo(modulo, accion)')
      .eq('tipo', 'ROL_FUNCIONAL')
      .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
      .order('orden')
    if (error) throw error
    rolesFuncionalesTenant.value = (
      (data ?? []) as unknown as (RolFuncional & {
        descripcion: string | null
        activo: boolean
        tenant_id: string | null
        rol_funcional_modulo: ModuloDeRol[]
      })[]
    ).map((fila) => ({
      id: fila.id,
      codigo: fila.codigo,
      nombre: fila.nombre,
      descripcion: fila.descripcion,
      activo: fila.activo,
      tenantId: fila.tenant_id,
      modulos: fila.rol_funcional_modulo,
    }))
    return rolesFuncionalesTenant.value
  }

  async function cargarCoberturaModulos(): Promise<ModuloCobertura[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('v_modulo_cobertura')
      .select('codigo, nombre, orden, tiene_rol_que_lo_cubre')
      .order('orden')
    if (error) throw error
    coberturaModulos.value = data ?? []
    return coberturaModulos.value
  }

  async function crearRolFuncional(
    tenantId: string,
    datos: { nombre: string; descripcion: string | null },
  ): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente.from('lista_tipos').insert({
      tipo: 'ROL_FUNCIONAL',
      tenant_id: tenantId,
      codigo: generarCodigoRol(datos.nombre),
      nombre: datos.nombre,
      descripcion: datos.descripcion,
    })
    if (error) throw error
    await cargarRolesFuncionalesTenant(tenantId)
  }

  async function actualizarRolFuncional(
    id: number,
    datos: { nombre: string; descripcion: string | null },
    tenantId: string,
  ): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente
      .from('lista_tipos')
      .update({ nombre: datos.nombre, descripcion: datos.descripcion })
      .eq('id', id)
    if (error) throw error
    await cargarRolesFuncionalesTenant(tenantId)
  }

  async function establecerActivoRolFuncional(
    id: number,
    activo: boolean,
    tenantId: string,
  ): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente.from('lista_tipos').update({ activo }).eq('id', id)
    if (error) throw error
    await cargarRolesFuncionalesTenant(tenantId)
  }

  /** Cuántas membresías tienen asignado este rol — para el aviso previo a borrar (§A3 guarda 1). */
  async function contarAsignacionesRolFuncional(id: number): Promise<number> {
    const cliente = useSupabaseClient<Database>()
    const { count, error } = await cliente
      .from('membership_roles_funcionales')
      .select('id', { count: 'exact', head: true })
      .eq('rol_funcional_id', id)
    if (error) throw error
    return count ?? 0
  }

  async function eliminarRolFuncional(id: number, tenantId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const asignaciones = await contarAsignacionesRolFuncional(id)
    if (asignaciones > 0) {
      throw new Error(
        `No se puede eliminar: ${asignaciones} miembro${asignaciones === 1 ? '' : 's'} ${
          asignaciones === 1 ? 'tiene' : 'tienen'
        } este rol asignado. Quítaselo primero desde su ficha.`,
      )
    }
    const { error } = await cliente.from('lista_tipos').delete().eq('id', id)
    if (error) throw error
    await cargarRolesFuncionalesTenant(tenantId)
  }

  async function agregarModuloARol(
    rolFuncionalId: number,
    modulo: string,
    tenantId: string,
    accion: AccionRolFuncional = 'ver',
  ): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente
      .from('rol_funcional_modulo')
      .insert({ lista_tipos_id: rolFuncionalId, modulo, accion })
    if (error) throw error
    await cargarRolesFuncionalesTenant(tenantId)
  }

  /** Cambia ver↔actuar de un módulo que el rol YA cubre (UPDATE, 20260951000000) — no
   * pasa por agregar/quitar, así se conserva la fila (y su fecha de asignación) tal cual. */
  async function cambiarAccionModulo(
    rolFuncionalId: number,
    modulo: string,
    accion: AccionRolFuncional,
    tenantId: string,
  ): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente
      .from('rol_funcional_modulo')
      .update({ accion })
      .eq('lista_tipos_id', rolFuncionalId)
      .eq('modulo', modulo)
    if (error) throw error
    await cargarRolesFuncionalesTenant(tenantId)
  }

  async function quitarModuloDeRol(
    rolFuncionalId: number,
    modulo: string,
    tenantId: string,
  ): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente
      .from('rol_funcional_modulo')
      .delete()
      .eq('lista_tipos_id', rolFuncionalId)
      .eq('modulo', modulo)
    if (error) throw error
    await cargarRolesFuncionalesTenant(tenantId)
  }

  function limpiar(): void {
    miembros.value = []
  }

  return {
    miembros,
    rolesFuncionalesCatalogo,
    rolesFuncionalesConModulos,
    rolesFuncionalesTenant,
    coberturaModulos,
    loading,
    cargarMiembros,
    cargarCatalogoRolesFuncionales,
    cargarCatalogoRolesFuncionalesConModulos,
    cargarRolesFuncionalesTenant,
    cargarCoberturaModulos,
    asignarRolFuncional,
    revocarRolFuncional,
    cambiarRol,
    revocar,
    actualizarPerfil,
    crearRolFuncional,
    actualizarRolFuncional,
    establecerActivoRolFuncional,
    contarAsignacionesRolFuncional,
    eliminarRolFuncional,
    agregarModuloARol,
    cambiarAccionModulo,
    quitarModuloDeRol,
    limpiar,
  }
})
