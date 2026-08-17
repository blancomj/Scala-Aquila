/**
 * GAP-CAR-009 — Docs/Motor de gestion de cartera/CAR_00_Guia_Oficial.md §21/§24
 * 'administrador' (tenant_role_t) hereda los permisos de 'agent' vía
 * has_role() (20260822260000), y guard_last_agent() (SEC-07) protege a
 * la copropiedad si el único activo es un administrador sin agent.
 */
import { describe, expect, it } from 'vitest'
import {
  clienteAdmin,
  clienteComo,
  crearMembership,
  crearTenant,
  crearUsuario,
  eliminarTenant,
  eliminarUsuario,
  leerEntorno,
} from './helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/rls/rol-administrador: faltan credenciales Supabase en .env')
}

d('GAP-CAR-009: administrador hereda permisos de agent', () => {
  const admin = clienteAdmin(env!)

  it('has_role(tenant, [agent]) es true para un miembro con role=administrador', async () => {
    const usuario = await crearUsuario(admin, 'admin-hereda')
    const tenant = await crearTenant(admin, 'admin-hereda', usuario.id)
    await crearMembership(admin, tenant.id, usuario.id, 'administrador')
    const cliente = await clienteComo(env!, usuario)

    const { data, error } = await cliente.rpc('has_role', {
      p_tenant: tenant.id,
      p_roles: ['agent'],
    })

    expect(error).toBeNull()
    expect(data).toBe(true)

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, usuario.id)
  }, 30_000)

  it('has_role(tenant, [auditor]) sigue siendo false para un administrador (no hereda auditor por accidente)', async () => {
    const usuario = await crearUsuario(admin, 'admin-no-auditor')
    const tenant = await crearTenant(admin, 'admin-no-audit', usuario.id)
    await crearMembership(admin, tenant.id, usuario.id, 'administrador')
    const cliente = await clienteComo(env!, usuario)

    const { data, error } = await cliente.rpc('has_role', {
      p_tenant: tenant.id,
      p_roles: ['auditor'],
    })

    expect(error).toBeNull()
    expect(data).toBe(false)

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, usuario.id)
  }, 30_000)

  it('SEC-07 ampliado: bloquea revocar al único administrador activo cuando no hay ningún agent', async () => {
    const solo = await crearUsuario(admin, 'solo-admin')
    const tenant = await crearTenant(admin, 'solo-admin', solo.id)
    const membershipId = await crearMembership(admin, tenant.id, solo.id, 'administrador')
    const cliente = await clienteComo(env!, solo)

    const { error } = await cliente
      .from('memberships')
      .update({ status: 'revoked' })
      .eq('id', membershipId)

    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/LAST_AGENT/)

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, solo.id)
  }, 30_000)

  it('control positivo: un agent sí puede degradar al único administrador si el agent queda activo', async () => {
    const agente = await crearUsuario(admin, 'agent-junto')
    const administrador = await crearUsuario(admin, 'admin-junto')
    const tenant = await crearTenant(admin, 'agent-admin', agente.id)
    await crearMembership(admin, tenant.id, agente.id, 'agent')
    const membershipAdmin = await crearMembership(admin, tenant.id, administrador.id, 'administrador')

    const clienteAgente = await clienteComo(env!, agente)
    const { error } = await clienteAgente
      .from('memberships')
      .update({ status: 'revoked' })
      .eq('id', membershipAdmin)

    expect(error).toBeNull()

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, agente.id)
    await eliminarUsuario(admin, administrador.id)
  }, 30_000)
})
