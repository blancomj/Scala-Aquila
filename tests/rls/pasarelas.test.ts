/**
 * pasarela_config / pasarela_credencial / pasarela_config_metodo —
 * 20260904100000, estructura multi-pasarela de pago.
 *
 * El test más importante de todo el módulo es "una credencial no se puede
 * leer": pasarela_credencial tiene RLS enable+force y CERO políticas para
 * `authenticated`, así que ningún usuario con sesión — ni el administrador
 * del propio tenant — puede leerla. Si alguien "arregla" esa ausencia
 * pensando que fue un olvido, este archivo falla.
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
  console.warn('SALTADO tests/rls/pasarelas: faltan variables de Supabase en .env')
}

d('RLS de pasarelas de pago', () => {
  let admin: Cliente
  let tenantA: TenantPrueba
  let tenantB: TenantPrueba
  let adminA: UsuarioPrueba
  let auditorA: UsuarioPrueba
  let agenteB: UsuarioPrueba
  let configA: string

  beforeAll(async () => {
    admin = clienteAdmin(env!)
    tenantA = await crearTenant(admin, 'pasarela-a')
    tenantB = await crearTenant(admin, 'pasarela-b')
    adminA = await crearUsuario(admin, 'pasarela-admin-a')
    auditorA = await crearUsuario(admin, 'pasarela-auditor-a')
    agenteB = await crearUsuario(admin, 'pasarela-agente-b')
    await crearMembership(admin, tenantA.id, adminA.id, 'administrador')
    await crearMembership(admin, tenantA.id, auditorA.id, 'auditor')
    await crearMembership(admin, tenantB.id, agenteB.id, 'auxiliar')

    const { data, error } = await admin
      .from('pasarela_config')
      .insert({ tenant_id: tenantA.id, proveedor: 'wompi', identificador_publico: 'pub_test_x' })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture pasarela_config: ${error.message}`)
    configA = data.id

    // Credencial real vía la función puente (usa Vault) — así el test de
    // "no se puede leer" corre contra una fila que sí existe.
    const { error: errorCred } = await admin.rpc('fn_guardar_credencial_pasarela', {
      p_config_id: configA,
      p_tenant_id: tenantA.id,
      p_nombre: 'private_key',
      p_valor: 'prv_test_valor_secreto',
      p_actor_id: adminA.id,
    })
    if (errorCred) throw new Error(`fixture credencial: ${errorCred.message}`)
  }, 60_000)

  afterAll(async () => {
    if (!env) return
    await eliminarTenant(admin, tenantA.id)
    await eliminarTenant(admin, tenantB.id)
    await eliminarUsuario(admin, adminA.id)
    await eliminarUsuario(admin, auditorA.id)
    await eliminarUsuario(admin, agenteB.id)
  }, 60_000)

  it('un miembro ve la configuración de su copropiedad', async () => {
    const cliente = await clienteComo(env!, adminA)
    const { data } = await cliente.from('pasarela_config').select('id, proveedor')
    expect(data?.map((c) => c.id)).toContain(configA)
  })

  it('SEC-11 · el tenant B no ve la configuración del tenant A', async () => {
    const cliente = await clienteComo(env!, agenteB)
    const { data } = await cliente.from('pasarela_config').select('id').eq('id', configA)
    expect(data ?? []).toHaveLength(0)
  })

  it('NINGÚN usuario autenticado puede leer pasarela_credencial', async () => {
    // Ni el administrador del propio tenant. No es un descuido de políticas:
    // es la propiedad que hace que una credencial guardada no tenga forma de
    // salir. Ver el COMMENT ON TABLE de 20260904100000.
    for (const usuario of [adminA, auditorA, agenteB]) {
      const cliente = await clienteComo(env!, usuario)
      const { data } = await cliente.from('pasarela_credencial').select('*')
      expect(data ?? []).toHaveLength(0)
    }
  })

  it('un usuario autenticado tampoco puede escribir en pasarela_credencial', async () => {
    const cliente = await clienteComo(env!, adminA)
    const { error } = await cliente.from('pasarela_credencial').insert({
      config_id: configA,
      tenant_id: tenantA.id,
      nombre: 'inyectada',
      vault_secret_id: crypto.randomUUID(),
    })
    expect(error).not.toBeNull()
  })

  it('la función de nombres devuelve el nombre pero nunca el valor', async () => {
    const cliente = await clienteComo(env!, adminA)
    const { data, error } = await cliente.rpc('fn_pasarela_credenciales_presentes', {
      p_tenant_id: tenantA.id,
    })
    expect(error).toBeNull()
    expect(data?.map((f) => f.nombre)).toContain('private_key')
    // La proyección es (config_id, nombre): no hay ninguna columna con el
    // valor ni con el id del secreto en Vault.
    expect(JSON.stringify(data)).not.toContain('prv_test_valor_secreto')
    expect(Object.keys(data?.[0] ?? {}).sort()).toEqual(['config_id', 'nombre'])
  })

  it('un auditor no puede escribir configuración de pasarela', async () => {
    const cliente = await clienteComo(env!, auditorA)
    const { error } = await cliente
      .from('pasarela_config')
      .insert({ tenant_id: tenantA.id, proveedor: 'payu' })
    expect(error).not.toBeNull()
  })

  it('un administrador sí puede escribir configuración (superconjunto de auxiliar)', async () => {
    const cliente = await clienteComo(env!, adminA)
    const { data, error } = await cliente
      .from('pasarela_config')
      .insert({ tenant_id: tenantA.id, proveedor: 'epayco' })
      .select('id')
      .single<{ id: string }>()
    expect(error).toBeNull()
    expect(data?.id).toBeTruthy()
  })

  it('no se puede tener dos configuraciones del mismo proveedor en un tenant', async () => {
    const { error } = await admin
      .from('pasarela_config')
      .insert({ tenant_id: tenantA.id, proveedor: 'wompi' })
    expect(error).not.toBeNull()
  })
})
