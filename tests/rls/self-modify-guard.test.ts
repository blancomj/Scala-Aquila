/**
 * SELF_MODIFY — migración 20260814150000_guard_self_modify.sql (E6).
 * Ningún miembro puede cambiar su propio rol ni su propio status, ni
 * siquiera un `agent`. Se usa un tenant con 2 agents activos para que
 * `guard_last_agent` (SEC-07) no dispare primero y enmascare esta guarda.
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
  console.warn('SALTADO tests/rls/self-modify-guard: faltan credenciales Supabase en .env')
}

d('SELF_MODIFY: nadie puede modificar su propia membresía', () => {
  const admin = clienteAdmin(env!)

  it('bloquea que un agent cambie su propio rol, aunque haya otro agent activo', async () => {
    const uno = await crearUsuario(admin, 'self-rol-uno')
    const dos = await crearUsuario(admin, 'self-rol-dos')
    const tenant = await crearTenant(admin, 'self-rol', uno.id)
    const membresiaUno = await crearMembership(admin, tenant.id, uno.id, 'auxiliar')
    await crearMembership(admin, tenant.id, dos.id, 'auxiliar')

    const clienteUno = await clienteComo(env!, uno)
    const { error } = await clienteUno
      .from('memberships')
      .update({ role: 'auditor' })
      .eq('id', membresiaUno)

    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/SELF_MODIFY/)

    const { data: verificacion } = await admin
      .from('memberships')
      .select('role')
      .eq('id', membresiaUno)
      .single()
    expect(verificacion?.role).toBe('auxiliar')

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, uno.id)
    await eliminarUsuario(admin, dos.id)
  }, 30_000)

  it('bloquea que un agent revoque su propia membresía, aunque haya otro agent activo', async () => {
    const uno = await crearUsuario(admin, 'self-revoke-uno')
    const dos = await crearUsuario(admin, 'self-revoke-dos')
    const tenant = await crearTenant(admin, 'self-revoke', uno.id)
    const membresiaUno = await crearMembership(admin, tenant.id, uno.id, 'auxiliar')
    await crearMembership(admin, tenant.id, dos.id, 'auxiliar')

    const clienteUno = await clienteComo(env!, uno)
    const { error } = await clienteUno
      .from('memberships')
      .update({ status: 'revoked' })
      .eq('id', membresiaUno)

    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/SELF_MODIFY/)

    const { data: verificacion } = await admin
      .from('memberships')
      .select('status')
      .eq('id', membresiaUno)
      .single()
    expect(verificacion?.status).toBe('active')

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, uno.id)
    await eliminarUsuario(admin, dos.id)
  }, 30_000)

  it('control positivo: un agent sí puede modificar la membresía de otro', async () => {
    const uno = await crearUsuario(admin, 'self-otro-uno')
    const dos = await crearUsuario(admin, 'self-otro-dos')
    const tenant = await crearTenant(admin, 'self-otro', uno.id)
    await crearMembership(admin, tenant.id, uno.id, 'auxiliar')
    const membresiaDos = await crearMembership(admin, tenant.id, dos.id, 'auxiliar')

    const clienteUno = await clienteComo(env!, uno)
    const { error } = await clienteUno
      .from('memberships')
      .update({ role: 'auditor' })
      .eq('id', membresiaDos)

    expect(error).toBeNull()

    const { data: verificacion } = await admin
      .from('memberships')
      .select('role')
      .eq('id', membresiaDos)
      .single()
    expect(verificacion?.role).toBe('auditor')

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, uno.id)
    await eliminarUsuario(admin, dos.id)
  }, 30_000)
})
