/**
 * T-SEC-06, T-SEC-06b — PLAN §12.2 / Fase I §6.3 SEC-06
 * Un usuario no puede auto-asignarse rol ni activar is_platform_admin.
 * Prueba el trigger guard_privileged_columns (migración 20260813190400).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  clienteAdmin,
  clienteComo,
  eliminarUsuario,
  leerEntorno,
  crearUsuario,
  type Cliente,
  type UsuarioPrueba,
} from './helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/rls/privileged-columns-guard: faltan credenciales Supabase en .env')
}

d('SEC-06: columnas privilegiadas de profiles no son auto-modificables', () => {
  const admin = clienteAdmin(env!)
  let usuario: UsuarioPrueba
  let cliente: Cliente

  beforeAll(async () => {
    usuario = await crearUsuario(admin, 'privilegios')
    cliente = await clienteComo(env!, usuario)
  }, 30_000)

  afterAll(async () => {
    await eliminarUsuario(admin, usuario.id)
  }, 30_000)

  it('T-SEC-06: no puede activar su propio is_platform_admin', async () => {
    const { error } = await cliente
      .from('profiles')
      .update({ is_platform_admin: true })
      .eq('id', usuario.id)

    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/PRIVILEGE_ESCALATION/)

    const { data: verificacion } = await admin
      .from('profiles')
      .select('is_platform_admin')
      .eq('id', usuario.id)
      .single()
    expect(verificacion?.is_platform_admin).toBe(false)
  })

  it('T-SEC-06b: no puede cambiar su propio status', async () => {
    const { error } = await cliente
      .from('profiles')
      .update({ status: 'suspended' })
      .eq('id', usuario.id)

    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/PRIVILEGE_ESCALATION/)
  })

  it('no puede modificar su email (espejo de auth.users)', async () => {
    const { error } = await cliente
      .from('profiles')
      .update({ email: 'otro@example.test' })
      .eq('id', usuario.id)

    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/INVALID_UPDATE/)
  })

  it('control positivo: sí puede actualizar una columna no privilegiada', async () => {
    const { error } = await cliente
      .from('profiles')
      .update({ full_name: 'Nombre de prueba actualizado' })
      .eq('id', usuario.id)

    expect(error).toBeNull()

    const { data: verificacion } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', usuario.id)
      .single()
    expect(verificacion?.full_name).toBe('Nombre de prueba actualizado')
  })
})
