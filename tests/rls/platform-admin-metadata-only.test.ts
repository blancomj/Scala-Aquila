/**
 * T-SEC-10 — PLAN §12.2 / Fase I §6.3 SEC-10
 * Un is_platform_admin sin membresía obtiene 0 filas de datos de tenant.
 * Su único acceso legítimo es platform_tenant_overview (solo metadatos).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  clienteAdmin,
  clienteComo,
  crearMembership,
  crearTenant,
  crearUsuario,
  eliminarTenant,
  eliminarUsuario,
  leerEntorno,
  type Cliente,
  type TenantPrueba,
  type UsuarioPrueba,
} from './helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn(
    'SALTADO tests/rls/platform-admin-metadata-only: faltan credenciales Supabase en .env',
  )
}

d('SEC-10: el admin de plataforma no accede a datos de tenant', () => {
  const admin = clienteAdmin(env!)
  let platformAdmin: UsuarioPrueba
  let clientePlatformAdmin: Cliente
  let dueno: UsuarioPrueba
  let tenant: TenantPrueba

  beforeAll(async () => {
    platformAdmin = await crearUsuario(admin, 'platform-admin')
    dueno = await crearUsuario(admin, 'dueno-tenant')
    tenant = await crearTenant(admin, 'visible', dueno.id)
    await crearMembership(admin, tenant.id, dueno.id, 'agent')

    // is_platform_admin se activa vía service_role (auth.uid() es NULL en
    // esa conexión, así que guard_privileged_columns lo permite: es
    // precisamente el cambio "fuera de banda" que el diseño contempla).
    const { error } = await admin
      .from('profiles')
      .update({ is_platform_admin: true })
      .eq('id', platformAdmin.id)
    if (error) throw new Error(`No se pudo preparar el fixture de admin: ${error.message}`)

    clientePlatformAdmin = await clienteComo(env!, platformAdmin)
  }, 30_000)

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, platformAdmin.id)
    await eliminarUsuario(admin, dueno.id)
  }, 30_000)

  it('NO ve filas en tenants (sin membresía)', async () => {
    const { data, error } = await clientePlatformAdmin
      .from('tenants')
      .select('id')
      .eq('id', tenant.id)
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('NO ve filas en memberships', async () => {
    const { data, error } = await clientePlatformAdmin
      .from('memberships')
      .select('id')
      .eq('tenant_id', tenant.id)
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('NO ve filas en invitations', async () => {
    const { data, error } = await clientePlatformAdmin
      .from('invitations')
      .select('id')
      .eq('tenant_id', tenant.id)
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('NO ve filas en audit_log', async () => {
    const { data, error } = await clientePlatformAdmin
      .from('audit_log')
      .select('id')
      .eq('tenant_id', tenant.id)
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  interface MetadatoTenant {
    id: string
    name: string
    slug: string
    status: string
    created_at: string
    member_count: number
    last_activity_at: string | null
  }

  it('SÍ ve el metadato del tenant en platform_tenant_overview', async () => {
    const { data, error } = await clientePlatformAdmin
      .from('platform_tenant_overview')
      .select('*')
      .eq('id', tenant.id)
      .single<MetadatoTenant>()

    expect(error).toBeNull()
    if (!data) throw new Error('platform_tenant_overview no devolvió el metadato esperado')
    expect(data.id).toBe(tenant.id)
    expect(data.member_count).toBe(1)

    // Verificación estructural: la vista no debe filtrar columnas de datos
    // operativos de la copropiedad, solo metadatos (SEC-10, comentario en
    // la migración 20260813190500).
    const columnasEsperadas = new Set([
      'id',
      'name',
      'slug',
      'status',
      'created_at',
      'member_count',
      'last_activity_at',
    ])
    expect(new Set(Object.keys(data))).toEqual(columnasEsperadas)
  })

  it('control negativo: un agent normal NO ve platform_tenant_overview de otro tenant', async () => {
    const clienteDueno = await clienteComo(env!, dueno)
    const { data, error } = await clienteDueno.from('platform_tenant_overview').select('id')
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })
})
