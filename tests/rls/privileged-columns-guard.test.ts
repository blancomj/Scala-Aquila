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

  // 20260908140000: conceder is_platform_admin se hace por fuera del producto
  // (service role o SQL, donde guard_privileged_columns no aplica porque
  // auth.uid() es null). Eso es deliberado, pero tiene que dejar rastro.
  it('SEC-06: conceder is_platform_admin por service role queda auditado', async () => {
    const { error: errorConcesion } = await admin
      .from('profiles')
      .update({ is_platform_admin: true })
      .eq('id', usuario.id)
    expect(errorConcesion).toBeNull()

    const { data: registro } = await admin
      .from('audit_log')
      .select('action, actor_id, tenant_id, metadata')
      .eq('entity_id', usuario.id)
      .eq('action', 'platform_admin.concedido')
      .maybeSingle()

    expect(registro).not.toBeNull()
    // Sin sesión: la ausencia de actor es la información — no lo hizo nadie
    // autenticado desde la aplicación.
    expect(registro?.actor_id).toBeNull()
    expect(registro?.tenant_id).toBeNull()
    expect(registro?.metadata).toMatchObject({ nuevo: true, via_sesion_autenticada: false })

    // Y la revocación también.
    await admin.from('profiles').update({ is_platform_admin: false }).eq('id', usuario.id)
    const { data: revocacion } = await admin
      .from('audit_log')
      .select('action')
      .eq('entity_id', usuario.id)
      .eq('action', 'platform_admin.revocado')
      .maybeSingle()
    expect(revocacion).not.toBeNull()
  })
})
