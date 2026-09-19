/**
 * Roles funcionales — dimensión ver/actuar (Fase 1 sobre el mockup de
 * referencia). `puede_actuar_en_modulo()` (20260951000000) es la hermana
 * de `puede_ver_modulo()` que faltaba: gatea insert/update, no solo select.
 *
 * Mismo patrón que roles-funcionales-builder.test.ts: cada `it` crea su
 * propio tenant/usuario y limpia al final.
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
  console.warn('SALTADO tests/rls/roles-funcionales-accion: faltan credenciales Supabase en .env')
}

async function asignarRolFuncionalConAccion(
  admin: ReturnType<typeof clienteAdmin>,
  tenantId: string,
  membershipId: string,
  codigoRol: string,
  modulo: string,
  accion: 'ver' | 'actuar',
): Promise<void> {
  const { data: rol, error: errorRol } = await admin
    .from('lista_tipos')
    .insert({ tipo: 'ROL_FUNCIONAL', tenant_id: tenantId, codigo: codigoRol, nombre: codigoRol })
    .select('id')
    .single()
  if (errorRol) throw errorRol

  const { error: errorModulo } = await admin
    .from('rol_funcional_modulo')
    .insert({ lista_tipos_id: rol!.id, modulo, accion })
  if (errorModulo) throw errorModulo

  const { error: errorAsignar } = await admin
    .from('membership_roles_funcionales')
    .insert({ membership_id: membershipId, rol_funcional_id: rol!.id })
  if (errorAsignar) throw errorAsignar
}

d('Roles funcionales — accion ver/actuar (puede_actuar_en_modulo)', () => {
  const admin = clienteAdmin(env!)

  it('§1 función — accion=ver da false, accion=actuar da true, para el mismo módulo', async () => {
    const usuario = await crearUsuario(admin, 'accion-ver-vs-actuar')
    const tenant = await crearTenant(admin, 'accion-ver-vs-actuar', usuario.id)
    const membershipId = await crearMembership(admin, tenant.id, usuario.id, 'auxiliar')
    await asignarRolFuncionalConAccion(admin, tenant.id, membershipId, 'solo_ve_financiero', 'financiero', 'ver')

    const cliente = await clienteComo(env!, usuario)
    const { data: puedeActuar, error } = await cliente.rpc('puede_actuar_en_modulo', {
      p_tenant: tenant.id,
      p_modulo: 'financiero',
    })
    expect(error).toBeNull()
    expect(puedeActuar).toBe(false)

    // Sigue viendo — accion no afecta puede_ver_modulo.
    const { data: puedeVer } = await cliente.rpc('puede_ver_modulo', {
      p_tenant: tenant.id,
      p_modulo: 'financiero',
    })
    expect(puedeVer).toBe(true)

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, usuario.id)
  }, 30_000)

  it('§1 función — accion=actuar sí da true', async () => {
    const usuario = await crearUsuario(admin, 'accion-actuar')
    const tenant = await crearTenant(admin, 'accion-actuar', usuario.id)
    const membershipId = await crearMembership(admin, tenant.id, usuario.id, 'auxiliar')
    await asignarRolFuncionalConAccion(admin, tenant.id, membershipId, 'actua_financiero', 'financiero', 'actuar')

    const cliente = await clienteComo(env!, usuario)
    const { data, error } = await cliente.rpc('puede_actuar_en_modulo', {
      p_tenant: tenant.id,
      p_modulo: 'financiero',
    })
    expect(error).toBeNull()
    expect(data).toBe(true)

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, usuario.id)
  }, 30_000)

  it('§1 función — sin ningún rol funcional, compatibilidad: puede_actuar_en_modulo da true', async () => {
    const usuario = await crearUsuario(admin, 'accion-sin-rol')
    const tenant = await crearTenant(admin, 'accion-sin-rol', usuario.id)
    await crearMembership(admin, tenant.id, usuario.id, 'auxiliar')

    const cliente = await clienteComo(env!, usuario)
    const { data, error } = await cliente.rpc('puede_actuar_en_modulo', {
      p_tenant: tenant.id,
      p_modulo: 'juridico',
    })
    expect(error).toBeNull()
    expect(data).toBe(true)

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, usuario.id)
  }, 30_000)

  it('§1 función — administrador siempre true, incluso con un rol funcional en accion=ver', async () => {
    const usuario = await crearUsuario(admin, 'accion-admin')
    const tenant = await crearTenant(admin, 'accion-admin', usuario.id)
    const membershipId = await crearMembership(admin, tenant.id, usuario.id, 'administrador')
    await asignarRolFuncionalConAccion(admin, tenant.id, membershipId, 've_financiero_admin', 'financiero', 'ver')

    const cliente = await clienteComo(env!, usuario)
    const { data, error } = await cliente.rpc('puede_actuar_en_modulo', {
      p_tenant: tenant.id,
      p_modulo: 'financiero',
    })
    expect(error).toBeNull()
    expect(data).toBe(true)

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, usuario.id)
  }, 30_000)

  it('§2 extremo a extremo — accion=ver bloquea el INSERT real en politicas_financieras', async () => {
    const usuario = await crearUsuario(admin, 'insert-bloqueado-ver')
    const tenant = await crearTenant(admin, 'insert-bloqueado-ver', usuario.id)
    const membershipId = await crearMembership(admin, tenant.id, usuario.id, 'auxiliar')
    await asignarRolFuncionalConAccion(admin, tenant.id, membershipId, 've_pero_no_actua', 'financiero', 'ver')

    const cliente = await clienteComo(env!, usuario)
    const { data, error } = await cliente
      .from('politicas_financieras')
      .insert({ tenant_id: tenant.id, version: 1, policy_hash: 'hash-bloqueado' })
      .select('id')
    expect(error).not.toBeNull()
    expect(data).toBeNull()

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, usuario.id)
  }, 30_000)

  it('§2 extremo a extremo — accion=actuar sí permite el INSERT real en politicas_financieras', async () => {
    const usuario = await crearUsuario(admin, 'insert-permitido-actuar')
    const tenant = await crearTenant(admin, 'insert-permitido-actuar', usuario.id)
    const membershipId = await crearMembership(admin, tenant.id, usuario.id, 'auxiliar')
    await asignarRolFuncionalConAccion(admin, tenant.id, membershipId, 'actua_financiero_2', 'financiero', 'actuar')

    const cliente = await clienteComo(env!, usuario)
    const { data, error } = await cliente
      .from('politicas_financieras')
      .insert({ tenant_id: tenant.id, version: 1, policy_hash: 'hash-permitido' })
      .select('id')
    expect(error).toBeNull()
    expect(data).toHaveLength(1)

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, usuario.id)
  }, 30_000)

  it('§3 regresión de compatibilidad — un auxiliar sin ningún rol funcional sigue pudiendo insertar', async () => {
    const usuario = await crearUsuario(admin, 'compat-sin-rol-funcional')
    const tenant = await crearTenant(admin, 'compat-sin-rol-funcional', usuario.id)
    await crearMembership(admin, tenant.id, usuario.id, 'auxiliar')

    const cliente = await clienteComo(env!, usuario)
    const { data, error } = await cliente
      .from('politicas_financieras')
      .insert({ tenant_id: tenant.id, version: 1, policy_hash: 'hash-compat' })
      .select('id')
    expect(error).toBeNull()
    expect(data).toHaveLength(1)

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, usuario.id)
  }, 30_000)

  it('§ builder — un administrador puede cambiar la accion de un módulo ya cubierto (UPDATE)', async () => {
    const usuario = await crearUsuario(admin, 'cambiar-accion')
    const tenant = await crearTenant(admin, 'cambiar-accion', usuario.id)
    await crearMembership(admin, tenant.id, usuario.id, 'administrador')

    const { data: rol, error: errorRol } = await admin
      .from('lista_tipos')
      .insert({ tipo: 'ROL_FUNCIONAL', tenant_id: tenant.id, codigo: 'cambia_accion', nombre: 'Cambia accion' })
      .select('id')
      .single()
    expect(errorRol).toBeNull()

    const { error: errorInsertModulo } = await admin
      .from('rol_funcional_modulo')
      .insert({ lista_tipos_id: rol!.id, modulo: 'financiero', accion: 'ver' })
    expect(errorInsertModulo).toBeNull()

    const cliente = await clienteComo(env!, usuario)
    const { data, error } = await cliente
      .from('rol_funcional_modulo')
      .update({ accion: 'actuar' })
      .eq('lista_tipos_id', rol!.id)
      .eq('modulo', 'financiero')
      .select('accion')
    expect(error).toBeNull()
    expect(data).toEqual([{ accion: 'actuar' }])

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, usuario.id)
  }, 30_000)
})
