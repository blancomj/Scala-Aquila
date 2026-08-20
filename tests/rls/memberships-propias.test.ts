/**
 * "Mis copropiedades" — regresión de un bug real encontrado en verificación
 * manual (sesión de presupuesto E9, no relacionado con presupuesto): dos
 * usuarios en el MISMO tenant, cada uno veía también la fila de membership
 * del OTRO al cargar "sus" copropiedades.
 *
 * Causa raíz: `memberships_select_miembro` (RLS) da visibilidad a TODAS las
 * membresías de cualquier tenant del que el usuario sea parte — correcto y
 * a propósito, es lo que necesita members.ts (vista de "miembros del
 * equipo", `/usuarios`). `tenantStore.cargarMemberships()`
 * (apps/web/app/stores/tenant.ts) reusaba esa misma tabla para "MIS
 * copropiedades" sin filtrar por `user_id` — con RLS sola, la fila ajena se
 * colaba. Consecuencia real, no solo cosmética: `membresiaActiva`
 * (`memberships.find(m => m.tenant_id === activeTenantId)`) podía resolver
 * al rol de OTRO usuario en vez del propio, dependiendo del orden de
 * llegada — permisos mostrados en la UI podían no corresponder al usuario
 * real de la sesión.
 *
 * Este archivo fija ambos comportamientos como regresión: (1) RLS sigue
 * dejando ver membresías ajenas del mismo tenant — sigue siendo el
 * comportamiento correcto, no se "arregla" aquí; (2) el mismo patrón de
 * consulta que usa cargarMemberships() (status='active' + user_id=propio)
 * sí aísla correctamente cada usuario de los demás miembros de su tenant.
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
  console.warn('SALTADO tests/rls/memberships-propias: faltan variables de Supabase en .env')
}

d('"Mis copropiedades" — aislamiento entre miembros del MISMO tenant', () => {
  const admin = clienteAdmin(env!)
  let agenteA: UsuarioPrueba
  let agenteB: UsuarioPrueba
  let tenantCompartido: TenantPrueba
  let clienteAgentA: Cliente
  let clienteAgentB: Cliente

  beforeAll(async () => {
    agenteA = await crearUsuario(admin, 'mp-agent-a')
    agenteB = await crearUsuario(admin, 'mp-agent-b')
    tenantCompartido = await crearTenant(admin, 'mp-compartido', agenteA.id)
    await crearMembership(admin, tenantCompartido.id, agenteA.id, 'auxiliar')
    await crearMembership(admin, tenantCompartido.id, agenteB.id, 'auditor')

    clienteAgentA = await clienteComo(env!, agenteA)
    clienteAgentB = await clienteComo(env!, agenteB)
  }, 30_000)

  afterAll(async () => {
    await eliminarTenant(admin, tenantCompartido.id)
    await eliminarUsuario(admin, agenteA.id)
    await eliminarUsuario(admin, agenteB.id)
  }, 30_000)

  it('RLS (a propósito, no es el bug): A ve también la membership de B en el tenant compartido', async () => {
    const { data, error } = await clienteAgentA
      .from('memberships')
      .select('id, user_id, role')
      .eq('tenant_id', tenantCompartido.id)
    expect(error).toBeNull()
    const userIds = (data ?? []).map((m) => m.user_id)
    expect(userIds).toContain(agenteA.id)
    expect(userIds).toContain(agenteB.id)
  })

  it('mismo patrón de cargarMemberships() (status + user_id propio): A ve solo su propia fila', async () => {
    const { data, error } = await clienteAgentA
      .from('memberships')
      .select('id, user_id, role, tenant:tenants(id)')
      .eq('status', 'active')
      .eq('user_id', agenteA.id)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data?.[0]?.user_id).toBe(agenteA.id)
    expect(data?.[0]?.role).toBe('auxiliar')
  })

  it('mismo patrón, del lado de B: ve solo su propia fila (rol auditor), no la de A', async () => {
    const { data, error } = await clienteAgentB
      .from('memberships')
      .select('id, user_id, role')
      .eq('status', 'active')
      .eq('user_id', agenteB.id)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data?.[0]?.user_id).toBe(agenteB.id)
    expect(data?.[0]?.role).toBe('auditor')
  })
})
