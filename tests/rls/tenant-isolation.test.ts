/**
 * T-SEC-03, T-SEC-04 — PLAN_MAESTRO_IMPLEMENTACION.md §12.2 / Fase I §6.3
 *
 * SEC-03: un usuario del tenant A obtiene 0 filas de cualquier tabla del B.
 * SEC-04: un usuario `anon` obtiene 0 filas de toda tabla de `public`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  clienteAdmin,
  clienteAnonimo,
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
    'SALTADO tests/rls/tenant-isolation: faltan SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY en .env',
  )
}

d('Aislamiento entre tenants (SEC-03) y rol anon (SEC-04)', () => {
  const admin = clienteAdmin(env!)
  let userA: UsuarioPrueba
  let userB: UsuarioPrueba
  let tenantA: TenantPrueba
  let tenantB: TenantPrueba
  let clienteA: Cliente

  beforeAll(async () => {
    userA = await crearUsuario(admin, 'user-a')
    userB = await crearUsuario(admin, 'user-b')
    tenantA = await crearTenant(admin, 'a', userA.id)
    tenantB = await crearTenant(admin, 'b', userB.id)
    await crearMembership(admin, tenantA.id, userA.id, 'agent')
    await crearMembership(admin, tenantB.id, userB.id, 'agent')
    clienteA = await clienteComo(env!, userA)
  }, 30_000)

  afterAll(async () => {
    await eliminarTenant(admin, tenantA.id)
    await eliminarTenant(admin, tenantB.id)
    await eliminarUsuario(admin, userA.id)
    await eliminarUsuario(admin, userB.id)
  }, 30_000)

  it('control positivo: A ve su propio tenant', async () => {
    const { data, error } = await clienteA.from('tenants').select('id').eq('id', tenantA.id)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('SEC-03: A no ve el tenant de B por SELECT directo', async () => {
    const { data, error } = await clienteA.from('tenants').select('id').eq('id', tenantB.id)
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('SEC-03: A no ve las membresías de B', async () => {
    const { data, error } = await clienteA
      .from('memberships')
      .select('id')
      .eq('tenant_id', tenantB.id)
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('SEC-03: A no ve el profile de B (sin tenant compartido)', async () => {
    const { data, error } = await clienteA.from('profiles').select('id').eq('id', userB.id)
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('SEC-03: A no puede actualizar el tenant de B (0 filas afectadas)', async () => {
    const { data, error } = await clienteA
      .from('tenants')
      .update({ name: 'hackeado' })
      .eq('id', tenantB.id)
      .select('id')
    expect(error).toBeNull()
    expect(data).toHaveLength(0)

    const { data: verificacion } = await admin
      .from('tenants')
      .select('name')
      .eq('id', tenantB.id)
      .single()
    expect(verificacion?.name).not.toBe('hackeado')
  })

  it('SEC-04: anon no ve ningún tenant', async () => {
    const anon = clienteAnonimo(env!)
    const { data, error } = await anon.from('tenants').select('id').eq('id', tenantA.id)
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('SEC-04: anon no ve ningún profile', async () => {
    const anon = clienteAnonimo(env!)
    const { data, error } = await anon.from('profiles').select('id')
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('SEC-04: anon no ve ninguna membership', async () => {
    const anon = clienteAnonimo(env!)
    const { data, error } = await anon.from('memberships').select('id')
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('SEC-04: anon no ve ningún audit_log', async () => {
    const anon = clienteAnonimo(env!)
    const { data, error } = await anon.from('audit_log').select('id')
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })
})
