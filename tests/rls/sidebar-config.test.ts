/**
 * sidebar_config — orden del menú lateral personalizado por tenant
 * (20260937000000). A diferencia de ia_uso_mensual, aquí SÍ hay una ruta
 * de escritura para el cliente — pero restringida al rol 'administrador',
 * no a 'auxiliar' como el resto de tablas de configuración.
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
  console.warn('SALTADO tests/rls/sidebar-config: faltan variables de Supabase en .env')
}

d('RLS de sidebar_config', () => {
  let admin: Cliente
  let tenantA: TenantPrueba
  let tenantB: TenantPrueba
  let adminA: UsuarioPrueba
  let auxiliarA: UsuarioPrueba
  let auditorA: UsuarioPrueba
  let agenteB: UsuarioPrueba

  beforeAll(async () => {
    admin = clienteAdmin(env!)
    tenantA = await crearTenant(admin, 'sbconf-a')
    tenantB = await crearTenant(admin, 'sbconf-b')
    adminA = await crearUsuario(admin, 'sbconf-admin-a')
    auxiliarA = await crearUsuario(admin, 'sbconf-auxiliar-a')
    auditorA = await crearUsuario(admin, 'sbconf-auditor-a')
    agenteB = await crearUsuario(admin, 'sbconf-agente-b')
    await crearMembership(admin, tenantA.id, adminA.id, 'administrador')
    await crearMembership(admin, tenantA.id, auxiliarA.id, 'auxiliar')
    await crearMembership(admin, tenantA.id, auditorA.id, 'auditor')
    await crearMembership(admin, tenantB.id, agenteB.id, 'auxiliar')

    const { error } = await admin
      .from('sidebar_config')
      .insert({ tenant_id: tenantA.id, configuracion: { grupos: ['Finanzas'] } })
    if (error) throw new Error(`fixture sidebar_config: ${error.message}`)
  }, 60_000)

  afterAll(async () => {
    if (!env) return
    await eliminarTenant(admin, tenantA.id)
    await eliminarTenant(admin, tenantB.id)
    await eliminarUsuario(admin, adminA.id)
    await eliminarUsuario(admin, auxiliarA.id)
    await eliminarUsuario(admin, auditorA.id)
    await eliminarUsuario(admin, agenteB.id)
  }, 60_000)

  it('cualquier miembro del tenant ve su configuración', async () => {
    const cliente = await clienteComo(env!, auditorA)
    const { data, error } = await cliente
      .from('sidebar_config')
      .select('configuracion')
      .eq('tenant_id', tenantA.id)
      .single<{ configuracion: { grupos: string[] } }>()
    expect(error).toBeNull()
    expect(data?.configuracion.grupos).toEqual(['Finanzas'])
  })

  it('SEC-11 · el tenant B no ve la configuración del tenant A', async () => {
    const cliente = await clienteComo(env!, agenteB)
    const { data } = await cliente.from('sidebar_config').select('tenant_id').eq('tenant_id', tenantA.id)
    expect(data ?? []).toHaveLength(0)
  })

  it('un administrador puede actualizar la configuración', async () => {
    const cliente = await clienteComo(env!, adminA)
    const { error } = await cliente
      .from('sidebar_config')
      .update({ configuracion: { grupos: ['Cartera y Cobranza', 'Finanzas'] } })
      .eq('tenant_id', tenantA.id)
    expect(error).toBeNull()

    const { data } = await admin
      .from('sidebar_config')
      .select('configuracion')
      .eq('tenant_id', tenantA.id)
      .single<{ configuracion: { grupos: string[] } }>()
    expect(data?.configuracion.grupos).toEqual(['Cartera y Cobranza', 'Finanzas'])
  })

  it('un auxiliar NO puede actualizar la configuración (RLS filtra, no lanza error)', async () => {
    const cliente = await clienteComo(env!, auxiliarA)
    const { error } = await cliente
      .from('sidebar_config')
      .update({ configuracion: { grupos: ['no debería aplicar'] } })
      .eq('tenant_id', tenantA.id)
    expect(error).toBeNull()

    const { data } = await admin
      .from('sidebar_config')
      .select('configuracion')
      .eq('tenant_id', tenantA.id)
      .single<{ configuracion: { grupos: string[] } }>()
    expect(data?.configuracion.grupos).toEqual(['Cartera y Cobranza', 'Finanzas'])
  })

  it('un auxiliar tampoco puede insertar una fila nueva en otro tenant', async () => {
    const cliente = await clienteComo(env!, agenteB)
    const { error } = await cliente
      .from('sidebar_config')
      .insert({ tenant_id: tenantB.id, configuracion: {} })
    expect(error).not.toBeNull()
  })
})
