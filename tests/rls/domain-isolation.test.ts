/**
 * SEC-11 — PLAN_MAESTRO_IMPLEMENTACION.md §4.4
 * Un usuario del tenant A obtiene 0 filas de cualquier tabla de dominio del B.
 *
 * No repite la matriz completa de tablas (sería redundante con
 * schema-forced-rls, que ya verifica SEC-13 vía pg_class): prueba una tabla
 * representativa de cada patrón de política — `inmuebles` (CRUD agent) y
 * `fondo_movimientos` (append-only, lectura agent+auditor) — más un control
 * positivo de que un miembro sí ve sus propios datos.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  clienteAdmin,
  clienteAnonimo,
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
  console.warn('SALTADO tests/rls/domain-isolation: faltan variables de Supabase en .env')
}

d('Aislamiento de dominio PH entre tenants (SEC-11/12)', () => {
  const admin = clienteAdmin(env!)
  let userA: UsuarioPrueba
  let userB: UsuarioPrueba
  let tenantA: TenantPrueba
  let tenantB: TenantPrueba
  let clienteA: Cliente
  let inmuebleAId: string
  let inmuebleBId: string

  beforeAll(async () => {
    userA = await crearUsuario(admin, 'dom-a')
    userB = await crearUsuario(admin, 'dom-b')
    tenantA = await crearTenant(admin, 'dom-a', userA.id)
    tenantB = await crearTenant(admin, 'dom-b', userB.id)
    await crearMembership(admin, tenantA.id, userA.id, 'agent')
    await crearMembership(admin, tenantB.id, userB.id, 'agent')
    clienteA = await clienteComo(env!, userA)

    // 'apartamento' ahora vive en lista_tipos (plataforma, tenant_id NULL) —
    // ver 20260814160000_tipos_lista_tipos.sql.
    const { data: tipoApartamento, error: errTipo } = await admin
      .from('lista_tipos')
      .select('id')
      .eq('tipo', 'TIPO_INMUEBLE')
      .eq('codigo', 'apartamento')
      .is('tenant_id', null)
      .single<{ id: number }>()
    if (errTipo) throw new Error(`fixture tipo_id apartamento: ${errTipo.message}`)

    const { data: inmA, error: errA } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenantA.id, codigo: 'INM-A', tipo_id: tipoApartamento.id })
      .select('id')
      .single<{ id: string }>()
    if (errA) throw new Error(`fixture inmueble A: ${errA.message}`)
    inmuebleAId = inmA.id

    const { data: inmB, error: errB } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenantB.id, codigo: 'INM-B', tipo_id: tipoApartamento.id })
      .select('id')
      .single<{ id: string }>()
    if (errB) throw new Error(`fixture inmueble B: ${errB.message}`)
    inmuebleBId = inmB.id

    const { data: fondoB, error: errFondoB } = await admin
      .from('fondos')
      .insert({ tenant_id: tenantB.id, tipo: 'imprevistos', nombre: 'Fondo B' })
      .select('id')
      .single<{ id: string }>()
    if (errFondoB) throw new Error(`fixture fondo B: ${errFondoB.message}`)

    await admin
      .from('fondo_movimientos')
      .insert({ tenant_id: tenantB.id, fondo_id: fondoB.id, tipo: 'aporte', monto: 1000 })
  }, 30_000)

  afterAll(async () => {
    await eliminarTenant(admin, tenantA.id)
    await eliminarTenant(admin, tenantB.id)
    await eliminarUsuario(admin, userA.id)
    await eliminarUsuario(admin, userB.id)
  }, 30_000)

  it('control positivo: A ve su propio inmueble', async () => {
    const { data, error } = await clienteA.from('inmuebles').select('id').eq('id', inmuebleAId)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('SEC-11: A no ve inmuebles de B', async () => {
    const { data, error } = await clienteA.from('inmuebles').select('id').eq('id', inmuebleBId)
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('SEC-11: A no ve fondo_movimientos de B', async () => {
    const { data, error } = await clienteA
      .from('fondo_movimientos')
      .select('id')
      .eq('tenant_id', tenantB.id)
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('SEC-11: A no puede actualizar un inmueble de B (0 filas afectadas)', async () => {
    const { data, error } = await clienteA
      .from('inmuebles')
      .update({ codigo: 'HACKEADO' })
      .eq('id', inmuebleBId)
      .select('id')
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('anon no ve ningún inmueble', async () => {
    const anon = clienteAnonimo(env!)
    const { data, error } = await anon.from('inmuebles').select('id')
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('fondo_movimientos es append-only: ni admin (service_role) puede editarlo', async () => {
    const { data: mov } = await admin
      .from('fondo_movimientos')
      .select('id')
      .eq('tenant_id', tenantB.id)
      .single<{ id: string }>()
    const { error } = await admin
      .from('fondo_movimientos')
      .update({ descripcion: 'editado' })
      .eq('id', mov?.id ?? '')
    expect(error).not.toBeNull()
  })
})
