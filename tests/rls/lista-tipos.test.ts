/**
 * lista_tipos — 20260814160000_tipos_lista_tipos.sql.
 *
 * Cuatro invariantes: (1) un tenant ve las filas de plataforma
 * (tenant_id NULL) más las suyas, nunca las de otro tenant; (2) ningún
 * tenant puede editar ni borrar una fila de plataforma; (3) un agent sí
 * puede crear/editar/borrar sus propias filas; (4) un auditor no puede
 * escribir ninguna.
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
  console.warn('SALTADO tests/rls/lista-tipos: faltan variables de Supabase en .env')
}

d('lista_tipos: aislamiento y protección de filas de plataforma', () => {
  const admin = clienteAdmin(env!)
  let agenteUsuario: UsuarioPrueba
  let auditorUsuario: UsuarioPrueba
  let otroUsuario: UsuarioPrueba
  let tenant: TenantPrueba
  let otroTenant: TenantPrueba
  let clienteAgent: Cliente
  let clienteAuditor: Cliente
  let clienteOtro: Cliente
  let filaPlataformaId: number
  let filaPropiaId: number

  beforeAll(async () => {
    agenteUsuario = await crearUsuario(admin, 'lt-agent')
    auditorUsuario = await crearUsuario(admin, 'lt-auditor')
    otroUsuario = await crearUsuario(admin, 'lt-otro')
    tenant = await crearTenant(admin, 'lt', agenteUsuario.id)
    otroTenant = await crearTenant(admin, 'lt-otro', otroUsuario.id)
    await crearMembership(admin, tenant.id, agenteUsuario.id, 'agent')
    await crearMembership(admin, tenant.id, auditorUsuario.id, 'auditor')
    await crearMembership(admin, otroTenant.id, otroUsuario.id, 'agent')

    clienteAgent = await clienteComo(env!, agenteUsuario)
    clienteAuditor = await clienteComo(env!, auditorUsuario)
    clienteOtro = await clienteComo(env!, otroUsuario)

    const { data: filaPlataforma, error: errPlataforma } = await admin
      .from('lista_tipos')
      .select('id')
      .eq('tipo', 'TIPO_INMUEBLE')
      .eq('codigo', 'apartamento')
      .is('tenant_id', null)
      .single<{ id: number }>()
    if (errPlataforma) throw new Error(`fixture fila de plataforma: ${errPlataforma.message}`)
    filaPlataformaId = filaPlataforma.id

    const { data: filaPropia, error: errPropia } = await admin
      .from('lista_tipos')
      .insert({
        tipo: 'TIPO_INMUEBLE',
        codigo: 'penthouse',
        nombre: 'Penthouse',
        tenant_id: tenant.id,
      })
      .select('id')
      .single<{ id: number }>()
    if (errPropia) throw new Error(`fixture fila propia: ${errPropia.message}`)
    filaPropiaId = filaPropia.id
  }, 30_000)

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
    await eliminarTenant(admin, otroTenant.id)
    await eliminarUsuario(admin, agenteUsuario.id)
    await eliminarUsuario(admin, auditorUsuario.id)
    await eliminarUsuario(admin, otroUsuario.id)
  })

  it('un tenant ve las filas de plataforma más las suyas, no las de otro tenant', async () => {
    const { data, error } = await clienteAgent
      .from('lista_tipos')
      .select('id, tenant_id')
      .eq('tipo', 'TIPO_INMUEBLE')

    expect(error).toBeNull()
    const ids = (data ?? []).map((f) => f.id)
    expect(ids).toContain(filaPlataformaId)
    expect(ids).toContain(filaPropiaId)

    const { data: vistaOtro } = await clienteOtro
      .from('lista_tipos')
      .select('id')
      .eq('id', filaPropiaId)
    expect(vistaOtro).toEqual([])
  })

  it('ningún tenant puede editar una fila de plataforma (0 filas afectadas)', async () => {
    const { data, error } = await clienteAgent
      .from('lista_tipos')
      .update({ nombre: 'Hackeado' })
      .eq('id', filaPlataformaId)
      .select('id')

    expect(error).toBeNull()
    expect(data).toEqual([])

    const { data: verificacion } = await admin
      .from('lista_tipos')
      .select('nombre')
      .eq('id', filaPlataformaId)
      .single()
    expect(verificacion?.nombre).toBe('Apartamento')
  })

  it('ningún tenant puede borrar una fila de plataforma (0 filas afectadas)', async () => {
    const { data, error } = await clienteAgent
      .from('lista_tipos')
      .delete()
      .eq('id', filaPlataformaId)
      .select('id')

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('un agent sí puede editar y borrar sus propias filas', async () => {
    const { error: errUpdate } = await clienteAgent
      .from('lista_tipos')
      .update({ nombre: 'Penthouse Premium' })
      .eq('id', filaPropiaId)
    expect(errUpdate).toBeNull()

    const { error: errDelete } = await clienteAgent
      .from('lista_tipos')
      .delete()
      .eq('id', filaPropiaId)
    expect(errDelete).toBeNull()

    const { data: verificacion } = await admin
      .from('lista_tipos')
      .select('id')
      .eq('id', filaPropiaId)
      .maybeSingle()
    expect(verificacion).toBeNull()
  })

  it('un auditor no puede insertar filas', async () => {
    const { error } = await clienteAuditor
      .from('lista_tipos')
      .insert({ tipo: 'TIPO_INMUEBLE', codigo: 'x', nombre: 'X', tenant_id: tenant.id })

    expect(error).not.toBeNull()
  })
})
