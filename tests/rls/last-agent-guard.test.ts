/**
 * T-SEC-07 — PLAN §12.2 / Fase I §6.3 SEC-07
 * El último `agent` activo de una copropiedad no puede ser revocado ni degradado.
 * Prueba el trigger guard_last_agent (Docs/migración 20260813190400).
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
  type Cliente,
} from './helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/rls/last-agent-guard: faltan credenciales Supabase en .env')
}

d('SEC-07: guarda del último agent activo', () => {
  const admin = clienteAdmin(env!)

  it('bloquea degradar al único agent de la copropiedad', async () => {
    const solo = await crearUsuario(admin, 'solo-agent')
    const tenant = await crearTenant(admin, 'solo', solo.id)
    const membershipId = await crearMembership(admin, tenant.id, solo.id, 'agent')
    const cliente = await clienteComo(env!, solo)

    const { error } = await cliente
      .from('memberships')
      .update({ role: 'auditor' })
      .eq('id', membershipId)

    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/LAST_AGENT/)

    // Confirma que el estado en BD no cambió.
    const { data: verificacion } = await admin
      .from('memberships')
      .select('role')
      .eq('id', membershipId)
      .single()
    expect(verificacion?.role).toBe('agent')

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, solo.id)
  }, 30_000)

  it('bloquea revocar (status) al único agent activo', async () => {
    const solo = await crearUsuario(admin, 'solo-revoke')
    const tenant = await crearTenant(admin, 'revoke', solo.id)
    const membershipId = await crearMembership(admin, tenant.id, solo.id, 'agent')
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

  it('control positivo: permite degradar un agent si queda otro activo', async () => {
    const uno = await crearUsuario(admin, 'dup-uno')
    const dos = await crearUsuario(admin, 'dup-dos')
    const tenant = await crearTenant(admin, 'dup', uno.id)
    const membresiaUno = await crearMembership(admin, tenant.id, uno.id, 'agent')
    await crearMembership(admin, tenant.id, dos.id, 'agent')

    const clienteUno: Cliente = await clienteComo(env!, uno)
    const { error } = await clienteUno
      .from('memberships')
      .update({ role: 'auditor' })
      .eq('id', membresiaUno)

    expect(error).toBeNull()

    const { data: verificacion } = await admin
      .from('memberships')
      .select('role')
      .eq('id', membresiaUno)
      .single()
    expect(verificacion?.role).toBe('auditor')

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, uno.id)
    await eliminarUsuario(admin, dos.id)
  }, 30_000)
})
