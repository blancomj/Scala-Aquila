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
import {
  ROLE_PERMISSIONS,
  hasPermission,
  type Permission,
  type TenantRole,
} from '~/types/permissions'

type TenantRow = Database['public']['Tables']['tenants']['Row']
type MembershipRow = Database['public']['Tables']['memberships']['Row']
type RolFuncionalEmbebido = {
  rol_funcional: { codigo: string; modulos: { modulo: string }[] } | null
}
type Membresia = MembershipRow & {
  tenant: TenantRow
  roles_funcionales: RolFuncionalEmbebido[]
}

interface CrearTenantRespuesta {
  tenant: TenantRow
  membership: MembershipRow
}

export const useTenantStore = defineStore('tenant', () => {
  // shallowRef: `tenant.settings` es `Json` (tipo recursivo). `ref<T>` fuerza
  // a Vue a des-envolver profundamente vía UnwrapRef, lo que dispara
  // "Type instantiation is excessively deep" en vue-tsc. No mutamos campos
  // anidados reactivamente — siempre reemplazamos el arreglo entero.
  const memberships = shallowRef<Membresia[]>([])
  const loading = ref(false)

  // §7.1/§10.3: el rol viene de la membership de la copropiedad ACTIVA
  // (profiles.active_tenant_id), no de una membership cualquiera — un
  // usuario puede tener roles distintos en copropiedades distintas.
  const membresiaActiva = computed<Membresia | null>(() => {
    const authStore = useAuthStore()
    const tenantId = authStore.profile?.active_tenant_id
    if (!tenantId) return null
    return memberships.value.find((m) => m.tenant_id === tenantId) ?? null
  })

  const activeTenant = computed<TenantRow | null>(() => membresiaActiva.value?.tenant ?? null)
  const role = computed<TenantRole | null>(() => membresiaActiva.value?.role ?? null)
  const permissions = computed<readonly Permission[]>(() =>
    role.value ? ROLE_PERMISSIONS[role.value] : [],
  )

  function puede(permiso: Permission): boolean {
    return role.value !== null && hasPermission(role.value, permiso)
  }

  // Espejo en TS de public.puede_ver_modulo() (20260830130000) — mismo
  // criterio: administrador ve todo; sin roles funcionales asignados, sin
  // cambios (compat); con al menos uno, queda acotado a lo que cubran.
  // Solo gatea visibilidad de UI — la RLS real es la barrera, esto evita
  // parpadeo de módulos que igual devolverían 0 filas.
  const modulosRolFuncional = computed<Set<string>>(() => {
    const modulos = new Set<string>()
    for (const rf of membresiaActiva.value?.roles_funcionales ?? []) {
      for (const m of rf.rol_funcional?.modulos ?? []) modulos.add(m.modulo)
    }
    return modulos
  })

  function puedeVerModulo(modulo: string): boolean {
    if (role.value === 'administrador') return true
    if ((membresiaActiva.value?.roles_funcionales.length ?? 0) === 0) return true
    return modulosRolFuncional.value.has(modulo)
  }

  async function cargarMemberships(): Promise<Membresia[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      // memberships_select_miembro (RLS) da visibilidad a TODAS las membresías de cualquier
      // tenant del que el usuario sea parte (correcto para una vista de "miembros del equipo"),
      // no solo a las propias — sin este filtro, un usuario en un tenant con más miembros ve
      // también las filas de membership de esos otros usuarios. Bug real encontrado en vivo: la
      // fila ajena contaminaba tanto "Mis copropiedades" (tenant listado dos veces) como
      // membresiaActiva (`.find()` podía resolver al rol de OTRO usuario, no el propio).
      const {
        data: { user: usuario },
      } = await cliente.auth.getUser()
      if (!usuario) {
        memberships.value = []
        return memberships.value
      }

      const { data, error: errorMemberships } = await cliente
        .from('memberships')
        .select(
          '*, tenant:tenants(*), ' +
            'roles_funcionales:membership_roles_funcionales(' +
            'rol_funcional:lista_tipos(codigo, modulos:rol_funcional_modulo(modulo)))',
        )
        .eq('status', 'active')
        .eq('user_id', usuario.id)
      if (errorMemberships) throw errorMemberships
      memberships.value = (data ?? []) as unknown as Membresia[]
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

  return {
    memberships,
    loading,
    activeTenant,
    role,
    permissions,
    puede,
    puedeVerModulo,
    cargarMemberships,
    crearTenant,
    cambiarTenant,
    limpiar,
  }
})
